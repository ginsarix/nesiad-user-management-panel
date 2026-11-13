/**
 * What keeps a yetkili from being deleted, for the API's refusal and the
 * delete dialog: "2 tahsilat", "3 taahhüt", "2 tahsilat ve 3 taahhüt".
 * Null counts (a record added during the delete) give the vague form.
 * Client-safe.
 */
export function representativeRecordsText(
  collectionCount: number | null,
  pledgeCount: number | null,
) {
  if (collectionCount === null || pledgeCount === null) {
    return "tahsilat veya taahhüt";
  }
  return [
    collectionCount > 0 && `${collectionCount} tahsilat`,
    pledgeCount > 0 && `${pledgeCount} taahhüt`,
  ]
    .filter(Boolean)
    .join(" ve ");
}
