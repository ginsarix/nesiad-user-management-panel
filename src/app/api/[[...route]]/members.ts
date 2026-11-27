import { zValidator } from "@hono/zod-validator";
import { and, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { db, type Executor, type Transaction } from "@/db";
import {
  type AuditChange,
  type AuditField,
  accrualTable,
  collectionTable,
  companyTable,
  memberTable,
  projectPledgeTable,
  sectorTable,
} from "@/db/schema";
import { sendApplicationNotices } from "@/lib/application-notices";
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
import { deleteFiles } from "@/lib/file-storage";
import { memberName } from "@/lib/member-name";
import {
  hasMemberRecords,
  type MemberRecordCounts,
  memberRecordsText,
} from "@/lib/member-records";
import { isEstablished, type MemberStatus } from "@/lib/member-status";
import { maskNationalId } from "@/lib/national-id";
import { NOTICE_OUTCOME_LABELS } from "@/lib/notice-outcome";
import { netgsmClient } from "@/lib/sms/netgsm";
import { compareTr } from "@/lib/turkish";
import {
  createMemberSchema,
  MAX_MEMBER_REQUEST_SIZE,
  updateMemberSchema,
} from "@/lib/zod-schemas/member";
import {
  type MemberDecision,
  memberDecisionSchema,
} from "@/lib/zod-schemas/member-decision";
import {
  applyMemberCompany,
  CompanyNotFoundError,
  companyRedactedLabels,
  deleteCompanyIfOrphaned,
  describeCompany,
  sectorName,
} from "./company-writes";
import { FOREIGN_KEY_VIOLATION, pgErrorCode } from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import {
  LOGO_ORIGINAL_ALONE_ERROR,
  logoChangeSide,
  photoAuditValue,
  photoChangeSides,
  requireMultipart,
  type StoredFormFiles,
  type StoredLogo,
  storedFileNames,
  storeFormFiles,
} from "./member-files";
import {
  InvalidOrganizationsError,
  memberOrganizationsText,
  StaleOrganizationsError,
  selectMemberOrganizations,
  syncMemberOrganizations,
} from "./member-organizations";
import { idParamSchema, respondWithFirstIssue } from "./validation";

const MEMBER_NOT_FOUND_ERROR = "Üye bulunamadı";
const MISSING_SECTOR_ERROR = "Seçilen sektör bulunamadı";
const MISSING_LINK_ERROR = "Seçilen grup veya görev bulunamadı";
const NO_COMPANY_ERROR = "Üyenin firması yok";
const STATUS_LOCKED_ERROR = "Bu üyenin durumu buradan değiştirilemez";

/** A logo, removeLogo or Faaliyet Belgesi for a member without a company (400) */
class NoCompanyError extends Error {}

/** The member's own fields, logged with their values */
const memberAuditSpec: AuditSpec = {
  firstName: { label: "Adı", format: formatAudit.text },
  lastName: { label: "Soyadı", format: formatAudit.text },
  companyRole: { label: "Görev", format: formatAudit.text },
  status: { label: "Durum", format: formatAudit.memberStatus },
  memberLoginDate: { label: "Üye Giriş Tarihi", format: formatAudit.date },
  email: { label: "E-posta", format: formatAudit.text },
  mobilePhone: { label: "Cep Telefonu", format: formatAudit.text },
  birthDate: { label: "Doğum Tarihi", format: formatAudit.date },
  poPositiveCardNo: { label: "PO Positive Card No", format: formatAudit.text },
  notes: { label: "Notlar", format: formatAudit.text },
};

/**
 * Data from the membership application. Its values are personal data: the
 * log records only that a value was set or cleared ("•••", see
 * `diffRedacted`), in changes and in create and delete entries alike.
 */
const applicantAuditLabels: Record<string, string> = {
  birthPlace: "Doğum Yeri",
  nationalId: "TC Kimlik No",
  education: "Eğitim Durumu",
  otherAssociations: "Dernek, meslek grupları",
  gender: "Cinsiyet",
  referenceName: "Referans",
  identityDocument: "Kimlik Belgesi",
};

/** Staff write the rejection note about the applicant, so it's redacted too */
const REJECTION_NOTE_AUDIT_LABEL = { rejectionNote: "Ret Notu" };

/** Set only by the public application; never changed by staff */
const CONSENT_AUDIT_LABEL = { consentedAt: "Açık Rıza Onayı" };

const requestBodyLimit = bodyLimit({
  maxSize: MAX_MEMBER_REQUEST_SIZE,
  onError: (c) => c.json({ error: "Dosyalar 5 MB'dan küçük olmalıdır" }, 413),
});

/** The member's fields every list shows */
const listColumns = {
  id: memberTable.id,
  firstName: memberTable.firstName,
  lastName: memberTable.lastName,
  status: memberTable.status,
  memberLoginDate: memberTable.memberLoginDate,
  birthDate: memberTable.birthDate,
  mobilePhone: memberTable.mobilePhone,
  email: memberTable.email,
  photo: memberTable.photo,
  companyRole: memberTable.companyRole,
  poPositiveCardNo: memberTable.poPositiveCardNo,
  notes: memberTable.notes,
  createdAt: memberTable.createdAt,
};

/** The application's fields; the TC number is masked before it's sent */
const applicantColumns = {
  birthPlace: memberTable.birthPlace,
  education: memberTable.education,
  otherAssociations: memberTable.otherAssociations,
  gender: memberTable.gender,
  referenceName: memberTable.referenceName,
  identityDocument: memberTable.identityDocument,
  consentedAt: memberTable.consentedAt,
  rejectionNote: memberTable.rejectionNote,
  updatedAt: memberTable.updatedAt,
};

const companySummaryColumns = {
  id: companyTable.id,
  title: companyTable.title,
  logo: companyTable.logo,
  sectorId: companyTable.sectorId,
  phone: companyTable.phone,
  address: companyTable.address,
  foundingDate: companyTable.foundingDate,
};

const companyDetailColumns = {
  ...companySummaryColumns,
  logoOriginal: companyTable.logoOriginal,
  website: companyTable.website,
  companyIntro: companyTable.companyIntro,
  activityDocument: companyTable.activityDocument,
  employeeCount: companyTable.employeeCount,
};

/** How many members each company has */
function companyMemberCounts() {
  return db
    .select({
      companyId: memberTable.companyId,
      memberCount: sql<number>`count(*)::int`.as("member_count"),
    })
    .from(memberTable)
    .groupBy(memberTable.companyId)
    .as("company_member_count");
}

/** Every member with their company's summary; no TC number or documents */
async function listMembers() {
  const counts = companyMemberCounts();
  const rows = await db
    .select({
      ...listColumns,
      company: companySummaryColumns,
      sectorName: sectorTable.name,
      memberCount: counts.memberCount,
    })
    .from(memberTable)
    .leftJoin(companyTable, eq(memberTable.companyId, companyTable.id))
    .leftJoin(sectorTable, eq(companyTable.sectorId, sectorTable.id))
    .leftJoin(counts, eq(counts.companyId, companyTable.id));

  return rows.map(({ company, sectorName, memberCount, ...member }) => ({
    ...member,
    name: memberName(member),
    company: company && {
      ...company,
      sectorName,
      memberCount: memberCount ?? 0,
    },
  }));
}

/**
 * The tahsilatlar, taahhütler and tahakkuk rows of a member. One query at
 * a time: inside a transaction they share one connection.
 */
async function recordCounts(executor: Executor, id: number) {
  const collections = await executor.$count(
    collectionTable,
    eq(collectionTable.memberId, id),
  );
  const pledges = await executor.$count(
    projectPledgeTable,
    eq(projectPledgeTable.memberId, id),
  );
  const accruals = await executor.$count(
    accrualTable,
    eq(accrualTable.memberId, id),
  );
  return { collections, pledges, accruals };
}

/** null counts when a record added during the delete stopped it */
function hasRecordsError(counts: MemberRecordCounts) {
  return `Bu üyeye ait ${memberRecordsText(counts)} var. Silmek yerine pasif yapabilirsiniz.`;
}

/** The member with the application, company, groups and record counts */
async function loadMemberDetail(id: number) {
  const counts = companyMemberCounts();
  const [row] = await db
    .select({
      ...listColumns,
      ...applicantColumns,
      nationalId: memberTable.nationalId,
      company: companyDetailColumns,
      sectorName: sectorTable.name,
      memberCount: counts.memberCount,
    })
    .from(memberTable)
    .leftJoin(companyTable, eq(memberTable.companyId, companyTable.id))
    .leftJoin(sectorTable, eq(companyTable.sectorId, sectorTable.id))
    .leftJoin(counts, eq(counts.companyId, companyTable.id))
    .where(eq(memberTable.id, id));
  if (!row) return null;

  const { company, sectorName, memberCount, nationalId, ...member } = row;
  const [otherMembers, organizations, records] = await Promise.all([
    company
      ? db
          .select({
            id: memberTable.id,
            firstName: memberTable.firstName,
            lastName: memberTable.lastName,
            status: memberTable.status,
          })
          .from(memberTable)
          .where(
            and(eq(memberTable.companyId, company.id), ne(memberTable.id, id)),
          )
      : [],
    selectMemberOrganizations(id),
    // a member with any of these can't be deleted; the page says so
    recordCounts(db, id),
  ]);

  return {
    ...member,
    name: memberName(member),
    nationalIdMasked: nationalId ? maskNationalId(nationalId) : null,
    company: company && {
      ...company,
      sectorName,
      memberCount: memberCount ?? 0,
      otherMembers: otherMembers
        .map((other) => ({
          id: other.id,
          name: memberName(other),
          status: other.status,
        }))
        .sort((a, b) => compareTr(a.name, b.name)),
    },
    organizations,
    recordCounts: records,
  };
}

type MemberRow = typeof memberTable.$inferSelect;
type CompanyRow = typeof companyTable.$inferSelect;

async function loadCompany(executor: Executor, id: number | null) {
  if (id === null) return null;
  const [company] = await executor
    .select()
    .from(companyTable)
    .where(eq(companyTable.id, id));
  return company ?? null;
}

/** The whole member for create and delete entries, personal data as "•••" */
async function describeMember(
  tx: Transaction,
  member: MemberRow,
  company: CompanyRow | null,
): Promise<AuditField[]> {
  return [
    ...describeFields(memberAuditSpec, member),
    { label: "Fotoğraf", value: photoAuditValue(member.photo) },
    ...describeRedacted(
      {
        ...applicantAuditLabels,
        ...REJECTION_NOTE_AUDIT_LABEL,
        ...CONSENT_AUDIT_LABEL,
      },
      member,
    ),
    ...(company
      ? await describeCompany(tx, company, "Firma: ")
      : [{ label: "Firma", value: "—" }]),
    {
      label: "Organizasyonlar",
      value: await memberOrganizationsText(tx, member.id),
    },
  ];
}

/**
 * Puts an uploaded (or removed) logo and Faaliyet Belgesi on the company.
 * Returns the "Firma: …" changes and the files they replaced, which are
 * deleted only after the commit.
 */
async function applyCompanyFiles(
  tx: Transaction,
  companyId: number,
  files: { logo?: StoredLogo | null; activityDocument?: string },
) {
  if (files.logo === undefined && files.activityDocument === undefined) {
    return { changes: [], replaced: [] };
  }
  const [before] = await tx
    .select({
      logo: companyTable.logo,
      logoOriginal: companyTable.logoOriginal,
      activityDocument: companyTable.activityDocument,
    })
    .from(companyTable)
    .where(eq(companyTable.id, companyId))
    .for("update");

  const logoValues =
    files.logo === undefined
      ? {}
      : {
          logo: files.logo?.logo ?? null,
          logoOriginal: files.logo?.logoOriginal ?? null,
        };
  const documentValues =
    files.activityDocument === undefined
      ? {}
      : { activityDocument: files.activityDocument };
  await tx
    .update(companyTable)
    .set({ ...logoValues, ...documentValues })
    .where(eq(companyTable.id, companyId));

  const changes: AuditChange[] = [
    ...(files.logo === undefined
      ? []
      : change(
          "Firma: Logo",
          logoChangeSide("Eski", before),
          logoChangeSide("Yeni", files.logo),
        )),
    ...diffRedacted(
      { activityDocument: `Firma: ${companyRedactedLabels.activityDocument}` },
      before,
      documentValues,
    ),
  ];
  const replaced = [
    ...(files.logo === undefined ? [] : [before.logo, before.logoOriginal]),
    ...(files.activityDocument === undefined ? [] : [before.activityDocument]),
  ];
  return { changes, replaced };
}

/**
 * A company made by a member's update, as "Firma: …" changes from "—" to
 * each set field (personal ones as "•••"), so the one entry holds it whole
 */
async function createdCompanyChanges(
  tx: Transaction,
  companyId: number | null,
): Promise<AuditChange[]> {
  const company = await loadCompany(tx, companyId);
  if (!company) return [];
  const fields = await describeCompany(tx, company, "Firma: ");
  return fields.flatMap((field) => change(field.label, null, field.value));
}

/** A recorded company deletion when the member was the company's last one */
function removeIfOrphaned(
  tx: Transaction,
  companyId: number | null,
  actor: AuditActor,
) {
  if (companyId === null) return { files: [] };
  return deleteCompanyIfOrphaned(tx, companyId, { actor });
}

/** The response for a refused save, or null when `error` isn't one */
function refusedSaveResponse(error: unknown) {
  if (error instanceof CompanyNotFoundError) {
    return { body: { error: error.message }, status: 400 as const };
  }
  if (error instanceof NoCompanyError) {
    return { body: { error: NO_COMPANY_ERROR }, status: 400 as const };
  }
  if (error instanceof InvalidOrganizationsError) {
    return { body: { error: error.message }, status: 400 as const };
  }
  if (error instanceof StaleOrganizationsError) {
    return { body: { error: error.message }, status: 409 as const };
  }
  // a sector, group or görev deleted while the form was open
  if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
    return {
      body: {
        error: violatedConstraint(error).includes("sector")
          ? MISSING_SECTOR_ERROR
          : MISSING_LINK_ERROR,
      },
      status: 400 as const,
    };
  }
  return null;
}

