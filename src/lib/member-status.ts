/** Client-safe: no db imports. */
export const MEMBER_STATUSES = [
  "active",
  "passive",
  "candidate",
  "rejected",
] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: "Aktif",
  passive: "Pasif",
  candidate: "Aday",
  rejected: "Reddedildi",
};

/** Active and passive members are the real ones; the rest are applicants */
export function isEstablished(status: MemberStatus) {
  return status === "active" || status === "passive";
}
