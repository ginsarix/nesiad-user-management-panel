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
