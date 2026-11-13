import { zValidator } from "@hono/zod-validator";
import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, type Transaction } from "@/db";
import { collectionTable, projectTable } from "@/db/schema";
import { amountRowsAuditText } from "@/lib/amount-rows";
import { type AuditActor, recordAudit } from "@/lib/audit";
import {
  type AuditSpec,
  change,
  describeFields,
  diffFields,
  formatAudit,
} from "@/lib/audit-diff";
import { projectNumberKey } from "@/lib/projects";
import { compareTr, compareTrNumeric } from "@/lib/turkish";
import type { AmountRowInput } from "@/lib/zod-schemas/amount-rows";
import {
  type ProjectFields,
  pledgesBodySchema,
  projectSchema,
  projectUpdateSchema,
} from "@/lib/zod-schemas/project";
import { sumOfCollected } from "./collection-queries";
import {
  FOREIGN_KEY_VIOLATION,
  pgErrorCode,
  UNIQUE_VIOLATION,
} from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import { loadPledges, pledgesText, replacePledges } from "./pledge-queries";
import {
  assertUsableRepresentatives,
  InvalidRowError,
} from "./representative-rows";
import {
  idParamSchema,
  respondWithFirstField,
  respondWithFirstIssue,
} from "./validation";

const NOT_FOUND_ERROR = "Proje bulunamadı";
export const DUPLICATE_NUMBER_ERROR = "Bu proje numarası zaten var";

const projectAuditSpec: AuditSpec = {
  name: { label: "Ad", format: formatAudit.text },
  number: { label: "Proje Numarası", format: formatAudit.text },
  active: { label: "Durum", format: formatAudit.active },
};

const projectColumns = {
  id: projectTable.id,
  name: projectTable.name,
  number: projectTable.number,
  active: projectTable.active,
};

/** null when a concurrent tahsilat made the count unknown */
function hasCollectionsError(collectionCount: number | null) {
  return `Bu projeye ait ${collectionCount ? `${collectionCount} ` : ""}tahsilat var. Silmek yerine pasif yapabilirsiniz.`;
}

function withNumberKey(values: ProjectFields) {
  return { ...values, numberKey: projectNumberKey(values.number) };
}

export function isDuplicateNumber(error: unknown) {
  return pgErrorCode(error) === UNIQUE_VIOLATION;
}

/** Maps a refused save to its response; anything else is rethrown */
function saveError(error: unknown) {
  if (isDuplicateNumber(error)) {
    return {
      body: { error: DUPLICATE_NUMBER_ERROR, field: "number" },
      status: 409 as const,
    };
  }
  if (error instanceof InvalidRowError) {
    return {
      body: {
        error: error.message,
        field: `pledges.${error.index}.representativeId`,
      },
      status: 400 as const,
    };
  }
  // a yetkili deleted while the form was open
  if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
    return {
      body: { error: "Seçilen yetkili bulunamadı" },
      status: 400 as const,
    };
  }
  throw error;
}

/**
 * Replaces the proje's taahhütler; returns the "Taahhütler" audit change,
 * empty when the rows read the same. Pasif yetkililer already among the
 * saved rows may stay.
 */
async function savePledges(
  tx: Transaction,
  projectId: number,
  pledges: readonly AmountRowInput[],
) {
  const before = await loadPledges(tx, projectId);
  await assertUsableRepresentatives(
    tx,
    pledges,
    new Set(before.map((p) => p.representativeId)),
  );
  await replacePledges(tx, projectId, pledges);
  return change(
    "Taahhütler",
    amountRowsAuditText(before),
    await pledgesText(tx, projectId),
  );
}

/**
 * Creates a proje with its taahhütler and audits it inside the caller's
 * transaction. Used by the Projeler page and by a tahsilat that creates its
 * proje. Throws on a duplicate number (see isDuplicateNumber) and on a
 * refused taahhüt (InvalidRowError).
 */
export async function insertProject(
  tx: Transaction,
  values: ProjectFields,
  actor: AuditActor,
  pledges: readonly AmountRowInput[] = [],
) {
  await assertUsableRepresentatives(tx, pledges, new Set());
  const [project] = await tx
    .insert(projectTable)
    .values(withNumberKey(values))
    .returning();
  await replacePledges(tx, project.id, pledges);

  await recordAudit(tx, {
    actor,
    action: "create",
    entityType: "project",
    entityId: project.id,
    entityLabel: project.name,
    details: [
      ...describeFields(projectAuditSpec, project),
      { label: "Taahhütler", value: await pledgesText(tx, project.id) },
    ],
  });
  return { id: project.id, name: project.name, number: project.number };
}

