/**
 * What has to exist before a tahsilat can be recorded: an Aktif yetkili, a
 * Tahsilat Türü and an Aktif Kasa - Banka. A list that hasn't loaded
 * (undefined) counts as not missing. Client-safe.
 */
export function missingForCollections(
  representatives: readonly { active: boolean }[] | undefined,
  parameters: readonly { kind: string }[] | undefined,
  cashAccounts: readonly { active: boolean }[] | undefined,
) {
  return {
    representative:
      representatives !== undefined && !representatives.some((r) => r.active),
    parameters:
      parameters !== undefined &&
      !parameters.some((p) => p.kind === "collection_category"),
    cashAccount:
      cashAccounts !== undefined && !cashAccounts.some((a) => a.active),
  };
}
