import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { cashAccountPeriodTable, cashAccountTable } from "@/db/schema";

/**
 * A Kasa - Banka for a test, inserted directly with one period (from
 * 2000-01-01 unless `startDate` says otherwise, so every record counts);
 * its id goes into `ids`
 */
export async function insertTestCashAccount(
  name: string,
  ids: number[],
  values: {
    active?: boolean;
    openingBalance?: string;
    startDate?: string;
  } = {},
) {
  const { openingBalance = "0.00", startDate = "2000-01-01", active } = values;
  const [row] = await db
    .insert(cashAccountTable)
    .values({ name, nameKey: name.toLocaleLowerCase("tr"), active })
    .returning({ id: cashAccountTable.id });
  ids.push(row.id);
  await insertTestPeriod(row.id, startDate, openingBalance);
  return row.id;
}

/** Another period for a test account; deleted with the account */
export async function insertTestPeriod(
  cashAccountId: number,
  startDate: string,
  openingBalance = "0.00",
) {
  const [row] = await db
    .insert(cashAccountPeriodTable)
    .values({ cashAccountId, startDate, openingBalance })
    .returning({ id: cashAccountPeriodTable.id });
  return row.id;
}

/** Run after the payments and tahsilatlar pointing at them are gone */
export async function deleteTestCashAccounts(ids: number[]) {
  if (ids.length === 0) return;
  await db.delete(cashAccountTable).where(inArray(cashAccountTable.id, ids));
}
