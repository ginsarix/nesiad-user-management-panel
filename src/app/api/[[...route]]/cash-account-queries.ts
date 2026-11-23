import { eq, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { cashAccountTable, collectionTable, paymentTable } from "@/db/schema";

// Correlated subqueries, not joins: joining both tables would repeat each
// tahsilat once per ödeme (and the other way round) and inflate the sums.

/** Bakiye as "1250.50": Başlangıç Bakiyesi + tahsilatlar − ödemeler */
export function cashAccountBalance() {
  return sql<string>`(${cashAccountTable.openingBalance}
    + coalesce((select sum(${collectionTable.amount}) from ${collectionTable} where ${collectionTable.cashAccountId} = ${cashAccountTable.id}), 0)
    - coalesce((select sum(${paymentTable.amount}) from ${paymentTable} where ${paymentTable.cashAccountId} = ${cashAccountTable.id}), 0)
  )::numeric(14,2)::text`;
}

/** How many ödemeler and tahsilatlar use the account */
export function cashAccountUsage() {
  return {
    paymentCount: sql<number>`(select count(*)::int from ${paymentTable} where ${paymentTable.cashAccountId} = ${cashAccountTable.id})`,
    collectionCount: sql<number>`(select count(*)::int from ${collectionTable} where ${collectionTable.cashAccountId} = ${cashAccountTable.id})`,
  };
}

/**
 * The Kasa - Banka an ödeme or tahsilat is saved with: it must exist, and
 * be Aktif unless the record already has it (`currentId`, when editing).
 */
export async function usableCashAccount(
  executor: Executor,
  id: number,
  currentId: number | null,
): Promise<{ name: string } | { error: string }> {
  const [account] = await executor
    .select({ name: cashAccountTable.name, active: cashAccountTable.active })
    .from(cashAccountTable)
    .where(eq(cashAccountTable.id, id));
  if (!account) return { error: "Seçilen Kasa - Banka bulunamadı" };
  if (!account.active && currentId !== id) {
    return { error: "Seçilen Kasa - Banka aktif değil" };
  }
  return { name: account.name };
}
