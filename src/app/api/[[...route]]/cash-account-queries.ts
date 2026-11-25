import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import {
  cashAccountPeriodTable,
  cashAccountTable,
  collectionTable,
  paymentTable,
} from "@/db/schema";

/** A period with what's dated inside it, all amounts summed in Postgres */
export type PeriodBalanceRow = {
  id: number;
  cashAccountId: number;
  /** yyyy-MM-dd */
  startDate: string;
  /** the next period's start; null for the last one */
  nextStartDate: string | null;
  openingBalance: string;
  collected: string;
  paid: string;
  /** Başlangıç Bakiyesi + tahsilatlar − ödemeler dated in the period */
  balance: string;
  carriedFromPeriodId: number | null;
  carriedAmount: string | null;
};

/**
 * Every period of the given accounts (all accounts without `accountIds`),
 * ordered by account and start date. Sums use correlated subqueries, not
 * joins: joining both tables would repeat each tahsilat once per ödeme (and
 * the other way round) and inflate the sums.
 */
export async function selectPeriodBalances(
  executor: Executor,
  accountIds?: readonly number[],
): Promise<PeriodBalanceRow[]> {
  if (accountIds?.length === 0) return [];
  const where = accountIds
    ? sql`where ${inArray(cashAccountPeriodTable.cashAccountId, [...accountIds])}`
    : sql``;
  // inside the date range of period p
  const inPeriod = (table: typeof collectionTable | typeof paymentTable) =>
    sql`${table.cashAccountId} = p.cash_account_id
      and ${table.date} >= p.start_date
      and (p.next_start_date is null or ${table.date} < p.next_start_date)`;

  const { rows } = await executor.execute<PeriodBalanceRow>(sql`
    with p as (
      select
        ${cashAccountPeriodTable}.*,
        lead(${cashAccountPeriodTable.startDate}) over (
          partition by ${cashAccountPeriodTable.cashAccountId}
          order by ${cashAccountPeriodTable.startDate}
        ) as next_start_date
      from ${cashAccountPeriodTable}
      ${where}
    ), sums as (
      select
        p.*,
        coalesce((select sum(${collectionTable.amount}) from ${collectionTable} where ${inPeriod(collectionTable)}), 0) as collected,
        coalesce((select sum(${paymentTable.amount}) from ${paymentTable} where ${inPeriod(paymentTable)}), 0) as paid
      from p
    )
    select
      id,
      cash_account_id as "cashAccountId",
      start_date::text as "startDate",
      next_start_date::text as "nextStartDate",
      opening_balance::text as "openingBalance",
      collected::numeric(14,2)::text as collected,
      paid::numeric(14,2)::text as paid,
      (opening_balance + collected - paid)::numeric(14,2)::text as balance,
      carried_from_period_id as "carriedFromPeriodId",
      carried_amount::text as "carriedAmount"
    from sums
    order by cash_account_id, start_date
  `);
  return rows;
}

/**
 * Tahsilatlar and ödemeler dated before the account's first period: they
 * count in no Bakiye. `before` is that first start date (null without
 * periods, when nothing is counted).
 */
export async function selectOutsidePeriods(
  executor: Executor,
  accountId: number,
): Promise<{
  before: string | null;
  collectionCount: number;
  paymentCount: number;
}> {
  const [first] = await executor
    .select({ startDate: cashAccountPeriodTable.startDate })
    .from(cashAccountPeriodTable)
    .where(eq(cashAccountPeriodTable.cashAccountId, accountId))
    .orderBy(cashAccountPeriodTable.startDate)
    .limit(1);
  if (!first) return { before: null, collectionCount: 0, paymentCount: 0 };

  const collectionCount = await executor.$count(
    collectionTable,
    and(
      eq(collectionTable.cashAccountId, accountId),
      lt(collectionTable.date, first.startDate),
    ),
  );
  const paymentCount = await executor.$count(
    paymentTable,
    and(
      eq(paymentTable.cashAccountId, accountId),
      lt(paymentTable.date, first.startDate),
    ),
  );
  return { before: first.startDate, collectionCount, paymentCount };
}

/** The account's periods' start date and Başlangıç Bakiyesi, by date */
export async function selectPeriodsForAudit(
  executor: Executor,
  accountIds: readonly number[],
) {
  if (accountIds.length === 0) return [];
  return await executor
    .select({
      cashAccountId: cashAccountPeriodTable.cashAccountId,
      startDate: cashAccountPeriodTable.startDate,
      openingBalance: cashAccountPeriodTable.openingBalance,
    })
    .from(cashAccountPeriodTable)
    .where(inArray(cashAccountPeriodTable.cashAccountId, accountIds))
    .orderBy(cashAccountPeriodTable.startDate);
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
