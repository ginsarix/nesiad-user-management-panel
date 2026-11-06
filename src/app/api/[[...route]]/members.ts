import { zValidator } from "@hono/zod-validator";
import { asc, eq, getColumns } from "drizzle-orm";
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
import { recordAudit } from "@/lib/audit";
import {
  type AuditSpec,
  change,
  describeFields,
  diffFields,
  formatAudit,
} from "@/lib/audit-diff";
import { createFile, deleteFile } from "@/lib/file-storage";
import { isEstablished } from "@/lib/member-status";
import {
  createMemberSchema,
  MAX_LOGO_SIZE,
  updateMemberSchema,
} from "@/lib/zod-schemas/member";
import { FOREIGN_KEY_VIOLATION, pgErrorCode } from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import { idParamSchema, respondWithFirstIssue } from "./validation";

/** Members with their sector's name next to its id */
function selectMembers(executor: Executor = db) {
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
 * Stores an uploaded logo after checking its actual contents are an image.
 * Resolves to null when the file is not an image.
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

const logoBodyLimit = bodyLimit({
  // the logo plus some room for the text fields
  maxSize: MAX_LOGO_SIZE + 1024 * 1024,
  onError: (c) => c.json({ error: "Logo 5 MB'dan küçük olmalıdır" }, 413),
});

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

      const [member] = await selectMembers().where(eq(memberTable.id, id));

      if (!member) return c.json({ error: "Üye bulunamadı" }, 404);

      const representatives = (await selectRepresentatives(id)).map(
        ({ memberId: _, ...representative }) => representative,
      );

      return c.json({ ...member, representatives }, 200);
    },
  )
  .post(
    "/",
    logoBodyLimit,
    zValidator("form", createMemberSchema, respondWithFirstIssue),
    async (c) => {
      const { logo, ...fields } = c.req.valid("form");

      const logoFilename = logo ? await saveLogo(logo) : null;
      if (logo && !logoFilename) {
        return c.json({ error: "Sadece resim dosyaları kabul edilir" }, 415);
      }

      try {
        const id = await db.transaction(async (tx) => {
          const [member] = await tx
            .insert(memberTable)
            .values({ ...fields, logo: logoFilename })
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
        if (logoFilename) await deleteFile(logoFilename);
        if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
          return c.json({ error: MISSING_SECTOR_ERROR }, 400);
        }
        throw error;
      }
    },
  )
  .patch(
    "/:id",
    logoBodyLimit,
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("form", updateMemberSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const { logo, removeLogo, ...fields } = c.req.valid("form");

      const [existing] = await selectMembers().where(eq(memberTable.id, id));

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

      try {
        await db.transaction(async (tx) => {
          await tx
            .update(memberTable)
            .set({
              ...fields,
              ...(newLogo !== undefined && { logo: newLogo }),
            })
            .where(eq(memberTable.id, id));

          const changes = [
            ...diffFields(memberAuditSpec, existing, fields),
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
        if (newLogo) await deleteFile(newLogo);
        if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
          return c.json({ error: MISSING_SECTOR_ERROR }, 400);
        }
        throw error;
      }

      if (newLogo !== undefined && existing.logo) {
        await deleteFile(existing.logo);
      }

      return c.json({ id, message: "Üye güncellendi" }, 200);
    },
  )
  .delete(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");

      const deleted = await db.transaction(async (tx) => {
        const [member] = await selectMembers(tx).where(eq(memberTable.id, id));
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

      if (deleted.logo) await deleteFile(deleted.logo);

      return c.json({ message: "Üye silindi" }, 200);
    },
  );