export const projectsRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const projects = await db
      .select({
        ...projectColumns,
        collectionCount: count(collectionTable.id),
        totalCollected: sumOfCollected(),
      })
      .from(projectTable)
      .leftJoin(collectionTable, eq(collectionTable.projectId, projectTable.id))
      .groupBy(projectTable.id);
    return c.json(
      projects.sort(
        (a, b) =>
          compareTrNumeric(a.number, b.number) || compareTr(a.name, b.name),
      ),
    );
  })
  .get(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const [project] = await db
        .select(projectColumns)
        .from(projectTable)
        .where(eq(projectTable.id, id));

      if (!project) return c.json({ error: NOT_FOUND_ERROR }, 404);

      const [collectionCount, pledges] = await Promise.all([
        db.$count(collectionTable, eq(collectionTable.projectId, id)),
        loadPledges(db, id),
      ]);
      return c.json({ ...project, collectionCount, pledges }, 200);
    },
  )
  .post(
    "/",
    zValidator("json", projectSchema, respondWithFirstField),
    async (c) => {
      const { pledges, ...fields } = c.req.valid("json");
      try {
        const project = await db.transaction((tx) =>
          insertProject(tx, fields, actorOf(c), pledges),
        );
        return c.json({ id: project.id, message: "Proje kaydedildi" }, 201);
      } catch (error) {
        const { body, status } = saveError(error);
        return c.json(body, status);
      }
    },
  )
  .patch(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("json", projectUpdateSchema, respondWithFirstField),
    async (c) => {
      const { id } = c.req.valid("param");
      const { pledges, ...fields } = c.req.valid("json");

      try {
        const found = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(projectTable)
            .where(eq(projectTable.id, id));
          if (!existing) return false;

          await tx
            .update(projectTable)
            .set(withNumberKey(fields))
            .where(eq(projectTable.id, id));

          const changes = [
            ...diffFields(projectAuditSpec, existing, fields),
            // without `pledges` (e.g. the Aktif/Pasif button) they stay
            ...(pledges ? await savePledges(tx, id, pledges) : []),
          ];
          if (changes.length > 0) {
            await recordAudit(tx, {
              actor: actorOf(c),
              action: "update",
              entityType: "project",
              entityId: id,
              entityLabel: fields.name,
              changes,
            });
          }
          return true;
        });

        if (!found) return c.json({ error: NOT_FOUND_ERROR }, 404);

        return c.json({ id, message: "Proje güncellendi" }, 200);
      } catch (error) {
        const { body, status } = saveError(error);
        return c.json(body, status);
      }
    },
  )
  .put(
    "/:id/pledges",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("json", pledgesBodySchema, respondWithFirstField),
    async (c) => {
      const { id } = c.req.valid("param");
      const { pledges } = c.req.valid("json");

      try {
        const found = await db.transaction(async (tx) => {
          const [project] = await tx
            .select({ name: projectTable.name })
            .from(projectTable)
            .where(eq(projectTable.id, id))
            // a concurrent delete waits, so the rows aren't orphaned
            .for("update");
          if (!project) return false;

          const changes = await savePledges(tx, id, pledges);
          if (changes.length > 0) {
            await recordAudit(tx, {
              actor: actorOf(c),
              action: "update",
              entityType: "project",
              entityId: id,
              entityLabel: project.name,
              changes,
            });
          }
          return true;
        });

        if (!found) return c.json({ error: NOT_FOUND_ERROR }, 404);

        return c.json({ id, message: "Taahhütler kaydedildi" }, 200);
      } catch (error) {
        const { body, status } = saveError(error);
        return c.json(body, status);
      }
    },
  )
  .delete(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");

      const result = await db
        .transaction(async (tx) => {
          // tahsilatlar keep their proje: refuse while it has any
          const collectionCount = await tx.$count(
            collectionTable,
            eq(collectionTable.projectId, id),
          );
          if (collectionCount > 0) return { collectionCount };

          // the taahhütler go with the proje, so name them now
          const pledges = await pledgesText(tx, id);
          const [project] = await tx
            .delete(projectTable)
            .where(eq(projectTable.id, id))
            .returning();
          if (!project) return null;

          await recordAudit(tx, {
            actor: actorOf(c),
            action: "delete",
            entityType: "project",
            entityId: id,
            entityLabel: project.name,
            details: [
              ...describeFields(projectAuditSpec, project),
              { label: "Taahhütler", value: pledges },
            ],
          });
          return { collectionCount: 0 };
        })
        .catch((error) => {
          // a tahsilat added between the count and the delete
          if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
            return { collectionCount: null };
          }
          throw error;
        });

      if (!result) return c.json({ error: NOT_FOUND_ERROR }, 404);
      if (result.collectionCount !== 0) {
        return c.json(
          { error: hasCollectionsError(result.collectionCount) },
          409,
        );
      }

      return c.json({ message: "Proje silindi" }, 200);
    },
  );
