import { eq } from "drizzle-orm";
import type { Executor, Transaction } from "@/db";
import {
  type AuditChange,
  type AuditField,
  companyTable,
  memberTable,
  sectorTable,
} from "@/db/schema";
import { type AuditActor, recordAudit } from "@/lib/audit";
import {
  type AuditSpec,
  change,
  describeFields,
  describeRedacted,
  diffFields,
  diffRedacted,
  formatAudit,
} from "@/lib/audit-diff";
import { logoOriginalKind } from "@/lib/logo-original";
import { foldTr } from "@/lib/turkish";
import type {
  CompanyFields,
  MemberCompanyInput,
} from "@/lib/zod-schemas/company";

/** Fields of a company shown in the audit log (sector is added by name) */
export const companyAuditSpec: AuditSpec = {
  title: { label: "Ünvan", format: formatAudit.text },
  address: { label: "Adres", format: formatAudit.text },
  phone: { label: "Telefon", format: formatAudit.text },
  foundingDate: { label: "Kuruluş Tarihi", format: formatAudit.date },
};

/**
 * Company fields that came from the membership application: like the
 * applicant's own data, the log records only whether they are set (•••)
 */
export const companyRedactedLabels: Record<string, string> = {
  employeeCount: "Çalışan Sayısı",
  website: "Web Sitesi",
  companyIntro: "Firma Tanıtımı",
  activityDocument: "Faaliyet Belgesi",
};

type CompanyRow = typeof companyTable.$inferSelect;

/** How a logo shows in create and delete entries */
export function logoAuditValue(company: {
  logo: string | null;
  logoOriginal: string | null;
}) {
  if (!company.logo) return "—";
  return company.logoOriginal
    ? `Var (${logoOriginalKind(company.logoOriginal)})`
    : "Var";
}

/**
 * The whole company for create and delete entries, redacted fields as
 * "•••". `prefix` is "Firma: " on a member's entry.
 */
export async function describeCompany(
  executor: Executor,
  company: CompanyRow,
  prefix = "",
): Promise<AuditField[]> {
  const fields = [
    ...describeFields(companyAuditSpec, company),
    {
      label: "Sektör",
      value: (await sectorName(executor, company.sectorId)) ?? "—",
    },
    ...describeRedacted(companyRedactedLabels, company),
    { label: "Logo", value: logoAuditValue(company) },
  ];
  return fields.map((field) => ({
    ...field,
    label: `${prefix}${field.label}`,
  }));
}

/** An "existing" company id that no company has: the route answers 400 */
export class CompanyNotFoundError extends Error {
  constructor() {
    super("Firma bulunamadı");
    this.name = "CompanyNotFoundError";
  }
}

function titleKeyOf(title: string) {
  return foldTr(title).replace(/\s+/g, " ");
}

/** Fields of the company row a CompanyFields value can set */
function columnValues(fields: CompanyFields) {
  const { title, ...rest } = fields;
  return {
    ...rest,
    ...(title === undefined ? {} : { title, titleKey: titleKeyOf(title) }),
  };
}

function newCompanyValues(fields: CompanyFields) {
  const title = fields.title ?? "";
  return { ...fields, title, titleKey: titleKeyOf(title) };
}

/** The sector's name, for audit entries; null for none or a missing one */
export async function sectorName(
  executor: Executor,
  id: number | null | undefined,
) {
  if (id == null) return null;
  const [row] = await executor
    .select({ name: sectorTable.name })
    .from(sectorTable)
    .where(eq(sectorTable.id, id));
  return row?.name ?? null;
}

/**
 * Applies a member form's company choice inside the caller's transaction.
 * "existing" edits the shared company (the diffs come back as "Firma: …"
 * changes), "new" inserts one, "none" detaches. Logo and activity document
 * files are the member route's job.
 */
export async function applyMemberCompany(
  tx: Transaction,
  input: MemberCompanyInput,
  // kept in the signature for the member route's own bookkeeping
  _currentCompanyId: number | null,
): Promise<{
  companyId: number | null;
  changes: AuditChange[];
  createdCompany: boolean;
}> {
  if (input.mode === "none") {
    return { companyId: null, changes: [], createdCompany: false };
  }

  if (input.mode === "new") {
    const [row] = await tx
      .insert(companyTable)
      .values(newCompanyValues(input.fields))
      .returning({ id: companyTable.id });
    return { companyId: row.id, changes: [], createdCompany: true };
  }

  // lock the row so two members editing the same company don't interleave
  const [before] = await tx
    .select()
    .from(companyTable)
    .where(eq(companyTable.id, input.id))
    .for("update");
  if (!before) throw new CompanyNotFoundError();

  const { fields } = input;
  const diffs = [
    ...diffFields(companyAuditSpec, before, fields),
    ...diffRedacted(companyRedactedLabels, before, fields),
    ...("sectorId" in fields && fields.sectorId !== undefined
      ? change(
          "Sektör",
          await sectorName(tx, before.sectorId),
          await sectorName(tx, fields.sectorId),
        )
      : []),
  ];
  const changes = diffs.map((c) => ({ ...c, label: `Firma: ${c.label}` }));

  if (Object.keys(fields).length > 0) {
    await tx
      .update(companyTable)
      .set(columnValues(fields))
      .where(eq(companyTable.id, input.id));
  }
  return { companyId: input.id, changes, createdCompany: false };
}

/**
 * Deletes the company when no member points to it. Returns its stored files,
 * which the caller deletes after the transaction commits. With `audit`, a
 * deletion is recorded as its own company entry with the whole company.
 */
export async function deleteCompanyIfOrphaned(
  tx: Transaction,
  companyId: number,
  audit?: { actor: AuditActor },
): Promise<{ deleted: boolean; files: string[] }> {
  // the row lock serializes with applyMemberCompany and other deletes
  const [company] = await tx
    .select()
    .from(companyTable)
    .where(eq(companyTable.id, companyId))
    .for("update");
  if (!company) return { deleted: false, files: [] };

  const members = await tx.$count(
    memberTable,
    eq(memberTable.companyId, companyId),
  );
  if (members > 0) return { deleted: false, files: [] };

  // read before the delete: the sector's name is looked up by id
  const details = audit ? await describeCompany(tx, company) : [];
  await tx.delete(companyTable).where(eq(companyTable.id, companyId));
  if (audit) {
    await recordAudit(tx, {
      actor: audit.actor,
      action: "delete",
      entityType: "company",
      entityId: companyId,
      entityLabel: company.title,
      details,
    });
  }
  const files = [
    company.logo,
    company.logoOriginal,
    company.activityDocument,
  ].filter((file): file is string => Boolean(file));
  return { deleted: true, files };
}
