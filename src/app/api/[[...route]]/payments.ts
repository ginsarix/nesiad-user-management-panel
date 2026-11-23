import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import writeXlsxFile from "write-excel-file/node";
import { z } from "zod";
import { db, type Transaction } from "@/db";
import { counterpartyTable, parameterTable, paymentTable } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  type AuditSpec,
  describeFields,
  diffFields,
  formatAudit,
} from "@/lib/audit-diff";
import { isoToDisplay } from "@/lib/dates";
import { formatAmount, sumAmounts } from "@/lib/money";
import { parsePaymentFilters } from "@/lib/payment-filters";
import { paymentSchema } from "@/lib/zod-schemas/payment";
import { usableCashAccount } from "./cash-account-queries";
import { type AppEnv, actorOf } from "./env";
import { amountCell, dateCell, header, xlsxResponse } from "./excel";
import {
  type PaymentRow,
  selectPayment,
  selectPayments,
} from "./payment-queries";
import { idParamSchema, respondWithFirstIssue } from "./validation";

const NOT_FOUND_ERROR = "Ödeme bulunamadı";

const paymentAuditSpec: AuditSpec = {
  counterparty: { label: "Cari", format: formatAudit.text },
  amount: { label: "Tutar", format: formatAudit.text },
  date: { label: "Tarih", format: formatAudit.date },
  category: { label: "Ödeme Türü", format: formatAudit.text },
  cashAccount: { label: "Kasa - Banka", format: formatAudit.text },
  note: { label: "Not", format: formatAudit.text },
};

type PaymentRecord = {
  counterparty: string;
  amount: string;
  date: string;
  category: string;
  cashAccount: string;
  note: string | null;
};

/** The payment as the audit log shows it: names, not ids */
function auditRecord(record: PaymentRecord) {
  return { ...record, amount: formatAmount(record.amount) };
}

/** "Çiçekçi Ayşe · ₺1.250,00 · 10.11.2026" */
function auditLabel({ counterparty, amount, date }: PaymentRecord) {
  return `${counterparty} · ${formatAmount(amount)} · ${isoToDisplay(date)}`;
}

/**
 * A cari, Ödeme Türü or Kasa - Banka the payment points at is missing, of
 * the wrong list or Pasif; `field` is the input it is about
 */
class PaymentReferenceError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
  }
}

/**
 * Checks the cari, Ödeme Türü and Kasa - Banka; returns their names. A new
 * payment needs an Aktif Kasa - Banka; an edit may keep the one it has.
 */
async function resolveReferences(
  tx: Transaction,
  values: z.output<typeof paymentSchema>,
  existing: PaymentRow | null,
): Promise<PaymentRecord> {
  const [counterparty] = await tx
    .select({ title: counterpartyTable.title })
    .from(counterpartyTable)
    .where(eq(counterpartyTable.id, values.counterpartyId));
  if (!counterparty) {
    throw new PaymentReferenceError(
      "Seçilen cari bulunamadı",
      "counterpartyId",
    );
  }

  const [category] = await tx
    .select({ kind: parameterTable.kind, name: parameterTable.name })
    .from(parameterTable)
    .where(eq(parameterTable.id, values.categoryId));
  if (category?.kind !== "payment_category") {
    throw new PaymentReferenceError(
      "Geçerli bir ödeme türü seçin",
      "categoryId",
    );
  }

  const cashAccount = await usableCashAccount(
    tx,
    values.cashAccountId,
    existing?.cashAccountId ?? null,
  );
  if ("error" in cashAccount) {
    throw new PaymentReferenceError(cashAccount.error, "cashAccountId");
  }

  return {
    counterparty: counterparty.title,
    amount: values.amount,
    date: values.date,
    category: category.name,
    cashAccount: cashAccount.name,
    note: values.note,
  };
}

function recordOf(row: PaymentRow): PaymentRecord {
  return {
    counterparty: row.counterpartyTitle,
    amount: row.amount,
    date: row.date,
    category: row.categoryName,
    cashAccount: row.cashAccountName,
    note: row.note,
  };
}

// all optional text; parsePaymentFilters drops anything invalid
const filtersQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  counterparty: z.string().optional(),
  category: z.string().optional(),
  cashAccount: z.string().optional(),
});

const COLUMN_WIDTHS = [12, 32, 14, 20, 16, 40];