function violatedConstraint(error: unknown) {
  const cause = (error as { cause?: { constraint?: unknown } }).cause;
  return typeof cause?.constraint === "string" ? cause.constraint : "";
}

/** Fields an update leaves alone are undefined; drizzle wants them gone */
function definedValues<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** What each decision needs, where it leads and which notice it sends */
const DECISIONS = {
  accept: {
    from: "candidate",
    to: "active",
    action: "application_accept",
    notice: "accepted",
  },
  add_passive: {
    from: "candidate",
    to: "passive",
    action: "application_add_passive",
    notice: null,
  },
  reject: {
    from: "candidate",
    to: "rejected",
    action: "application_reject",
    notice: "rejected",
  },
  reopen: {
    from: "rejected",
    to: "candidate",
    action: "application_reopen",
    notice: null,
  },
} as const satisfies Record<
  MemberDecision["decision"],
  {
    from: MemberStatus;
    to: MemberStatus;
    action: string;
    notice: "accepted" | "rejected" | null;
  }
>;

const STALE_DECISION_ERROR =
  "Bu başvurunun durumu değişmiş. Sayfayı yenileyin.";

type DecisionResult =
  | { kind: "missing" }
  | { kind: "stale" }
  | { kind: "done"; member: MemberRow; companyTitle: string | null };

