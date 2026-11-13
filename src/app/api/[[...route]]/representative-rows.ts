import { inArray } from "drizzle-orm";
import type { Transaction } from "@/db";
import { authorizedRepresentativeTable } from "@/db/schema";

/**
 * A refused row: `index` is its place in the submitted list, `field` the
 * input it is about
 */
export class InvalidRowError extends Error {
  constructor(
    message: string,
    readonly index: number,
    readonly field = "representativeId",
  ) {
    super(message);
  }
}

/**
 * Throws InvalidRowError unless every yetkili exists and is Aktif or
 * already among the saved rows (`currentIds`): a yetkili made Pasif keeps
 * their rows.
 */
export async function assertUsableRepresentatives(
  tx: Transaction,
  rows: readonly { representativeId: number }[],
  currentIds: ReadonlySet<number>,
) {
  if (rows.length === 0) return;

  const representatives = await tx
    .select({
      id: authorizedRepresentativeTable.id,
      active: authorizedRepresentativeTable.active,
    })
    .from(authorizedRepresentativeTable)
    .where(
      inArray(
        authorizedRepresentativeTable.id,
        rows.map((row) => row.representativeId),
      ),
    );
  const activeById = new Map(representatives.map((r) => [r.id, r.active]));

  rows.forEach((row, index) => {
    const active = activeById.get(row.representativeId);
    if (active === undefined) {
      throw new InvalidRowError("Seçilen yetkili bulunamadı", index);
    }
    if (!active && !currentIds.has(row.representativeId)) {
      throw new InvalidRowError("Pasif yetkili eklenemez", index);
    }
  });
}
