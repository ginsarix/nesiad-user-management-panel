import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, getColumns } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { db, type Executor } from "@/db";
import {
  authorizedRepresentativeTable,
  membersRepresentativesTable,
  memberTable,
  sectorTable,
} from "@/db/schema";
import {
  type NoticeOutcome,
  sendApplicationNotices,
} from "@/lib/application-notices";
import { recordAudit } from "@/lib/audit";
import {
  type AuditSpec,
  change,
  describeFields,
  diffFields,
  diffRedacted,
  formatAudit,
} from "@/lib/audit-diff";
import { createFile, deleteFiles } from "@/lib/file-storage";
import { isEstablished, type MemberStatus } from "@/lib/member-status";
import { maskNationalId } from "@/lib/national-id";
import { netgsmClient } from "@/lib/sms/netgsm";
import { DOCUMENT_MIME_TYPES, storeUpload } from "@/lib/uploads";
import {
  createMemberSchema,
  MAX_REQUEST_SIZE,
  updateMemberSchema,
} from "@/lib/zod-schemas/member";
import {
  type MemberDecision,
  memberDecisionSchema,
} from "@/lib/zod-schemas/member-decision";
import { FOREIGN_KEY_VIOLATION, pgErrorCode } from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import { idParamSchema, respondWithFirstIssue } from "./validation";

const {
  nationalId: _nationalId,
  identityDocument: _identityDocument,
  activityDocument: _activityDocument,
  ...listColumns
} = getColumns(memberTable);

/** Members with their sector's name next to its id; no TC number or documents */
function selectMembers(executor: Executor = db) {
  return executor
    .select({ ...listColumns, sector: sectorTable.name })
    .from(memberTable)
    .leftJoin(sectorTable, eq(memberTable.sectorId, sectorTable.id));
}

/** Every column, TC number included: for the detail, PATCH and DELETE, never sent out whole */
function selectFullMember(executor: Executor = db) {
  return executor
    .select({ ...getColumns(memberTable), sector: sectorTable.name })
    .from(memberTable)
    .leftJoin(sectorTable, eq(memberTable.sectorId, sectorTable.id));
}

const MISSING_SECTOR_ERROR = "Seçilen sektör bulunamadı";

/** Representatives joined to their member, optionally for a single member */
function selectRepresentatives(memberId?: number, executor: Executor = db) {
  return executor
    .select({
      memberId: membersRepresentativesTable.memberId,
      id: authorizedRepresentativeTable.id,
      name: authorizedRepresentativeTable.name,
      phone: authorizedRepresentativeTable.phone,
      active: authorizedRepresentativeTable.active,
      role: membersRepresentativesTable.role,
    })
    .from(membersRepresentativesTable)
    .innerJoin(
      authorizedRepresentativeTable,
      eq(
        membersRepresentativesTable.authorizedRepresentativeId,
        authorizedRepresentativeTable.id,
      ),
    )
    .where(
      memberId === undefined
        ? undefined
        : eq(membersRepresentativesTable.memberId, memberId),
    )
    .orderBy(asc(authorizedRepresentativeTable.name));
}

/**
 * Stores a staff-uploaded logo after checking its actual contents are an
 * image. Resolves to null when the file is not an image.
 */
async function saveLogo(logo: File) {
  const buffer = await logo.arrayBuffer();
  const fileType = await fileTypeFromBuffer(buffer);
  if (!fileType?.mime.startsWith("image/")) return null;

  return await createFile({
    buffer: Buffer.from(buffer),
    filename: logo.name,
    ext: fileType.ext,
  });
}

const requestBodyLimit = bodyLimit({
  // a logo and two documents plus some room for the text fields
  maxSize: MAX_REQUEST_SIZE,
  onError: (c) => c.json({ error: "Dosyalar 5 MB'dan küçük olmalıdır" }, 413),
});

const NOT_A_DOCUMENT_ERROR = "Sadece PDF, PNG veya JPG dosyaları kabul edilir";

/**
 * Applicant fields in the audit log. Their values are personal data: staff
 * edits record only that a value was set or cleared (see `diffRedacted`), and
 * none of them is in `memberAuditSpec`, so create and delete entries skip them.
 */
