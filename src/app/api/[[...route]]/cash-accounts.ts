import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import { cashAccountTable, collectionTable, paymentTable } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  type AuditSpec,
  describeFields,
  diffFields,
  formatAudit,
} from "@/lib/audit-diff";
import { formatAmount } from "@/lib/money";
import { compareTr } from "@/lib/turkish";
import {
  type CashAccountApiValues,
  cashAccountSchema,
} from "@/lib/zod-schemas/cash-account";
import { cashAccountBalance, cashAccountUsage } from "./cash-account-queries";
import {
  FOREIGN_KEY_VIOLATION,
  pgErrorCode,
  UNIQUE_VIOLATION,
} from "./db-errors";
import { type AppEnv, actorOf } from "./env";
import {
  idParamSchema,
  respondWithFirstField,
  respondWithFirstIssue,
} from "./validation";

const NOT_FOUND_ERROR = "Kasa - Banka bulunamadı";
const DUPLICATE_NAME_ERROR = "Bu isimde bir Kasa - Banka zaten var";

const cashAccountAuditSpec: AuditSpec = {
  name: { label: "İsim", format: formatAudit.text },
  openingBalance: {
    label: "Başlangıç Bakiyesi",
    format: (value) => formatAmount(value as string),
  },
  active: { label: "Durum", format: formatAudit.active },
};

const cashAccountColumns = {
  id: cashAccountTable.id,
  name: cashAccountTable.name,
  openingBalance: cashAccountTable.openingBalance,
  active: cashAccountTable.active,
  balance: cashAccountBalance(),
  ...cashAccountUsage(),
};

function withNameKey(values: CashAccountApiValues) {
  return { ...values, nameKey: values.name.toLocaleLowerCase("tr") };
}

/**
 * "Bu hesaba ait 2 ödeme ve 1 tahsilat var. …"; null counts when a record
 * was added between the count and the delete
 */
function hasRecordsError(
  counts: {
    paymentCount: number;
    collectionCount: number;
  } | null,
) {
  const parts = counts
    ? [
        counts.paymentCount > 0 && `${counts.paymentCount} ödeme`,
        counts.collectionCount > 0 && `${counts.collectionCount} tahsilat`,
      ].filter(Boolean)
    : ["ödeme veya tahsilat"];
  return `Bu hesaba ait ${parts.join(" ve ")} var. Silmek yerine pasif yapabilirsiniz.`;
}

function duplicateName(error: unknown) {
  return pgErrorCode(error) === UNIQUE_VIOLATION;
}

export const cashAccountsRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const accounts = await db.select(cashAccountColumns).from(cashAccountTable);
    return c.json(accounts.sort((a, b) => compareTr(a.name, b.name)));
  })
  .get(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const [account] = await db
        .select(cashAccountColumns)
        .from(cashAccountTable)
        .where(eq(cashAccountTable.id, c.req.valid("param").id));
      if (!account) return c.json({ error: NOT_FOUND_ERROR }, 404);
      return c.json(account, 200);
    },
  )
  .post(
    "/",
    zValidator("json", cashAccountSchema, respondWithFirstField),
    async (c) => {
      const values = c.req.valid("json");
      try {
        const id = await db.transaction(async (tx) => {
          const [account] = await tx
            .insert(cashAccountTable)
            .values(withNameKey(values))
            .returning();
          await recordAudit(tx, {
            actor: actorOf(c),
            action: "create",
            entityType: "cash_account",
            entityId: account.id,
            entityLabel: account.name,
            details: describeFields(cashAccountAuditSpec, account),
          });
          return account.id;
        });
        return c.json({ id, message: "Kasa - Banka kaydedildi" }, 201);
      } catch (error) {
        if (duplicateName(error)) {
          return c.json({ error: DUPLICATE_NAME_ERROR, field: "name" }, 409);
        }
        throw error;
      }
    },
  )
  .patch(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("json", cashAccountSchema, respondWithFirstField),
    async (c) => {
      const { id } = c.req.valid("param");
      const values = c.req.valid("json");
      try {
        const found = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(cashAccountTable)
            .where(eq(cashAccountTable.id, id));
          if (!existing) return false;

          await tx
            .update(cashAccountTable)
            .set(withNameKey(values))
            .where(eq(cashAccountTable.id, id));

          const changes = diffFields(cashAccountAuditSpec, existing, values);
          if (changes.length > 0) {
            await recordAudit(tx, {
              actor: actorOf(c),
              action: "update",
              entityType: "cash_account",
              entityId: id,
              entityLabel: values.name,
              changes,
            });
          }
          return true;
        });
        if (!found) return c.json({ error: NOT_FOUND_ERROR }, 404);
        return c.json({ id, message: "Kasa - Banka güncellendi" }, 200);
      } catch (error) {
        if (duplicateName(error)) {
          return c.json({ error: DUPLICATE_NAME_ERROR, field: "name" }, 409);
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

      const result = await db
        .transaction(async (tx) => {
          // one at a time: inside a transaction they share one connection
          const paymentCount = await tx.$count(
            paymentTable,
            eq(paymentTable.cashAccountId, id),
          );
          const collectionCount = await tx.$count(
            collectionTable,
            eq(collectionTable.cashAccountId, id),
          );
          if (paymentCount > 0 || collectionCount > 0) {
            return { refused: { paymentCount, collectionCount } };
          }

          const [account] = await tx
            .delete(cashAccountTable)
            .where(eq(cashAccountTable.id, id))
            .returning();
          if (!account) return null;

          await recordAudit(tx, {
            actor: actorOf(c),
            action: "delete",
            entityType: "cash_account",
            entityId: id,
            entityLabel: account.name,
            details: describeFields(cashAccountAuditSpec, account),
          });
          return { refused: undefined };
        })
        .catch((error) => {
          // a record added between the count and the delete
          if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
            return { refused: null };
          }
          throw error;
        });

      if (!result) return c.json({ error: NOT_FOUND_ERROR }, 404);
      if (result.refused !== undefined) {
        return c.json({ error: hasRecordsError(result.refused) }, 409);
      }
      return c.json({ message: "Kasa - Banka silindi" }, 200);
    },
  );
