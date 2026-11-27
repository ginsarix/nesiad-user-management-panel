import { zValidator } from "@hono/zod-validator";
import { and, count, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db, type Transaction } from "@/db";
import { parameterTable } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { change } from "@/lib/audit-diff";
import {
  type Organization,
  organizationFromSlug,
  organizationPeopleText,
} from "@/lib/organizations";
import { compareTr } from "@/lib/turkish";
import {
  organizationGroupSchema,
  organizationParamSchema,
} from "@/lib/zod-schemas/organization";
import {
  FOREIGN_KEY_VIOLATION,
  pgErrorCode,
  UNIQUE_VIOLATION,
} from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import { assertUsableMembers, InvalidRowError } from "./member-rows";
import {
  loadOrganizationGroup,
  ORGANIZATION_TABLES,
  type OrganizationTables,
} from "./organization-queries";
import { idParamSchema, respondWithFirstIssue } from "./validation";

const NOT_FOUND_ERROR = "Kayıt bulunamadı";
const DUPLICATE_NAME_ERROR = "Bu isimde bir kayıt zaten var";

const groupParamSchema = organizationParamSchema.extend(idParamSchema.shape);

type PersonInput = { memberId: number; roleId: number };

/** The slug was validated, so it always names an organization */
function organizationOf(slug: string): Organization {
  const organization = organizationFromSlug(slug);
  if (!organization) throw new Error(`Unknown organization slug: ${slug}`);
  return organization;
}

function nameValues(name: string) {
  return { name, nameKey: name.toLocaleLowerCase("tr") };
}

/**
 * Throws InvalidRowError unless every member exists and is Aktif or already
 * in the group (`currentIds`), and every görev is a Dernek Görevi
 */
async function assertValidPeople(
  tx: Transaction,
  people: PersonInput[],
  currentIds: readonly number[],
) {
  if (people.length === 0) return;

  const roles = await tx
    .select({ id: parameterTable.id })
    .from(parameterTable)
    .where(
      and(
        inArray(
          parameterTable.id,
          people.map((p) => p.roleId),
        ),
        eq(parameterTable.kind, "association_role"),
      ),
    );
  const roleIds = new Set(roles.map((r) => r.id));
  const roleIndex = people.findIndex((p) => !roleIds.has(p.roleId));

  await assertUsableMembers(
    tx,
    people.map((p) => p.memberId),
    currentIds,
  );
  if (roleIndex !== -1) {
    throw new InvalidRowError("Seçilen görev bulunamadı", roleIndex, "roleId");
  }
}

/** Replaces all of the group's rows, keeping the given order */
async function replacePeople(
  tx: Transaction,
  { person }: OrganizationTables,
  groupId: number,
  people: PersonInput[],
) {
  await tx.delete(person).where(eq(person.groupId, groupId));
  if (people.length === 0) return;

  await tx.insert(person).values(
    people.map((p, position) => ({
      groupId,
      memberId: p.memberId,
      roleId: p.roleId,
      position,
    })),
  );
}

/** Maps a refused save to its response; anything else is rethrown */
function saveError(error: unknown) {
  if (error instanceof InvalidRowError) {
    return {
      body: {
        error: error.message,
        field: `people.${error.index}.${error.field}`,
      },
      status: 400 as const,
    };
  }
  if (pgErrorCode(error) === UNIQUE_VIOLATION) {
    return {
      body: { error: DUPLICATE_NAME_ERROR, field: "name" },
      status: 409 as const,
    };
  }
  // a member or görev deleted while the form was open
  if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
    return {
      body: { error: "Seçilen üye veya görev bulunamadı" },
      status: 400 as const,
    };
  }
  throw error;
}

