import { zValidator } from "@hono/zod-validator";
import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db, type Executor, type Transaction } from "@/db";
import {
  authorizedRepresentativeTable,
  membersRepresentativesTable,
  memberTable,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  type AuditSpec,
  change,
  describeFields,
  diffFields,
  formatAudit,
} from "@/lib/audit-diff";
import { isEstablished } from "@/lib/member-status";
import { compareTr } from "@/lib/turkish";
import {
  createRepresentativeSchema,
  updateRepresentativeSchema,
} from "@/lib/zod-schemas/authorized-representative";
import { FOREIGN_KEY_VIOLATION, pgErrorCode } from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import {
  representativeOrganizationsText,
  selectRepresentativeOrganizations,
} from "./organization-queries";
import { idParamSchema, respondWithFirstIssue } from "./validation";

const MISSING_MEMBER_ERROR = "Seçilen üye bulunamadı";

/** Members joined to their yetkili, optionally for a single yetkili */
function selectLinkedMembers(
  representativeId?: number,
  executor: Executor = db,
) {
  return executor
    .select({
      representativeId: membersRepresentativesTable.authorizedRepresentativeId,
      id: memberTable.id,
      title: memberTable.title,
      logo: memberTable.logo,
      status: memberTable.status,
      role: membersRepresentativesTable.role,
    })
    .from(membersRepresentativesTable)
    .innerJoin(
      memberTable,
      eq(membersRepresentativesTable.memberId, memberTable.id),
    )
    .where(
      representativeId === undefined
        ? undefined
        : eq(
            membersRepresentativesTable.authorizedRepresentativeId,
            representativeId,
          ),
    );
}

type LinkedMember = Omit<
  Awaited<ReturnType<typeof selectLinkedMembers>>[number],
  "representativeId"
>;

function byTitle(a: LinkedMember, b: LinkedMember) {
  return compareTr(a.title, b.title);
}

const representativeAuditSpec: AuditSpec = {
  name: { label: "Ad Soyad", format: formatAudit.text },
  active: { label: "Durum", format: formatAudit.active },
  phone: { label: "Cep Telefonu", format: formatAudit.text },
  email: { label: "E-posta", format: formatAudit.text },
  dateOfBirth: { label: "Doğum Tarihi", format: formatAudit.date },
  notes: { label: "Notlar", format: formatAudit.text },
};

/** "ABC Ltd (Genel Müdür), XYZ A.Ş." for the audit log */
async function linkedMembersText(executor: Executor, representativeId: number) {
  const links = (await selectLinkedMembers(representativeId, executor)).sort(
    byTitle,
  );
  return (
    links
      .map((m) => (m.role ? `${m.title} (${m.role})` : m.title))
      .join(", ") || "—"
  );
}

const UNLINKABLE_MEMBER_ERROR =
  "Aday veya reddedilmiş üyeye yetkili bağlanamaz";

class UnlinkableMemberError extends Error {}

/** Throws unless every linked member is active or passive; unknown ids are left to the foreign key */
async function assertLinkable(
  tx: Transaction,
  members: { memberId: number }[],
) {
  if (members.length === 0) return;

  const linked = await tx
    .select({ status: memberTable.status })
    .from(memberTable)
    .where(
      inArray(
        memberTable.id,
        members.map((m) => m.memberId),
      ),
    );
  if (linked.some((m) => !isEstablished(m.status))) {
    throw new UnlinkableMemberError();
  }
}

/** Replaces all of a yetkili's member links */
async function replaceLinks(
  tx: Transaction,
  representativeId: number,
  members: { memberId: number; role?: string | null }[],
) {
  await tx
    .delete(membersRepresentativesTable)
    .where(
      eq(
        membersRepresentativesTable.authorizedRepresentativeId,
        representativeId,
      ),
    );

  if (members.length === 0) return;

  await tx.insert(membersRepresentativesTable).values(
    members.map(({ memberId, role }) => ({
      memberId,
      authorizedRepresentativeId: representativeId,
      role: role ?? null,
    })),
  );
}

