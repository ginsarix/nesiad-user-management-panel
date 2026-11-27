/**
 * A member's "Ad Soyad", as shown everywhere and written to the audit log.
 * Trimmed: a member converted from a one-word yetkili name has no Soyadı.
 * Client-safe.
 */
export function memberName(member: { firstName: string; lastName: string }) {
  return `${member.firstName} ${member.lastName}`.trim();
}