/**
 * The status change and its audit entry, in one transaction. The update only
 * matches while the member still has the status the decision starts from, so
 * of two simultaneous decisions exactly one gets through. Kabul Et and Pasif
 * olarak ekle also set the sector, which is the company's.
 */
async function applyDecision(
  id: number,
  decision: MemberDecision,
  actor: AuditActor,
): Promise<DecisionResult> {
  const rule = DECISIONS[decision.decision];
  const loginDate =
    "memberLoginDate" in decision
      ? { memberLoginDate: decision.memberLoginDate }
      : {};
  // a rejection note belongs to the rejection only: Tekrar Aday yap clears it
  const rejectionNote =
    decision.decision === "reject"
      ? { rejectionNote: decision.note ?? null }
      : decision.decision === "reopen"
        ? { rejectionNote: null }
        : {};

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(memberTable)
      .where(eq(memberTable.id, id));
    if (!existing) return { kind: "missing" } as const;

    const [member] = await tx
      .update(memberTable)
      .set({ status: rule.to, ...loginDate, ...rejectionNote })
      .where(and(eq(memberTable.id, id), eq(memberTable.status, rule.from)))
      .returning();
    if (!member) return { kind: "stale" } as const;

    let company = await loadCompany(tx, member.companyId);
    let sectorChanges: AuditChange[] = [];
    if ("sectorId" in decision) {
      if (!company && decision.sectorId !== null) throw new NoCompanyError();
      if (company) {
        const before = await sectorName(tx, company.sectorId);
        [company] = await tx
          .update(companyTable)
          .set({ sectorId: decision.sectorId })
          .where(eq(companyTable.id, company.id))
          .returning();
        sectorChanges = change(
          "Firma: Sektör",
          before,
          await sectorName(tx, decision.sectorId),
        );
      }
    }

    await recordAudit(tx, {
      actor,
      action: rule.action,
      entityType: "member",
      entityId: id,
      entityLabel: memberName(member),
      changes: [
        ...diffFields(memberAuditSpec, existing, {
          status: rule.to,
          ...loginDate,
        }),
        ...sectorChanges,
        // written about the applicant, so kept out of the log like their own data
        ...diffRedacted(REJECTION_NOTE_AUDIT_LABEL, existing, rejectionNote),
      ],
    });
    return {
      kind: "done",
      member,
      companyTitle: company?.title ?? null,
    } as const;
  });
}