export const organizationsRoute = new Hono<AppEnv>()
  .get(
    "/:organization",
    zValidator("param", organizationParamSchema, respondWithFirstIssue),
    async (c) => {
      const organization = organizationOf(c.req.valid("param").organization);
      const { group, person } = ORGANIZATION_TABLES[organization];

      const groups = await db
        .select({
          id: group.id,
          name: group.name,
          personCount: count(person.id),
        })
        .from(group)
        .leftJoin(person, eq(person.groupId, group.id))
        .groupBy(group.id);

      return c.json(groups.toSorted((a, b) => compareTr(a.name, b.name)));
    },
  )
  .get(
    "/:organization/:id",
    zValidator("param", groupParamSchema, respondWithFirstIssue),
    async (c) => {
      const params = c.req.valid("param");
      const tables = ORGANIZATION_TABLES[organizationOf(params.organization)];

      const group = await loadOrganizationGroup(db, tables, params.id);
      if (!group) return c.json({ error: NOT_FOUND_ERROR }, 404);

      return c.json(group, 200);
    },
  )
  .post(
    "/:organization",
    zValidator("param", organizationParamSchema, respondWithFirstIssue),
    zValidator("json", organizationGroupSchema, respondWithFirstIssue),
    async (c) => {
      const organization = organizationOf(c.req.valid("param").organization);
      const tables = ORGANIZATION_TABLES[organization];
      const { name, people } = c.req.valid("json");

      try {
        const id = await db.transaction(async (tx) => {
          await assertValidPeople(tx, people, []);

          const [created] = await tx
            .insert(tables.group)
            .values(nameValues(name))
            .returning({ id: tables.group.id });
          await replacePeople(tx, tables, created.id, people);

          const saved = await loadOrganizationGroup(tx, tables, created.id);
          await recordAudit(tx, {
            actor: actorOf(c),
            action: "create",
            entityType: organization,
            entityId: created.id,
            entityLabel: name,
            details: [
              { label: "İsim", value: name },
              {
                label: "Kişiler",
                value: organizationPeopleText(saved?.people ?? []),
              },
            ],
          });
          return created.id;
        });

        return c.json({ id, message: "Kaydedildi" }, 201);
      } catch (error) {
        const { body, status } = saveError(error);
        return c.json(body, status);
      }
    },
  )
  .patch(
    "/:organization/:id",
    zValidator("param", groupParamSchema, respondWithFirstIssue),
    zValidator("json", organizationGroupSchema, respondWithFirstIssue),
    async (c) => {
      const params = c.req.valid("param");
      const organization = organizationOf(params.organization);
      const tables = ORGANIZATION_TABLES[organization];
      const { id } = params;
      const { name, people } = c.req.valid("json");

      try {
        const found = await db.transaction(async (tx) => {
          const before = await loadOrganizationGroup(tx, tables, id);
          if (!before) return false;

          await assertValidPeople(
            tx,
            people,
            before.people.map((p) => p.memberId),
          );

          await tx
            .update(tables.group)
            .set(nameValues(name))
            .where(eq(tables.group.id, id));
          await replacePeople(tx, tables, id, people);

          const after = await loadOrganizationGroup(tx, tables, id);
          const changes = [
            ...change("İsim", before.name, name),
            ...change(
              "Kişiler",
              organizationPeopleText(before.people),
              organizationPeopleText(after?.people ?? []),
            ),
          ];
          if (changes.length > 0) {
            await recordAudit(tx, {
              actor: actorOf(c),
              action: "update",
              entityType: organization,
              entityId: id,
              entityLabel: name,
              changes,
            });
          }
          return true;
        });

        if (!found) return c.json({ error: NOT_FOUND_ERROR }, 404);

        return c.json({ id, message: "Güncellendi" }, 200);
      } catch (error) {
        const { body, status } = saveError(error);
        return c.json(body, status);
      }
    },
  )
  .delete(
    "/:organization/:id",
    zValidator("param", groupParamSchema, respondWithFirstIssue),
    async (c) => {
      const params = c.req.valid("param");
      const organization = organizationOf(params.organization);
      const tables = ORGANIZATION_TABLES[organization];
      const { id } = params;

      const deleted = await db.transaction(async (tx) => {
        // the rows go with the group, so name them now
        const group = await loadOrganizationGroup(tx, tables, id);
        if (!group) return false;

        await tx.delete(tables.group).where(eq(tables.group.id, id));
        await recordAudit(tx, {
          actor: actorOf(c),
          action: "delete",
          entityType: organization,
          entityId: id,
          entityLabel: group.name,
          details: [
            { label: "İsim", value: group.name },
            { label: "Kişiler", value: organizationPeopleText(group.people) },
          ],
        });
        return true;
      });

      if (!deleted) return c.json({ error: NOT_FOUND_ERROR }, 404);

      return c.json({ message: "Silindi" }, 200);
    },
  );
