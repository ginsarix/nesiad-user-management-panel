import { normalizePhone } from "./phone";

/** A member or yetkili picked on the Manuel tab, as stored in the panel */
export type Contact = {
  kind: "member" | "representative";
  id: number;
  name: string;
  phone: string | null;
};

/** One SMS goes to each recipient; `phone` is normalized ("5XXXXXXXXX") */
export type Recipient = { phone: string; contact: Contact };

export type SkipReason = "no_phone" | "invalid" | "duplicate";

export type RecipientList = {
  recipients: Recipient[];
  skipped: { contact: Contact; reason: SkipReason }[];
};

/**
 * Who gets the SMS. Each mobile number gets one SMS (the first contact with
 * it, in the given order); every contact that gets none is in `skipped`
 * with its reason.
 */
export function buildRecipients(contacts: Contact[]): RecipientList {
  const recipients: Recipient[] = [];
  const skipped: RecipientList["skipped"] = [];
  const seen = new Set<string>();

  for (const contact of contacts) {
    if (!contact.phone?.trim()) {
      skipped.push({ contact, reason: "no_phone" });
      continue;
    }
    const normalized = normalizePhone(contact.phone);
    if (!normalized.ok) {
      skipped.push({ contact, reason: "invalid" });
    } else if (seen.has(normalized.phone)) {
      skipped.push({ contact, reason: "duplicate" });
    } else {
      seen.add(normalized.phone);
      recipients.push({ phone: normalized.phone, contact });
    }
  }

  return { recipients, skipped };
}
