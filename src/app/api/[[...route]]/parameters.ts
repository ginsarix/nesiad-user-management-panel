import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import { parameterTable } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { change } from "@/lib/audit-diff";
import { PARAMETER_KIND_LABELS, type ParameterKind } from "@/lib/parameters";
import { compareTr } from "@/lib/turkish";
import {
  createParameterSchema,
  parameterNameSchema,
} from "@/lib/zod-schemas/parameter";
import { pgErrorCode, UNIQUE_VIOLATION } from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import { idParamSchema, respondWithFirstIssue } from "./validation";

const DUPLICATE_NAME_ERROR = "Bu listede aynı isimde bir kayıt zaten var";
const NOT_FOUND_ERROR = "Kayıt bulunamadı";

function nameValues(name: string) {
  return { name, nameKey: name.toLocaleLowerCase("tr") };
}

/** e.g. "Ödeme Tipi: Nakit", the audit log's record name */
function auditLabel(kind: ParameterKind, name: string) {
  return `${PARAMETER_KIND_LABELS[kind]}: ${name}`;
}

export const parametersRoute = new Hono<AppEnv>()
  // every list at once; the page groups them by kind
  .get("/", async (c) => {
    const parameters = await db
      .select({
        id: parameterTable.id,
        kind: parameterTable.kind,
        name: parameterTable.name,
      })
      .from(parameterTable);

    return c.json(parameters.toSorted((a, b) => compareTr(a.name, b.name)));
  })
  .post(
    "/",
    zValidator("json", createParameterSchema, respondWithFirstIssue),
    async (c) => {
      const { kind, name } = c.req.valid("json");

      try {
        const id = await db.transaction(async (tx) => {
          const [parameter] = await tx
            .insert(parameterTable)
            .values({ kind, ...nameValues(name) })
            .returning();

          await recordAudit(tx, {
            actor: actorOf(c),
            action: "create",
            entityType: "parameter",
            entityId: parameter.id,
            entityLabel: auditLabel(kind, parameter.name),
            details: [
              { label: "Liste", value: PARAMETER_KIND_LABELS[kind] },
              { label: "Ad", value: parameter.name },
            ],
          });
          return parameter.id;
        });

        return c.json({ id, message: "Eklendi" }, 201);
      } catch (error) {
        if (pgErrorCode(error) === UNIQUE_VIOLATION) {
          return c.json({ error: DUPLICATE_NAME_ERROR }, 409);
        }
        throw error;
      }
    },
  )
  .patch(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("json", parameterNameSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");

      try {
        const found = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select({ kind: parameterTable.kind, name: parameterTable.name })
            .from(parameterTable)
            .where(eq(parameterTable.id, id));
          if (!existing) return false;

          const { name } = c.req.valid("json");
          await tx
            .update(parameterTable)
            .set(nameValues(name))
            .where(eq(parameterTable.id, id));

          const changes = change("Ad", existing.name, name);
          if (changes.length > 0) {
            await recordAudit(tx, {
              actor: actorOf(c),
              action: "update",
              entityType: "parameter",
              entityId: id,
              entityLabel: auditLabel(existing.kind, name),
              changes,
            });
          }
          return true;
        });

        if (!found) return c.json({ error: NOT_FOUND_ERROR }, 404);

        return c.json({ id, message: "Güncellendi" }, 200);
      } catch (error) {
        if (pgErrorCode(error) === UNIQUE_VIOLATION) {
          return c.json({ error: DUPLICATE_NAME_ERROR }, 409);
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
        const [parameter] = await tx
          .delete(parameterTable)
          .where(eq(parameterTable.id, id))
          .returning({ kind: parameterTable.kind, name: parameterTable.name });
        if (!parameter) return null;

        await recordAudit(tx, {
          actor: actorOf(c),
          action: "delete",
          entityType: "parameter",
          entityId: id,
          entityLabel: auditLabel(parameter.kind, parameter.name),
          details: [
            { label: "Liste", value: PARAMETER_KIND_LABELS[parameter.kind] },
            { label: "Ad", value: parameter.name },
          ],
        });
        return parameter;
      });

      if (!deleted) return c.json({ error: NOT_FOUND_ERROR }, 404);

      return c.json({ message: "Silindi" }, 200);
    },
  );
