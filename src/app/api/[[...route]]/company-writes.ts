import { eq } from "drizzle-orm";
import type { Transaction } from "@/db";
import {
  type AuditChange,
  companyTable,
  memberTable,
  sectorTable,
} from "@/db/schema";
import {
  type AuditSpec,
  change,
  diffFields,
  formatAudit,
} from "@/lib/audit-diff";
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
  website: { label: "Web Sitesi", format: formatAudit.text },
  companyIntro: { label: "Firma Tanıtımı", format: formatAudit.text },
  foundingDate: { label: "Kuruluş Tarihi", format: formatAudit.date },
  employeeCount: {
    label: "Çalışan Sayısı",
    format: (value) => (value == null ? "—" : String(value)),
  },
};

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

async function sectorName(tx: Transaction, id: number | null | undefined) {
  if (id == null) return null;
  const [row] = await tx
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
 * which the caller deletes after the transaction commits.
 */
export async function deleteCompanyIfOrphaned(
  tx: Transaction,
  companyId: number,
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

  await tx.delete(companyTable).where(eq(companyTable.id, companyId));
  const files = [
    company.logo,
    company.logoOriginal,
    company.activityDocument,
  ].filter((file): file is string => Boolean(file));
  return { deleted: true, files };
}
