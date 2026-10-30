import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import {
  authorizedRepresentativeTable,
  membersRepresentativesTable,
  memberTable,
} from "@/db/schema";
import { compareTr } from "@/lib/turkish";
import {
  createRepresentativeSchema,
  updateRepresentativeSchema,
} from "@/lib/zod-schemas/authorized-representative";
import { FOREIGN_KEY_VIOLATION, pgErrorCode } from "./db-errors";
import { idParamSchema, respondWithFirstIssue } from "./validation";

const MISSING_MEMBER_ERROR = "Seçilen üye bulunamadı";

/** Members joined to their yetkili, optionally for a single yetkili */
function selectLinkedMembers(representativeId?: number) {
  return db
    .select({
      representativeId: membersRepresentativesTable.authorizedRepresentativeId,
      id: memberTable.id,
      title: memberTable.title,
      logo: memberTable.logo,
      active: memberTable.active,
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

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

export const representativesRoute = new Hono()
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

      const members = (await selectLinkedMembers(id))
        .map(({ representativeId: _, ...member }) => member)
        .sort(byTitle);

      return c.json({ ...representative, members }, 200);
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
            .returning({ id: authorizedRepresentativeTable.id });

          await replaceLinks(tx, representative.id, members);
          return representative.id;
        });

        return c.json({ id, message: "Yetkili kaydedildi" }, 201);
      } catch (error) {
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
            .select({ id: authorizedRepresentativeTable.id })
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
          if (members) await replaceLinks(tx, id, members);
          return true;
        });

        if (!found) return c.json({ error: "Yetkili bulunamadı" }, 404);

        return c.json({ id, message: "Yetkili güncellendi" }, 200);
      } catch (error) {
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

      // the foreign keys remove its member links
      const [deleted] = await db
        .delete(authorizedRepresentativeTable)
        .where(eq(authorizedRepresentativeTable.id, id))
        .returning({ id: authorizedRepresentativeTable.id });

      if (!deleted) return c.json({ error: "Yetkili bulunamadı" }, 404);

      return c.json({ message: "Yetkili silindi" }, 200);
    },
  );
