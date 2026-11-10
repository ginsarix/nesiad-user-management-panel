/**
 * What has to exist before a tahsilat can be recorded: an Aktif member,
 * and a Tahsilat Türü and Tahsilat Tipi. A list that hasn't loaded
 * (undefined) counts as not missing. Client-safe.
 */
export function missingForCollections(
  members: readonly { status: string }[] | undefined,
  parameters: readonly { kind: string }[] | undefined,
) {
  return {
    member:
      members !== undefined && !members.some((m) => m.status === "active"),
    parameters:
      parameters !== undefined &&
      !(
        parameters.some((p) => p.kind === "collection_category") &&
        parameters.some((p) => p.kind === "collection_method")
      ),
  };
}
