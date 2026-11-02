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
 * LEVEL 2 (you write this): who gets the SMS. Each phone number gets one
 * SMS, and every contact that gets none is in `skipped` with its reason.
 *
 * FAKE (Level 0): every contact with any phone text is a recipient, as is.
 */
export function buildRecipients(contacts: Contact[]): RecipientList {
  return {
    recipients: contacts.flatMap((contact) =>
      contact.phone ? [{ phone: contact.phone, contact }] : [],
    ),
    skipped: [],
  };
}
