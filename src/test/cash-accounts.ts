import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { cashAccountTable } from "@/db/schema";

/** A Kasa - Banka for a test, inserted directly; its id goes into `ids` */
export async function insertTestCashAccount(
  name: string,
  ids: number[],
  values: { active?: boolean; openingBalance?: string } = {},
) {
  const [row] = await db
    .insert(cashAccountTable)
    .values({ name, nameKey: name.toLocaleLowerCase("tr"), ...values })
    .returning({ id: cashAccountTable.id });
  ids.push(row.id);
  return row.id;
}

/** Run after the payments and tahsilatlar pointing at them are gone */
export async function deleteTestCashAccounts(ids: number[]) {
  if (ids.length === 0) return;
  await db.delete(cashAccountTable).where(inArray(cashAccountTable.id, ids));
}
