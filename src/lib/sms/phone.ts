type NormalizePhoneResult =
  | { ok: true; phone: string }
  | { ok: false; reason: "landline" | "length" | "unknown" };

/**
 * A Turkish mobile number in the form NetGSM wants, "5XXXXXXXXX" (10 digits,
 * no leading 0, 90 or 0090), or why `raw` can't get an SMS. The panel stores
 * phones as free text.
 */
export function normalizePhone(raw: string): NormalizePhoneResult {
  const digits = raw.replace(/\D/g, "");

  // "+" or "00" means a country code follows; only Türkiye's (90) is allowed
  const isInternational = /^\s*(\+|00)/.test(raw);
  if (isInternational && !/^(00)?90/.test(digits)) {
    return { ok: false, reason: "unknown" };
  }

  const indexOfArea = digits.search(/2|3|4|5/);
  if (indexOfArea === -1) return { ok: false, reason: "unknown" };

  const countryCode = digits.slice(0, indexOfArea);
  const normalized = digits.slice(indexOfArea);

  const isNotTurkiye = countryCode.search(/[^90]/) !== -1;

  if (isNotTurkiye) return { ok: false, reason: "unknown" };

  const isUnsupportedLandline = normalized[0] !== "5";

  if (isUnsupportedLandline) return { ok: false, reason: "landline" };

  if (normalized.length !== 10) return { ok: false, reason: "length" };

  return { ok: true, phone: normalized };
}

/** A phone number for the audit log: only the last 4 digits, "••• ••• 45 67". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "—";
  const last = digits.slice(-4);
  return `••• ••• ${last.slice(0, 2)} ${last.slice(2)}`;
}

/** A stored "5321234567" for display, "0532 123 45 67"; anything else as is. */
export function formatPhone(phone: string): string {
  const match = /^(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return match ? `0${match[1]} ${match[2]} ${match[3]} ${match[4]}` : phone;
}
