import { zValidator } from "@hono/zod-validator";
import { eq, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, type Executor } from "@/db";
import { collectionTable, parameterTable, paymentTable } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { change } from "@/lib/audit-diff";
import {
  PARAMETER_KIND_LABELS,
  type ParameterKind,
  parameterUsageNouns,
} from "@/lib/parameters";
import { compareTr } from "@/lib/turkish";
import {
  createParameterSchema,
  parameterNameSchema,
} from "@/lib/zod-schemas/parameter";
import {
  FOREIGN_KEY_VIOLATION,
  pgErrorCode,
  UNIQUE_VIOLATION,
} from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import {
  countOrganizationRoleUsage,
  organizationRoleUsageSql,
} from "./organization-queries";
import { idParamSchema, respondWithFirstIssue } from "./validation";

const DUPLICATE_NAME_ERROR = "Bu listede aynı isimde bir kayıt zaten var";
const NOT_FOUND_ERROR = "Kayıt bulunamadı";

function nameValues(name: string) {
  return { name, nameKey: name.toLocaleLowerCase("tr") };
}

/** Payments that use the entry as their Ödeme Türü or Ödeme Tipi */
function paymentsUsing(id: typeof parameterTable.id | number) {
  return or(eq(paymentTable.categoryId, id), eq(paymentTable.methodId, id));
}

/** Tahsilatlar that use the entry as their Tahsilat Türü or Tahsilat Tipi */
function collectionsUsing(id: typeof parameterTable.id | number) {
  return or(
    eq(collectionTable.categoryId, id),
    eq(collectionTable.methodId, id),
  );
}

/** How many payments, tahsilatlar and Organizasyon rows use the entry */
async function usageOf(executor: Executor, id: number) {
  const [payments, collections, organizationRows] = await Promise.all([
    executor.$count(paymentTable, paymentsUsing(id)),
    executor.$count(collectionTable, collectionsUsing(id)),
    countOrganizationRoleUsage(executor, id),
  ]);
  return payments + collections + organizationRows;
}

/** null when a concurrent record made the count unknown */
function inUseError(kind: ParameterKind, usageCount: number | null) {
  const noun = parameterUsageNouns(kind).locative;
  return usageCount
    ? `Bu kayıt ${usageCount} ${noun} kullanılıyor, silinemez.`
    : `Bu kayıt ${noun} kullanılıyor, silinemez.`;
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
        usageCount: sql<number>`(
          (select count(*) from ${paymentTable} where ${paymentsUsing(parameterTable.id)})
          + (select count(*) from ${collectionTable} where ${collectionsUsing(parameterTable.id)})
          + ${organizationRoleUsageSql(parameterTable.id)}
        )::int`,
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

      // the kind decides the refusal's wording, so read it first
      const [target] = await db
        .select({ kind: parameterTable.kind })
        .from(parameterTable)
        .where(eq(parameterTable.id, id));
      if (!target) return c.json({ error: NOT_FOUND_ERROR }, 404);

      const result = await db
        .transaction(async (tx) => {
          // payments, tahsilatlar and Organizasyon rows keep their entry:
          // refuse while any uses it
          const usageCount = await usageOf(tx, id);
          if (usageCount > 0) return { usageCount };

          const [parameter] = await tx
            .delete(parameterTable)
            .where(eq(parameterTable.id, id))
            .returning({
              kind: parameterTable.kind,
              name: parameterTable.name,
            });
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
          return { usageCount: 0 };
        })
        .catch((error) => {
          // a record added between the count and the delete
          if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
            return { usageCount: null };
          }
          throw error;
        });

      if (!result) return c.json({ error: NOT_FOUND_ERROR }, 404);
      if (result.usageCount !== 0) {
        return c.json(
          { error: inUseError(target.kind, result.usageCount) },
          409,
        );
      }

      return c.json({ message: "Silindi" }, 200);
    },
  );
