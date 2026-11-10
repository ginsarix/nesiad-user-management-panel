import { and, count, desc, eq, gte, lte, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Executor } from "@/db";
import { counterpartyTable, parameterTable, paymentTable } from "@/db/schema";
import type { PaymentFilters } from "@/lib/payment-filters";

const category = alias(parameterTable, "category");
const method = alias(parameterTable, "method");

/** A sum of amounts as "1250.50", added up in Postgres (never as floats) */
export function sumOfAmounts() {
  return sql<string>`coalesce(sum(${paymentTable.amount}), 0)::numeric(14,2)::text`;
}

/** Payments with their cari's current title and parameter names */
function selectPaymentRows(executor: Executor = db) {
  return executor
    .select({
      id: paymentTable.id,
      date: paymentTable.date,
      amount: paymentTable.amount,
      note: paymentTable.note,
      counterpartyId: paymentTable.counterpartyId,
      counterpartyTitle: counterpartyTable.title,
      categoryId: paymentTable.categoryId,
      categoryName: category.name,
      methodId: paymentTable.methodId,
      methodName: method.name,
    })
    .from(paymentTable)
    .innerJoin(
      counterpartyTable,
      eq(paymentTable.counterpartyId, counterpartyTable.id),
    )
    .innerJoin(category, eq(paymentTable.categoryId, category.id))
    .innerJoin(method, eq(paymentTable.methodId, method.id));
}

function whereOf(filters: PaymentFilters) {
  const conditions: (SQL | undefined)[] = [];
  if (filters.from) conditions.push(gte(paymentTable.date, filters.from));
  if (filters.to) conditions.push(lte(paymentTable.date, filters.to));
  if (filters.counterparty !== null) {
    conditions.push(eq(paymentTable.counterpartyId, filters.counterparty));
  }
  if (filters.category !== null) {
    conditions.push(eq(paymentTable.categoryId, filters.category));
  }
  if (filters.method !== null) {
    conditions.push(eq(paymentTable.methodId, filters.method));
  }
  return and(...conditions);
}

/** The filtered payments, newest first, with their count and total */
export async function selectPayments(filters: PaymentFilters) {
  const where = whereOf(filters);
  const [payments, [summary]] = await Promise.all([
    selectPaymentRows()
      .where(where)
      .orderBy(desc(paymentTable.date), desc(paymentTable.id)),
    db
      .select({ count: count(), total: sumOfAmounts() })
      .from(paymentTable)
      .where(where),
  ]);
  return { payments, count: summary.count, total: summary.total };
}

export async function selectPayment(id: number, executor: Executor = db) {
  const [payment] = await selectPaymentRows(executor).where(
    eq(paymentTable.id, id),
  );
  return payment ?? null;
}

export type PaymentRow = NonNullable<Awaited<ReturnType<typeof selectPayment>>>;
