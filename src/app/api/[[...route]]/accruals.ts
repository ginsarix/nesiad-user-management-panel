import { createHash } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, type Executor } from "@/db";
import { accrualTable, authorizedRepresentativeTable } from "@/db/schema";
import { amountRowsAuditText } from "@/lib/amount-rows";
import { recordAudit } from "@/lib/audit";
import { change } from "@/lib/audit-diff";
import { accrualBodySchema } from "@/lib/zod-schemas/accrual";
import { FOREIGN_KEY_VIOLATION, pgErrorCode } from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import {
  assertUsableRepresentatives,
  InvalidRowError,
} from "./representative-rows";
import { respondWithFirstField } from "./validation";

export const ACCRUAL_CONFLICT_ERROR =
  "Tahakkuk siz düzenlerken başka biri tarafından değiştirildi. Değişikliklerinizi not alıp sayfayı yenileyin.";

/** The list in the order entered, with each row's yetkili */
function loadAccruals(executor: Executor) {
  return executor
    .select({
      id: accrualTable.id,
      representativeId: accrualTable.representativeId,
      representativeName: authorizedRepresentativeTable.name,
      representativeActive: authorizedRepresentativeTable.active,
      quantity: accrualTable.quantity,
      amount: accrualTable.amount,
    })
    .from(accrualTable)
    .innerJoin(
      authorizedRepresentativeTable,
      eq(accrualTable.representativeId, authorizedRepresentativeTable.id),
    )
    .orderBy(asc(accrualTable.position), asc(accrualTable.id));
}

/**
 * Names the list's contents: equal rows give an equal version, so a save
 * can tell whether the list changed since the page loaded it
 */
function versionOf(
  rows: readonly {
    representativeId: number;
    quantity: number;
    amount: string;
  }[],
) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        rows.map((row) => [row.representativeId, row.quantity, row.amount]),
      ),
    )
    .digest("hex");
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
          await tx.delete(accrualTable);
          if (rows.length > 0) {
            await tx.insert(accrualTable).values(
              rows.map((row, position) => ({
                representativeId: row.representativeId,
                quantity: row.quantity,
                amount: row.amount,
                position,
              })),
            );
          }

          const after = await loadAccruals(tx);
          const changes = change(
            "Tahakkuk",
            amountRowsAuditText(before),
            amountRowsAuditText(after),
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
              field: `rows.${error.index}.representativeId`,
            },
            400,
          );
        }
        // a yetkili deleted while the page was open
        if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
          return c.json({ error: "Seçilen yetkili bulunamadı" }, 400);
        }
        throw error;
      }
    },
  );
