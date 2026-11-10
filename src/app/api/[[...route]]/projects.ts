import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, type Transaction } from "@/db";
import { projectTable } from "@/db/schema";
import { type AuditActor, recordAudit } from "@/lib/audit";
import {
  type AuditSpec,
  describeFields,
  diffFields,
  formatAudit,
} from "@/lib/audit-diff";
import { compareTr } from "@/lib/turkish";
import {
  type ProjectFields,
  projectFieldsSchema,
} from "@/lib/zod-schemas/project";
import { pgErrorCode, UNIQUE_VIOLATION } from "./db-errors";
import { type AppEnv, actorOf } from "./env";
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

function withNumberKey(values: ProjectFields) {
  return { ...values, numberKey: values.number.toLocaleLowerCase("tr") };
}

export function isDuplicateNumber(error: unknown) {
  return pgErrorCode(error) === UNIQUE_VIOLATION;
}

/**
 * Creates a proje and audits it inside the caller's transaction. Used by
 * the Projeler page and by a tahsilat that creates its proje. Throws on a
 * duplicate number (see isDuplicateNumber).
 */
export async function insertProject(
  tx: Transaction,
  values: ProjectFields,
  actor: AuditActor,
) {
  const [project] = await tx
    .insert(projectTable)
    .values(withNumberKey(values))
    .returning();

  await recordAudit(tx, {
    actor,
    action: "create",
    entityType: "project",
    entityId: project.id,
    entityLabel: project.name,
    details: describeFields(projectAuditSpec, project),
  });
  return { id: project.id, name: project.name, number: project.number };
}

export const projectsRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const projects = await db.select(projectColumns).from(projectTable);
    return c.json(
      projects
        .map((project) => ({
          ...project,
          collectionCount: 0,
          totalCollected: "0.00",
        }))
        .sort(
          (a, b) => compareTr(a.number, b.number) || compareTr(a.name, b.name),
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

      return c.json({ ...project, collectionCount: 0 }, 200);
    },
  )
  .post(
    "/",
    zValidator("json", projectFieldsSchema, respondWithFirstField),
    async (c) => {
      try {
        const project = await db.transaction((tx) =>
          insertProject(tx, c.req.valid("json"), actorOf(c)),
        );
        return c.json({ id: project.id, message: "Proje kaydedildi" }, 201);
      } catch (error) {
        if (isDuplicateNumber(error)) {
          return c.json(
            { error: DUPLICATE_NUMBER_ERROR, field: "number" },
            409,
          );
        }
        throw error;
      }
    },
  )
  .patch(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("json", projectFieldsSchema, respondWithFirstField),
    async (c) => {
      const { id } = c.req.valid("param");
      const fields = c.req.valid("json");

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

          const changes = diffFields(projectAuditSpec, existing, fields);
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
        if (isDuplicateNumber(error)) {
          return c.json(
            { error: DUPLICATE_NUMBER_ERROR, field: "number" },
            409,
          );
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
          details: describeFields(projectAuditSpec, project),
        });
        return project;
      });

      if (!deleted) return c.json({ error: NOT_FOUND_ERROR }, 404);

      return c.json({ message: "Proje silindi" }, 200);
    },
  );