export const membersRoute = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await listMembers()))
  .get(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const member = await loadMemberDetail(id);
      if (!member) return c.json({ error: MEMBER_NOT_FOUND_ERROR }, 404);
      return c.json(member, 200);
    },
  )
  .get(
    "/:id/national-id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");

      const [member] = await db
        .select({ nationalId: memberTable.nationalId })
        .from(memberTable)
        .where(eq(memberTable.id, id));

      if (!member) return c.json({ error: MEMBER_NOT_FOUND_ERROR }, 404);

      return c.json({ nationalId: member.nationalId }, 200, {
        "Cache-Control": "no-store",
      });
    },
  )
  .post(
    "/",
    requireMultipart,
    requestBodyLimit,
    zValidator("form", createMemberSchema, respondWithFirstIssue),
    async (c) => {
      const {
        company = { mode: "none" },
        organizations = [],
        photo,
        logo,
        logoOriginal,
        identityDocument,
        activityDocument,
        ...fields
      } = c.req.valid("form");

      if (logoOriginal && !logo) {
        return c.json({ error: LOGO_ORIGINAL_ALONE_ERROR }, 400);
      }
      if ((logo || activityDocument) && company.mode === "none") {
        return c.json({ error: NO_COMPANY_ERROR }, 400);
      }

      const files = await storeFormFiles({
        photo,
        logo,
        logoOriginal,
        identityDocument,
        activityDocument,
      });
      if ("error" in files) return c.json({ error: files.error }, 415);
      const { stored } = files;
      const actor = actorOf(c);

      try {
        const { id, replaced } = await db.transaction(async (tx) => {
          const applied = await applyMemberCompany(tx, company, null);
          const companyFiles =
            applied.companyId === null
              ? { changes: [], replaced: [] }
              : await applyCompanyFiles(tx, applied.companyId, {
                  logo: stored.logo,
                  activityDocument: stored.activityDocument,
                });

          const [member] = await tx
            .insert(memberTable)
            .values({
              ...fields,
              companyId: applied.companyId,
              photo: stored.photo ?? null,
              identityDocument: stored.identityDocument ?? null,
            })
            .returning();

          await syncMemberOrganizations(tx, {
            memberId: member.id,
            rows: organizations,
            active: member.status === "active",
            actor,
          });

          await recordAudit(tx, {
            actor,
            action: "create",
            entityType: "member",
            entityId: member.id,
            entityLabel: memberName(member),
            details: await describeMember(
              tx,
              member,
              await loadCompany(tx, applied.companyId),
            ),
            // an existing company edited from the form; a new one is in details
            changes: applied.createdCompany
              ? []
              : [...applied.changes, ...companyFiles.changes],
          });
          return { id: member.id, replaced: companyFiles.replaced };
        });

        await deleteFiles(replaced);
        return c.json({ id, message: "Üye başarıyla kaydedildi" }, 201);
      } catch (error) {
        await deleteFiles(storedFileNames(stored));
        const refused = refusedSaveResponse(error);
        if (refused) return c.json(refused.body, refused.status);
        throw error;
      }
    },
  )
  .patch(
    "/:id",
    requireMultipart,
    requestBodyLimit,
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("form", updateMemberSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const {
        company,
        organizations,
        photo,
        removePhoto,
        logo,
        logoOriginal,
        removeLogo,
        identityDocument,
        activityDocument,
        ...fields
      } = c.req.valid("form");

      if (logoOriginal && !logo) {
        return c.json({ error: LOGO_ORIGINAL_ALONE_ERROR }, 400);
      }

      const files = await storeFormFiles({
        photo,
        logo,
        logoOriginal,
        identityDocument,
        activityDocument,
      });
      if ("error" in files) return c.json({ error: files.error }, 415);
      const { stored } = files;
      const actor = actorOf(c);

      try {
        const result = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(memberTable)
            .where(eq(memberTable.id, id))
            .for("update");
          if (!existing) return { kind: "missing" } as const;

          if (fields.status !== undefined && !isEstablished(existing.status)) {
            return { kind: "status_locked" } as const;
          }

          const oldCompany = await loadCompany(tx, existing.companyId);
          const applied = company
            ? await applyMemberCompany(tx, company, existing.companyId)
            : {
                companyId: existing.companyId,
                changes: [],
                createdCompany: false,
              };
          const { companyId } = applied;
          const movedCompany = companyId !== existing.companyId;

          // undefined keeps the current logo, null removes it
          const newLogo: StoredLogo | null | undefined =
            stored.logo ?? (removeLogo ? null : undefined);
          if (
            companyId === null &&
            (newLogo !== undefined || stored.activityDocument)
          ) {
            throw new NoCompanyError();
          }
          const companyFiles =
            companyId === null
              ? { changes: [], replaced: [] }
              : await applyCompanyFiles(tx, companyId, {
                  logo: newLogo,
                  activityDocument: stored.activityDocument,
                });

          const newPhoto = photoUpdate(stored, removePhoto);
          const values = definedValues({
            ...fields,
            ...(movedCompany && { companyId }),
            ...(newPhoto !== undefined && { photo: newPhoto }),
            identityDocument: stored.identityDocument,
          });
          if (Object.keys(values).length > 0) {
            await tx
              .update(memberTable)
              .set(values)
              .where(eq(memberTable.id, id));
          }

          let organizationChanges: AuditChange[] = [];
          if (organizations) {
            const before = await memberOrganizationsText(tx, id);
            await syncMemberOrganizations(tx, {
              memberId: id,
              rows: organizations,
              active: (fields.status ?? existing.status) === "active",
              actor,
            });
            organizationChanges = change(
              "Organizasyonlar",
              before,
              await memberOrganizationsText(tx, id),
            );
          }

          // the member's audit entry first, then the company's deletion
          const companyChanges = movedCompany
            ? change(
                "Firma",
                oldCompany?.title,
                (await loadCompany(tx, companyId))?.title,
              )
            : [];
          const changes = [
            ...diffFields(memberAuditSpec, existing, fields),
            ...diffRedacted(applicantAuditLabels, existing, {
              ...fields,
              identityDocument: stored.identityDocument,
            }),
            ...(newPhoto === undefined
              ? []
              : change(
                  "Fotoğraf",
                  ...photoChangeSides(existing.photo, newPhoto),
                )),
            ...companyChanges,
            // a company made by this save is recorded whole, files included
            ...(applied.createdCompany
              ? await createdCompanyChanges(tx, companyId)
              : [...applied.changes, ...companyFiles.changes]),
            ...organizationChanges,
          ];
          if (changes.length > 0) {
            await recordAudit(tx, {
              actor,
              action: "update",
              entityType: "member",
              entityId: id,
              entityLabel: memberName({
                firstName: fields.firstName ?? existing.firstName,
                lastName: fields.lastName ?? existing.lastName,
              }),
              changes,
            });
          }

          const orphan = movedCompany
            ? await removeIfOrphaned(tx, existing.companyId, actor)
            : { files: [] };

          return {
            kind: "done" as const,
            replaced: [
              ...(newPhoto === undefined ? [] : [existing.photo]),
              ...(stored.identityDocument ? [existing.identityDocument] : []),
              ...companyFiles.replaced,
              ...orphan.files,
            ],
          };
        });

        if (result.kind !== "done") {
          await deleteFiles(storedFileNames(stored));
          if (result.kind === "missing") {
            return c.json({ error: MEMBER_NOT_FOUND_ERROR }, 404);
          }
          return c.json({ error: STATUS_LOCKED_ERROR }, 409);
        }

        // only now: a failed save keeps the old files
        await deleteFiles(result.replaced);
        return c.json({ id, message: "Üye güncellendi" }, 200);
      } catch (error) {
        await deleteFiles(storedFileNames(stored));
        const refused = refusedSaveResponse(error);
        if (refused) return c.json(refused.body, refused.status);
        throw error;
      }
    },
  )
  .delete(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const actor = actorOf(c);

      const result = await db
        .transaction(async (tx) => {
          // tahsilatlar, taahhütler and tahakkuk rows keep their member:
          // refuse while it has any
          const counts = await recordCounts(tx, id);
          if (hasMemberRecords(counts)) return { refused: counts };

          const [member] = await tx
            .select()
            .from(memberTable)
            .where(eq(memberTable.id, id))
            .for("update");
          if (!member) return null;

          // its Organizasyon rows cascade away with it, so name them now
          const details = await describeMember(
            tx,
            member,
            await loadCompany(tx, member.companyId),
          );

          await tx.delete(memberTable).where(eq(memberTable.id, id));
          await recordAudit(tx, {
            actor,
            action: "delete",
            entityType: "member",
            entityId: id,
            entityLabel: memberName(member),
            details,
          });
          const orphan = await removeIfOrphaned(tx, member.companyId, actor);

          return {
            files: [member.photo, member.identityDocument, ...orphan.files],
          };
        })
        .catch((error) => {
          // a tahsilat or taahhüt added between the count and the delete
          if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
            return { refused: null };
          }
          throw error;
        });

      if (!result) return c.json({ error: MEMBER_NOT_FOUND_ERROR }, 404);
      if ("refused" in result) {
        return c.json({ error: hasRecordsError(result.refused ?? null) }, 409);
      }
      // after the commit, so a failed delete keeps the member's files
      await deleteFiles(result.files);

      return c.json({ message: "Üye silindi" }, 200);
    },
  )
  .post(
    "/:id/decision",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("json", memberDecisionSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const decision = c.req.valid("json");
      const rule = DECISIONS[decision.decision];

      let result: DecisionResult;
      try {
        result = await applyDecision(id, decision, actorOf(c));
      } catch (error) {
        if (error instanceof NoCompanyError) {
          return c.json({ error: NO_COMPANY_ERROR }, 400);
        }
        if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
          return c.json({ error: MISSING_SECTOR_ERROR }, 400);
        }
        throw error;
      }
      if (result.kind === "missing") {
        return c.json({ error: MEMBER_NOT_FOUND_ERROR }, 404);
      }
      if (result.kind === "stale") {
        return c.json({ error: STALE_DECISION_ERROR }, 409);
      }

      // the decision is committed; from here on nothing may undo it
      if (!rule.notice) return c.json({ status: rule.to, notices: null }, 200);

      const { member, companyTitle } = result;
      const notices = await sendApplicationNotices(rule.notice, {
        title: companyTitle ?? "",
        applicantFirstName: member.firstName,
        applicantLastName: member.lastName,
        email: member.email,
        mobilePhone: member.mobilePhone,
      });
      try {
        await recordAudit(db, {
          actor: actorOf(c),
          action: "application_notice",
          entityType: "member",
          entityId: id,
          entityLabel: memberName(member),
          details: [
            { label: "E-posta", value: NOTICE_OUTCOME_LABELS[notices.email] },
            { label: "SMS", value: NOTICE_OUTCOME_LABELS[notices.sms] },
            ...(netgsmClient().dryRun
              ? [{ label: "Mod", value: "Deneme (SMS gönderilmedi)" }]
              : []),
          ],
        });
      } catch (error) {
        console.error("Application notice audit entry failed", error);
      }

      return c.json({ status: rule.to, notices }, 200);
    },
  );

/** undefined keeps the current photo, null removes it */
function photoUpdate(stored: StoredFormFiles, removePhoto?: boolean) {
  if (stored.photo) return stored.photo;
  return removePhoto ? null : undefined;
}
