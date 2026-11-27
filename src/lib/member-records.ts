/** How many records hold on to a member; null when unknown */
export type MemberRecordCounts = {
  collections: number;
  pledges: number;
  accruals: number;
} | null;

/**
 * What keeps a member from being deleted, for the API's refusal and the
 * delete dialog: "2 tahsilat", "2 tahsilat ve 3 taahhüt", "2 tahsilat,
 * 3 taahhüt ve 1 tahakkuk". Unknown counts (a record added during the
 * delete) give the vague form. Client-safe.
 */
export function memberRecordsText(counts: MemberRecordCounts) {
  if (!counts) return "tahsilat, taahhüt veya tahakkuk";
  const parts = [
    counts.collections > 0 && `${counts.collections} tahsilat`,
    counts.pledges > 0 && `${counts.pledges} taahhüt`,
    counts.accruals > 0 && `${counts.accruals} tahakkuk`,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} ve ${parts.at(-1)}`
    : (parts[0] ?? "");
}

/** Whether any record holds on to the member */
export function hasMemberRecords(counts: NonNullable<MemberRecordCounts>) {
  return counts.collections + counts.pledges + counts.accruals > 0;
}
