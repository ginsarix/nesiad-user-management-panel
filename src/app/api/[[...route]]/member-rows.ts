import { inArray, sql } from "drizzle-orm";
import type { Transaction } from "@/db";
import { memberTable } from "@/db/schema";

/**
 * A member's "Ad Soyad" in SQL, the same text as `memberName`
 * (`src/lib/member-name.ts`): Adı and Soyadı, trimmed
 */
export function memberNameSql() {
  return sql<string>`trim(${memberTable.firstName} || ' ' || ${memberTable.lastName})`;
}

/** Whether the member is Aktif, as a boolean column */
export function memberActiveSql() {
  return sql<boolean>`(${memberTable.status} = 'active')`;
}

/**
 * A refused row: `index` is its place in the submitted list, `field` the
 * input it is about
 */
export class InvalidRowError extends Error {
  constructor(
    message: string,
    readonly index: number,
    readonly field = "memberId",
  ) {
    super(message);
  }
}

/**
 * Throws InvalidRowError unless every member (`ids`, one per submitted row)
 * exists and is Aktif or among `keep` (the saved rows' members): a member
 * made Pasif keeps their rows, while an Aday, Reddedildi or Pasif member
 * can't be added.
 */
export async function assertUsableMembers(
  tx: Transaction,
  ids: readonly number[],
  keep: readonly number[],
): Promise<void> {
  if (ids.length === 0) return;

  const members = await tx
    .select({ id: memberTable.id, status: memberTable.status })
    .from(memberTable)
    .where(inArray(memberTable.id, [...new Set(ids)]));
  const statusById = new Map(members.map((m) => [m.id, m.status]));
  const kept = new Set(keep);

  ids.forEach((id, index) => {
    const status = statusById.get(id);
    if (status === undefined) {
      throw new InvalidRowError("Seçilen üye bulunamadı", index);
    }
    if (status !== "active" && !kept.has(id)) {
      throw new InvalidRowError("Aktif olmayan üye eklenemez", index);
    }
  });
}