/** The Ödemeler list as an .xlsx: the payments, a blank row, the total */
async function paymentsWorkbook({
  payments,
}: Awaited<ReturnType<typeof selectPayments>>) {
  const total = sumAmounts(payments.map((payment) => payment.amount));
  return writeXlsxFile(
    [
      ["Tarih", "Cari", "Tutar", "Ödeme Türü", "Kasa - Banka", "Not"].map(
        header,
      ),
      ...payments.map((payment) => [
        dateCell(payment.date),
        payment.counterpartyTitle,
        amountCell(payment.amount),
        payment.categoryName,
        payment.cashAccountName,
        payment.note,
      ]),
      [],
      [header("Toplam"), null, { ...amountCell(total), fontWeight: "bold" }],
    ],
    {
      sheet: "Ödemeler",
      stickyRowsCount: 1,
      columns: COLUMN_WIDTHS.map((width) => ({ width })),
    },
  ).toBuffer();
}

export const paymentsRoute = new Hono<AppEnv>()
  .get("/", zValidator("query", filtersQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const filters = parsePaymentFilters({
      get: (name) => query[name as keyof typeof query] ?? null,
    });
    return c.json(await selectPayments(filters));
  })
  // before "/:id", which would take "export" for an id
  .get("/export", zValidator("query", filtersQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const filters = parsePaymentFilters({
      get: (name) => query[name as keyof typeof query] ?? null,
    });
    const buffer = await paymentsWorkbook(await selectPayments(filters));
    return xlsxResponse(c, buffer, "odemeler");
  })
  .get(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    async (c) => {
      const payment = await selectPayment(c.req.valid("param").id);
      if (!payment) return c.json({ error: NOT_FOUND_ERROR }, 404);
      return c.json(payment, 200);
    },
  )
  .post(
    "/",
    zValidator("json", paymentSchema, respondWithFirstIssue),
    async (c) => {
      const values = c.req.valid("json");
      try {
        const id = await db.transaction(async (tx) => {
          const record = await resolveReferences(tx, values, null);
          const [payment] = await tx
            .insert(paymentTable)
            .values(values)
            .returning({ id: paymentTable.id });

          await recordAudit(tx, {
            actor: actorOf(c),
            action: "create",
            entityType: "payment",
            entityId: payment.id,
            entityLabel: auditLabel(record),
            details: describeFields(paymentAuditSpec, auditRecord(record)),
          });
          return payment.id;
        });

        return c.json({ id, message: "Ödeme kaydedildi" }, 201);
      } catch (error) {
        if (error instanceof PaymentReferenceError) {
          return c.json({ error: error.message, field: error.field }, 400);
        }
        throw error;
      }
    },
  )
  .patch(
    "/:id",
    zValidator("param", idParamSchema, respondWithFirstIssue),
    zValidator("json", paymentSchema, respondWithFirstIssue),
    async (c) => {
      const { id } = c.req.valid("param");
      const values = c.req.valid("json");

      try {
        const found = await db.transaction(async (tx) => {
          const existing = await selectPayment(id, tx);
          if (!existing) return false;

          const record = await resolveReferences(tx, values, existing);
          await tx
            .update(paymentTable)
            .set(values)
            .where(eq(paymentTable.id, id));

          const changes = diffFields(
            paymentAuditSpec,
            auditRecord(recordOf(existing)),
            auditRecord(record),
          );
          if (changes.length > 0) {
            await recordAudit(tx, {
              actor: actorOf(c),
              action: "update",
              entityType: "payment",
              entityId: id,
              entityLabel: auditLabel(record),
              changes,
            });
          }
          return true;
        });

        if (!found) return c.json({ error: NOT_FOUND_ERROR }, 404);

        return c.json({ id, message: "Ödeme güncellendi" }, 200);
      } catch (error) {
        if (error instanceof PaymentReferenceError) {
          return c.json({ error: error.message, field: error.field }, 400);
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
        const existing = await selectPayment(id, tx);
        if (!existing) return false;

        await tx.delete(paymentTable).where(eq(paymentTable.id, id));
        const record = recordOf(existing);
        await recordAudit(tx, {
          actor: actorOf(c),
          action: "delete",
          entityType: "payment",
          entityId: id,
          entityLabel: auditLabel(record),
          details: describeFields(paymentAuditSpec, auditRecord(record)),
        });
        return true;
      });

      if (!deleted) return c.json({ error: NOT_FOUND_ERROR }, 404);

      return c.json({ message: "Ödeme silindi" }, 200);
    },
  );
