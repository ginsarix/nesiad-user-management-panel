import { and, eq, inArray, sql } from "drizzle-orm";
import type { Transaction } from "@/db";
import { cashAccountPeriodTable } from "@/db/schema";
import { periodsAuditText } from "@/lib/cash-account-periods";
import { toKurus } from "@/lib/money";

const NO_LINK = { carriedFromPeriodId: null, carriedAmount: null };

/**
 * Replaces an account's periods with `periods`, as the form sends them:
 * rows with an `id` are updated, rows without one inserted, the rest
 * deleted. Run it with the account row locked (`for update`) so two saves
 * can't interleave; start dates are already distinct (the schema checks).
 *
 * Devir links are dropped where they no longer describe the period's
 * Başlangıç Bakiyesi: a hand-typed amount, a deleted source, or a source no
 * longer earlier than the period. Returns the before/after audit texts, or
 * "unknown period" when an `id` isn't one of the account's periods.
 */
export async function replacePeriods(
  tx: Transaction,
  cashAccountId: number,
  periods: readonly {
    id?: number;
    startDate: string;
    openingBalance: string;
  }[],
): Promise<{ before: string; after: string } | "unknown period"> {
  const existing = await tx
    .select()
    .from(cashAccountPeriodTable)
    .where(eq(cashAccountPeriodTable.cashAccountId, cashAccountId));
  const byId = new Map(existing.map((period) => [period.id, period]));
  if (
    periods.some((period) => period.id !== undefined && !byId.has(period.id))
  ) {
    return "unknown period";
  }

  const keptIds = new Set(periods.map((period) => period.id));
  const deletedIds = existing
    .filter((period) => !keptIds.has(period.id))
    .map((period) => period.id);
  if (deletedIds.length > 0) {
    // the FK would null the source, but the carried amount must go with it
    await tx
      .update(cashAccountPeriodTable)
      .set(NO_LINK)
      .where(inArray(cashAccountPeriodTable.carriedFromPeriodId, deletedIds));
    await tx
      .delete(cashAccountPeriodTable)
      .where(inArray(cashAccountPeriodTable.id, deletedIds));
  }

  for (const period of periods) {
    const saved = period.id === undefined ? undefined : byId.get(period.id);
    if (!saved) {
      await tx.insert(cashAccountPeriodTable).values({
        cashAccountId,
        startDate: period.startDate,
        openingBalance: period.openingBalance,
      });
      continue;
    }
    const handTyped =
      toKurus(saved.openingBalance) !== toKurus(period.openingBalance);
    if (!handTyped && saved.startDate === period.startDate) continue;
    await tx
      .update(cashAccountPeriodTable)
      .set({
        startDate: period.startDate,
        openingBalance: period.openingBalance,
        ...(handTyped && NO_LINK),
      })
      .where(eq(cashAccountPeriodTable.id, saved.id));
  }

  // a devir only goes forward: drop links whose source now starts on or
  // after the period
  await tx.execute(sql`
    update ${cashAccountPeriodTable} as p
    set carried_from_period_id = null, carried_amount = null
    from ${cashAccountPeriodTable} as s
    where s.id = p.carried_from_period_id
      and p.cash_account_id = ${cashAccountId}
      and s.start_date >= p.start_date
  `);

  return {
    before: periodsAuditText(existing),
    after: periodsAuditText(periods),
  };
}

/** The account's periods, for checking that two belong to it */
export async function periodsOfAccount(
  tx: Transaction,
  cashAccountId: number,
  ids: readonly number[],
) {
  return await tx
    .select()
    .from(cashAccountPeriodTable)
    .where(
      and(
        eq(cashAccountPeriodTable.cashAccountId, cashAccountId),
        inArray(cashAccountPeriodTable.id, [...ids]),
      ),
    );
}