const applicantAuditLabels: Record<string, string> = {
  applicantFirstName: "Başvuran Adı",
  applicantLastName: "Başvuran Soyadı",
  applicantRole: "Başvuran Görevi",
  employeeCount: "Çalışan Sayısı",
  website: "Web Sitesi",
  email: "E-posta",
  mobilePhone: "Cep Telefonu",
  birthDate: "Doğum Tarihi",
  birthPlace: "Doğum Yeri",
  nationalId: "TC Kimlik No",
  education: "Eğitim Durumu",
  otherAssociations: "Üye Olunan Diğer Dernekler",
  companyIntro: "Firma Tanıtımı",
  gender: "Cinsiyet",
  referenceName: "Referans",
  identityDocument: "Kimlik Belgesi",
  activityDocument: "Faaliyet Belgesi",
};

type DocumentField = "identityDocument" | "activityDocument";
const DOCUMENT_FIELDS: DocumentField[] = [
  "identityDocument",
  "activityDocument",
];

/**
 * Stores the uploaded documents. When one isn't a PDF/PNG/JPG, the ones
 * already stored are deleted again and `rejected` is true.
 */
async function storeDocuments(files: Partial<Record<DocumentField, File>>) {
  const stored: Partial<Record<DocumentField, string>> = {};
  for (const field of DOCUMENT_FIELDS) {
    const file = files[field];
    if (!file) continue;
    const name = await storeUpload(file, DOCUMENT_MIME_TYPES, "document");
    if (!name) {
      await deleteFiles(Object.values(stored));
      return { stored: {}, rejected: true };
    }
    stored[field] = name;
  }
  return { stored, rejected: false };
}

/** A member's own fields in the audit log; sector and logo are added apart */
const memberAuditSpec: AuditSpec = {
  title: { label: "Ünvan", format: formatAudit.text },
  status: { label: "Durum", format: formatAudit.memberStatus },
  phone: { label: "Telefon", format: formatAudit.text },
  address: { label: "Adres", format: formatAudit.text },
  memberLoginDate: { label: "Üye Giriş Tarihi", format: formatAudit.date },
  foundingDate: { label: "Kuruluş Tarihi", format: formatAudit.date },
};

