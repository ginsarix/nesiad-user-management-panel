import { zValidator } from "@hono/zod-validator";
import { eq, inArray } from "drizzle-orm";
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
  method: { label: "Ödeme Tipi", format: formatAudit.text },
  note: { label: "Not", format: formatAudit.text },
};

type PaymentRecord = {
  counterparty: string;
  amount: string;
  date: string;
  category: string;
  method: string;
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

/** A cari or parameter the payment points at is missing or of the wrong list */
class PaymentReferenceError extends Error {}

/** Checks the cari and both parameters; returns their names */
async function resolveReferences(
  tx: Transaction,
  values: z.output<typeof paymentSchema>,
): Promise<PaymentRecord> {
  const [counterparty] = await tx
    .select({ title: counterpartyTable.title })
    .from(counterpartyTable)
    .where(eq(counterpartyTable.id, values.counterpartyId));
  if (!counterparty) throw new PaymentReferenceError("Seçilen cari bulunamadı");

  const parameters = await tx
    .select({
      id: parameterTable.id,
      kind: parameterTable.kind,
      name: parameterTable.name,
    })
    .from(parameterTable)
    .where(inArray(parameterTable.id, [values.categoryId, values.methodId]));
  const category = parameters.find(
    (p) => p.id === values.categoryId && p.kind === "payment_category",
  );
  if (!category)
    throw new PaymentReferenceError("Geçerli bir ödeme türü seçin");
  const method = parameters.find(
    (p) => p.id === values.methodId && p.kind === "payment_method",
  );
  if (!method) throw new PaymentReferenceError("Geçerli bir ödeme tipi seçin");

  return {
    counterparty: counterparty.title,
    amount: values.amount,
    date: values.date,
    category: category.name,
    method: method.name,
    note: values.note,
  };
}

function recordOf(row: PaymentRow): PaymentRecord {
  return {
    counterparty: row.counterpartyTitle,
    amount: row.amount,
    date: row.date,
    category: row.categoryName,
    method: row.methodName,
    note: row.note,
  };
}

// all optional text; parsePaymentFilters drops anything invalid
const filtersQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  counterparty: z.string().optional(),
  category: z.string().optional(),
  method: z.string().optional(),
});

const COLUMN_WIDTHS = [12, 32, 14, 20, 16, 40];

/** The Ödemeler list as an .xlsx: the payments, a blank row, the total */
async function paymentsWorkbook({
  payments,
}: Awaited<ReturnType<typeof selectPayments>>) {
  const total = sumAmounts(payments.map((payment) => payment.amount));
  return writeXlsxFile(
    [
      ["Tarih", "Cari", "Tutar", "Ödeme Türü", "Ödeme Tipi", "Not"].map(header),
      ...payments.map((payment) => [
        dateCell(payment.date),
        payment.counterpartyTitle,
        amountCell(payment.amount),
        payment.categoryName,
        payment.methodName,
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
          const record = await resolveReferences(tx, values);
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
          return c.json({ error: error.message }, 400);
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

          const record = await resolveReferences(tx, values);
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
          return c.json({ error: error.message }, 400);
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
