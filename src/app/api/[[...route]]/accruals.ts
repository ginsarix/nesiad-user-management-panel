import { createHash } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, type Executor, type Transaction } from "@/db";
import {
  accrualTable,
  authorizedRepresentativeTable,
  parameterTable,
} from "@/db/schema";
import { accrualsAuditText } from "@/lib/accruals";
import { recordAudit } from "@/lib/audit";
import { change } from "@/lib/audit-diff";
import {
  type AccrualRowInput,
  accrualBodySchema,
} from "@/lib/zod-schemas/accrual";
import { FOREIGN_KEY_VIOLATION, pgErrorCode } from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import {
  assertUsableRepresentatives,
  InvalidRowError,
} from "./representative-rows";
import { respondWithFirstField } from "./validation";

export const ACCRUAL_CONFLICT_ERROR =
  "Tahakkuk siz düzenlerken başka biri tarafından değiştirildi. Değişikliklerinizi not alıp sayfayı yenileyin.";

/** The list in the order entered, with each row's yetkili and Aidat */
function loadAccruals(executor: Executor) {
  return executor
    .select({
      id: accrualTable.id,
      representativeId: accrualTable.representativeId,
      representativeName: authorizedRepresentativeTable.name,
      representativeActive: authorizedRepresentativeTable.active,
      categoryId: accrualTable.categoryId,
      categoryName: parameterTable.name,
      amount: accrualTable.amount,
    })
    .from(accrualTable)
    .innerJoin(
      authorizedRepresentativeTable,
      eq(accrualTable.representativeId, authorizedRepresentativeTable.id),
    )
    .innerJoin(parameterTable, eq(accrualTable.categoryId, parameterTable.id))
    .orderBy(asc(accrualTable.position), asc(accrualTable.id));
}

/**
 * Names the list's contents: equal rows give an equal version, so a save
 * can tell whether the list changed since the page loaded it
 */
function versionOf(rows: readonly AccrualRowInput[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        rows.map((row) => [row.representativeId, row.categoryId, row.amount]),
      ),
    )
    .digest("hex");
}

/** Throws InvalidRowError unless every Aidat is a Tahsilat Türü */
async function assertAidatIsCollectionCategory(
  tx: Transaction,
  rows: readonly AccrualRowInput[],
) {
  if (rows.length === 0) return;

  const categories = await tx
    .select({ id: parameterTable.id })
    .from(parameterTable)
    .where(
      and(
        inArray(
          parameterTable.id,
          rows.map((row) => row.categoryId),
        ),
        eq(parameterTable.kind, "collection_category"),
      ),
    );
  const ids = new Set(categories.map((category) => category.id));
  const index = rows.findIndex((row) => !ids.has(row.categoryId));
  if (index !== -1) {
    throw new InvalidRowError("Seçilen aidat bulunamadı", index, "categoryId");
  }
}

export const accrualsRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await loadAccruals(db);
    return c.json({ rows, version: versionOf(rows) });
  })
  .put(
    "/",
    zValidator("json", accrualBodySchema, respondWithFirstField),
    async (c) => {
      const { rows, version } = c.req.valid("json");

      try {
        const result = await db.transaction(async (tx) => {
          // one save at a time; reading stays open
          await tx.execute(
            sql`lock table ${accrualTable} in share row exclusive mode`,
          );
          const before = await loadAccruals(tx);
          if (versionOf(before) !== version) return { conflict: true as const };

          await assertUsableRepresentatives(
            tx,
            rows,
            new Set(before.map((row) => row.representativeId)),
          );
          await assertAidatIsCollectionCategory(tx, rows);
          await tx.delete(accrualTable);
          if (rows.length > 0) {
            await tx.insert(accrualTable).values(
              rows.map((row, position) => ({
                representativeId: row.representativeId,
                categoryId: row.categoryId,
                amount: row.amount,
                position,
              })),
            );
          }

          const after = await loadAccruals(tx);
          const changes = change(
            "Tahakkuk",
            accrualsAuditText(before),
            accrualsAuditText(after),
          );
          if (changes.length > 0) {
            await recordAudit(tx, {
              actor: actorOf(c),
              action: "update",
              entityType: "accrual",
              entityLabel: "Tahakkuk",
              changes,
            });
          }
          return { conflict: false as const, version: versionOf(after) };
        });

        if (result.conflict) {
          return c.json({ error: ACCRUAL_CONFLICT_ERROR }, 409);
        }
        return c.json(
          { version: result.version, message: "Tahakkuk kaydedildi" },
          200,
        );
      } catch (error) {
        if (error instanceof InvalidRowError) {
          return c.json(
            {
              error: error.message,
              field: `rows.${error.index}.${error.field}`,
            },
            400,
          );
        }
        // a yetkili or Aidat deleted while the page was open
        if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
          return c.json(
            { error: "Seçilen yetkili veya aidat bulunamadı" },
            400,
          );
        }
        throw error;
      }
    },
  );