async function sectorName(executor: Executor, id: number | null | undefined) {
  if (id == null) return null;
  const [sector] = await executor
    .select({ name: sectorTable.name })
    .from(sectorTable)
    .where(eq(sectorTable.id, id));
  return sector?.name ?? null;
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

const NOTICE_OUTCOME_LABELS: Record<NoticeOutcome, string> = {
  sent: "Gönderildi",
  failed: "Gönderilemedi",
  skipped: "Adres yok",
  unknown: "Yanıt alınamadı",
};

const STALE_DECISION_ERROR =
  "Bu başvurunun durumu değişmiş. Sayfayı yenileyin.";

type DecisionResult =
  | { kind: "missing" }
  | { kind: "stale" }
  | { kind: "done"; member: typeof memberTable.$inferSelect };

/**
 * The status change and its audit entry, in one transaction. The update only
 * matches while the member still has the status the decision starts from, so
 * of two simultaneous decisions exactly one gets through.
 */
async function applyDecision(
  id: number,
  decision: MemberDecision,
  actor: ReturnType<typeof actorOf>,
): Promise<DecisionResult> {
  const rule = DECISIONS[decision.decision];
  const details =
    "memberLoginDate" in decision
      ? {
          memberLoginDate: decision.memberLoginDate,
          sectorId: decision.sectorId,
        }
      : {};

  return await db.transaction(async (tx) => {
    const [existing] = await selectFullMember(tx).where(eq(memberTable.id, id));
    if (!existing) return { kind: "missing" } as const;

    const [member] = await tx
      .update(memberTable)
      .set({ status: rule.to, ...details })
      .where(and(eq(memberTable.id, id), eq(memberTable.status, rule.from)))
      .returning();
    if (!member) return { kind: "stale" } as const;

    await recordAudit(tx, {
      actor,
      action: rule.action,
      entityType: "member",
      entityId: id,
      entityLabel: member.title,
      changes: [
        ...diffFields(memberAuditSpec, existing, {
          status: rule.to,
          ...("memberLoginDate" in details && {
            memberLoginDate: details.memberLoginDate,
          }),
        }),
        ...("sectorId" in details
          ? change(
              "Sektör",
              existing.sector,
              await sectorName(tx, details.sectorId),
            )
          : []),
      ],
    });
    return { kind: "done", member } as const;
  });
}

type MemberRepresentative = Omit<
  Awaited<ReturnType<typeof selectRepresentatives>>[number],
  "memberId"
>;

export const membersRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const [members, representatives] = await Promise.all([
      selectMembers(),
      selectRepresentatives(),
    ]);

    const representativesByMember = new Map<number, MemberRepresentative[]>();
    for (const { memberId, ...representative } of representatives) {
      const list = representativesByMember.get(memberId) ?? [];
      list.push(representative);
      representativesByMember.set(memberId, list);
    }

    return c.json(
      members.map((member) => ({
        ...member,
        representatives: representativesByMember.get(member.id) ?? [],
      })),
    );
  })
  .get(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");

      const [full] = await selectFullMember().where(eq(memberTable.id, id));

      if (!full) return c.json({ error: "Üye bulunamadı" }, 404);

      const representatives = (await selectRepresentatives(id)).map(
        ({ memberId: _, ...representative }) => representative,
      );

      const { nationalId, ...member } = full;
      return c.json(
        {
          ...member,
          nationalIdMasked: nationalId ? maskNationalId(nationalId) : null,
          representatives,
        },
        200,
      );
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

      if (!member) return c.json({ error: "Üye bulunamadı" }, 404);

      return c.json({ nationalId: member.nationalId }, 200, {
        "Cache-Control": "no-store",
      });
    },
  )
  .post(
    "/",
    requestBodyLimit,
    zValidator("form", createMemberSchema, respondWithFirstIssue),
    async (c) => {
      const { logo, identityDocument, activityDocument, ...fields } =
        c.req.valid("form");

      const logoFilename = logo ? await saveLogo(logo) : null;
      if (logo && !logoFilename) {
        return c.json({ error: "Sadece resim dosyaları kabul edilir" }, 415);
      }

      const documents = await storeDocuments({
        identityDocument,
        activityDocument,
      });
      if (documents.rejected) {
        await deleteFiles([logoFilename]);
        return c.json({ error: NOT_A_DOCUMENT_ERROR }, 415);
      }

      try {
        const id = await db.transaction(async (tx) => {
          const [member] = await tx
            .insert(memberTable)
            .values({ ...fields, ...documents.stored, logo: logoFilename })
            .returning();

          await recordAudit(tx, {
            actor: actorOf(c),
            action: "create",
            entityType: "member",
            entityId: member.id,
            entityLabel: member.title,
            details: [
              ...describeFields(memberAuditSpec, member),
              {
                label: "Sektör",
                value: (await sectorName(tx, member.sectorId)) ?? "—",
              },
              { label: "Logo", value: member.logo ? "Var" : "—" },
            ],
          });
          return member.id;
        });

        return c.json({ id, message: "Üye başarıyla kaydedildi" }, 201);
      } catch (error) {
        await deleteFiles([logoFilename, ...Object.values(documents.stored)]);
        if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
          return c.json({ error: MISSING_SECTOR_ERROR }, 400);
        }
        throw error;
      }
    },
  )
  .patch(
    "/:id",
    requestBodyLimit,
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("form", updateMemberSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const {
        logo,
        removeLogo,
        identityDocument,
        activityDocument,
        ...fields
      } = c.req.valid("form");

      const [existing] = await selectFullMember().where(eq(memberTable.id, id));

      if (!existing) return c.json({ error: "Üye bulunamadı" }, 404);

      if (fields.status !== undefined && !isEstablished(existing.status)) {
        return c.json(
          { error: "Bu üyenin durumu buradan değiştirilemez" },
          409,
        );
      }

      // undefined keeps the current logo, null removes it
      let newLogo: string | null | undefined;
      if (logo) {
        newLogo = await saveLogo(logo);
        if (!newLogo) {
          return c.json({ error: "Sadece resim dosyaları kabul edilir" }, 415);
        }
      } else if (removeLogo) {
        newLogo = null;
      }

      const documents = await storeDocuments({
        identityDocument,
        activityDocument,
      });
      if (documents.rejected) {
        await deleteFiles([newLogo]);
        return c.json({ error: NOT_A_DOCUMENT_ERROR }, 415);
      }
      const newDocuments = documents.stored;

      try {
        await db.transaction(async (tx) => {
          const values = {
            ...fields,
            ...newDocuments,
            ...(newLogo !== undefined && { logo: newLogo }),
          };
          // a blank TC number alone leaves nothing to set
          if (Object.values(values).every((v) => v === undefined)) return;

          await tx
            .update(memberTable)
            .set(values)
            .where(eq(memberTable.id, id));

          const changes = [
            ...diffFields(memberAuditSpec, existing, fields),
            ...diffRedacted(applicantAuditLabels, existing, {
              ...fields,
              ...newDocuments,
            }),
            ...(fields.sectorId !== undefined
              ? change(
                  "Sektör",
                  existing.sector,
                  await sectorName(tx, fields.sectorId),
                )
              : []),
            ...(newLogo !== undefined
              ? change(
                  "Logo",
                  existing.logo && "Eski logo",
                  newLogo && "Yeni logo",
                )
              : []),
          ];
          if (changes.length === 0) return;

          await recordAudit(tx, {
            actor: actorOf(c),
            action: "update",
            entityType: "member",
            entityId: id,
            entityLabel: fields.title ?? existing.title,
            changes,
          });
        });
      } catch (error) {
        await deleteFiles([newLogo, ...Object.values(newDocuments)]);
        if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
          return c.json({ error: MISSING_SECTOR_ERROR }, 400);
        }
        throw error;
      }

      await deleteFiles([
        newLogo !== undefined ? existing.logo : null,
        ...DOCUMENT_FIELDS.map((field) =>
          newDocuments[field] ? existing[field] : null,
        ),
      ]);

      return c.json({ id, message: "Üye güncellendi" }, 200);
    },
  )
  .delete(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");

      const deleted = await db.transaction(async (tx) => {
        const [member] = await selectFullMember(tx).where(
          eq(memberTable.id, id),
        );
        if (!member) return null;

        // the links cascade away with the member, so name them now
        const representatives = await selectRepresentatives(id, tx);

        await tx.delete(memberTable).where(eq(memberTable.id, id));
        await recordAudit(tx, {
          actor: actorOf(c),
          action: "delete",
          entityType: "member",
          entityId: id,
          entityLabel: member.title,
          details: [
            ...describeFields(memberAuditSpec, member),
            { label: "Sektör", value: member.sector ?? "—" },
            { label: "Logo", value: member.logo ? "Var" : "—" },
            {
              label: "Yetkililer",
              value:
                representatives
                  .map((r) => (r.role ? `${r.name} (${r.role})` : r.name))
                  .join(", ") || "—",
            },
          ],
        });
        return member;
      });

      if (!deleted) return c.json({ error: "Üye bulunamadı" }, 404);

      await deleteFiles([
        deleted.logo,
        deleted.identityDocument,
        deleted.activityDocument,
      ]);

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
        if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
          return c.json({ error: MISSING_SECTOR_ERROR }, 400);
        }
        throw error;
      }
      if (result.kind === "missing") {
        return c.json({ error: "Üye bulunamadı" }, 404);
      }
      if (result.kind === "stale") {
        return c.json({ error: STALE_DECISION_ERROR }, 409);
      }

      // the decision is committed; from here on nothing may undo it
      if (!rule.notice) return c.json({ status: rule.to, notices: null }, 200);

      const { member } = result;
      const notices = await sendApplicationNotices(rule.notice, member);
      try {
        await recordAudit(db, {
          actor: actorOf(c),
          action: "application_notice",
          entityType: "member",
          entityId: id,
          entityLabel: member.title,
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
