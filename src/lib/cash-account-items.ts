/** Client-safe. */

type Account = { id: number; name: string; active: boolean };

/**
 * Kasa - Banka picker items (the API sorts by name). Pasif accounts are
 * marked; `keep` says which Pasif ones to offer: none for a new record, the
 * record's own when editing, all of them for a list filter.
 */
export function cashAccountItems(
  accounts: readonly Account[],
  keep: number | null | "all",
) {
  return accounts
    .filter((a) => a.active || keep === "all" || a.id === keep)
    .map((a) => ({
      value: a.id,
      label: a.active ? a.name : `${a.name} (Pasif)`,
    }));
}

/**
 * A form's starting Kasa - Banka: the record's own, else the page it was
 * opened from (when Aktif), else the only Aktif one if there's just one
 */
export function initialCashAccountId(
  accounts: readonly Account[],
  recordId: number | undefined,
  fromId: number | undefined,
) {
  if (recordId !== undefined) return recordId;
  const active = accounts.filter((account) => account.active);
  if (fromId !== undefined && active.some((a) => a.id === fromId)) {
    return fromId;
  }
  return active.length === 1 ? active[0].id : null;
}
