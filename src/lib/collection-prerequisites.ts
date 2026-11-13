/**
 * What has to exist before a tahsilat can be recorded: an Aktif yetkili,
 * and a Tahsilat Türü and Tahsilat Tipi. A list that hasn't loaded
 * (undefined) counts as not missing. Client-safe.
 */
export function missingForCollections(
  representatives: readonly { active: boolean }[] | undefined,
  parameters: readonly { kind: string }[] | undefined,
) {
  return {
    representative:
      representatives !== undefined && !representatives.some((r) => r.active),
    parameters:
      parameters !== undefined &&
      !(
        parameters.some((p) => p.kind === "collection_category") &&
        parameters.some((p) => p.kind === "collection_method")
      ),
  };
}