export const representativesRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const [representatives, links] = await Promise.all([
      db.select().from(authorizedRepresentativeTable),
      selectLinkedMembers(),
    ]);

    const membersByRepresentative = new Map<number, LinkedMember[]>();
    for (const { representativeId, ...member } of links) {
      const list = membersByRepresentative.get(representativeId) ?? [];
      list.push(member);
      membersByRepresentative.set(representativeId, list);
    }

    return c.json(
      representatives.map((representative) => ({
        ...representative,
        members: (membersByRepresentative.get(representative.id) ?? []).sort(
          byTitle,
        ),
      })),
    );
  })
  .get(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");

      const [representative] = await db
        .select()
        .from(authorizedRepresentativeTable)
        .where(eq(authorizedRepresentativeTable.id, id));

      if (!representative) return c.json({ error: "Yetkili bulunamadı" }, 404);

      const [links, organizations] = await Promise.all([
        selectLinkedMembers(id),
        selectRepresentativeOrganizations(id),
      ]);
      const members = links
        .map(({ representativeId: _, ...member }) => member)
        .sort(byTitle);

      return c.json({ ...representative, members, organizations }, 200);
    },
  )
  .post(
    "/",
    zValidator("json", createRepresentativeSchema, respondWithFirstIssue),
    async (c) => {
      const { members = [], ...fields } = c.req.valid("json");

      try {
        const id = await db.transaction(async (tx) => {
          const [representative] = await tx
            .insert(authorizedRepresentativeTable)
            .values(fields)
            .returning();

          await assertLinkable(tx, members);
          await replaceLinks(tx, representative.id, members);
          await recordAudit(tx, {
            actor: actorOf(c),
            action: "create",
            entityType: "representative",
            entityId: representative.id,
            entityLabel: representative.name,
            details: [
              ...describeFields(representativeAuditSpec, representative),
              {
                label: "Bağlı Üyeler",
                value: await linkedMembersText(tx, representative.id),
              },
            ],
          });
          return representative.id;
        });

        return c.json({ id, message: "Yetkili kaydedildi" }, 201);
      } catch (error) {
        if (error instanceof UnlinkableMemberError) {
          return c.json({ error: UNLINKABLE_MEMBER_ERROR }, 400);
        }
        if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
          return c.json({ error: MISSING_MEMBER_ERROR }, 400);
        }
        throw error;
      }
    },
  )
  .patch(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("json", updateRepresentativeSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const { members, ...fields } = c.req.valid("json");

      try {
        const found = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(authorizedRepresentativeTable)
            .where(eq(authorizedRepresentativeTable.id, id));
          if (!existing) return false;

          // drizzle rejects an update with nothing to set
          if (Object.keys(fields).length > 0) {
            await tx
              .update(authorizedRepresentativeTable)
              .set(fields)
              .where(eq(authorizedRepresentativeTable.id, id));
          }

          let linkChanges: ReturnType<typeof change> = [];
          if (members) {
            await assertLinkable(tx, members);
            const before = await linkedMembersText(tx, id);
            await replaceLinks(tx, id, members);
            linkChanges = change(
              "Bağlı Üyeler",
              before,
              await linkedMembersText(tx, id),
            );
          }

          const changes = [
            ...diffFields(representativeAuditSpec, existing, fields),
            ...linkChanges,
          ];
          if (changes.length > 0) {
            await recordAudit(tx, {
              actor: actorOf(c),
              action: "update",
              entityType: "representative",
              entityId: id,
              entityLabel: fields.name ?? existing.name,
              changes,
            });
          }
          return true;
        });

        if (!found) return c.json({ error: "Yetkili bulunamadı" }, 404);

        return c.json({ id, message: "Yetkili güncellendi" }, 200);
      } catch (error) {
        if (error instanceof UnlinkableMemberError) {
          return c.json({ error: UNLINKABLE_MEMBER_ERROR }, 400);
        }
        if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
          return c.json({ error: MISSING_MEMBER_ERROR }, 400);
        }
        throw error;
      }
    },
  )
  .delete(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");

      const deleted = await db.transaction(async (tx) => {
        const [representative] = await tx
          .select()
          .from(authorizedRepresentativeTable)
          .where(eq(authorizedRepresentativeTable.id, id));
        if (!representative) return null;

        // the foreign keys remove its member links and group rows, so
        // name them now
        const members = await linkedMembersText(tx, id);
        const organizations = await representativeOrganizationsText(tx, id);

        await tx
          .delete(authorizedRepresentativeTable)
          .where(eq(authorizedRepresentativeTable.id, id));
        await recordAudit(tx, {
          actor: actorOf(c),
          action: "delete",
          entityType: "representative",
          entityId: id,
          entityLabel: representative.name,
          details: [
            ...describeFields(representativeAuditSpec, representative),
            { label: "Bağlı Üyeler", value: members },
            { label: "Organizasyonlar", value: organizations },
          ],
        });
        return representative;
      });

      if (!deleted) return c.json({ error: "Yetkili bulunamadı" }, 404);

      return c.json({ message: "Yetkili silindi" }, 200);
    },
  );
