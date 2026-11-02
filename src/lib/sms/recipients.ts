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

export type PhoneCheck =
  | { ok: true; phone: string }
  | { ok: false; reason: "no_phone" | "invalid" };

/** A stored phone as an SMS number ("5XXXXXXXXX"), or why it can't be one */
export function checkPhone(raw: string | null): PhoneCheck {
  if (!raw?.trim()) return { ok: false, reason: "no_phone" };
  const normalized = normalizePhone(raw);
  return normalized.ok
    ? { ok: true, phone: normalized.phone }
    : { ok: false, reason: "invalid" };
}

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
    const check = checkPhone(contact.phone);
    if (!check.ok) {
      skipped.push({ contact, reason: check.reason });
    } else if (seen.has(check.phone)) {
      skipped.push({ contact, reason: "duplicate" });
    } else {
      seen.add(check.phone);
      recipients.push({ phone: check.phone, contact });
    }
  }

  return { recipients, skipped };
}
