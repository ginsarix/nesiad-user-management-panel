import { differenceInYears, format, isValid, parse } from "date-fns";

/** How dates are typed and shown in the panel */
export const DISPLAY_FORMAT = "dd.MM.yyyy";
/** How dates travel through the API and sit in Postgres `date` columns */
export const ISO_FORMAT = "yyyy-MM-dd";

const DISPLAY_PATTERN = /^\d{2}\.\d{2}\.\d{4}$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a complete gg.aa.yyyy date; null for anything else, including
 * impossible dates like 31.02.2024 (which date-fns would otherwise roll over).
 */
export function parseDisplayDate(text: string) {
  return parseStrict(text, DISPLAY_PATTERN, DISPLAY_FORMAT);
}

export function parseIsoDate(text: string) {
  return parseStrict(text, ISO_PATTERN, ISO_FORMAT);
}

function parseStrict(text: string, pattern: RegExp, dateFormat: string) {
  if (!pattern.test(text)) return null;
  const date = parse(text, dateFormat, new Date());
  // a rolled-over date formats back differently
  return isValid(date) && format(date, dateFormat) === text ? date : null;
}

export function formatDisplayDate(date: Date) {
  return format(date, DISPLAY_FORMAT);
}

const PART_LENGTHS = [2, 2, 4];

/**
 * Formats gg.aa.yyyy as it is typed: "01" → "01.", "01.01" → "01.01.",
 * "1." → "01.", "01012020" → "01.01.2020". Any non-digit ends the day or
 * month; extra digits are dropped.
 */
export function autoFormatDisplayDate(text: string) {
  const parts = ["", "", ""];
  let index = 0;
  for (const char of text) {
    if (/\d/.test(char)) {
      if (parts[index].length === PART_LENGTHS[index]) {
        if (index === parts.length - 1) break;
        index++;
      }
      parts[index] += char;
    } else if (parts[index] && index < parts.length - 1) {
      parts[index] = parts[index].padStart(PART_LENGTHS[index], "0");
      index++;
    }
  }
  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const previousDone = parts[i - 1].length === PART_LENGTHS[i - 1];
    if (!parts[i] && !previousDone) break;
    result += `.${parts[i]}`;
    if (!parts[i]) break;
  }
  return result;
}

/** "05.03.2014" → "2014-03-05"; empty stays empty */
export function displayToIso(text: string) {
  const date = parseDisplayDate(text);
  return date ? format(date, ISO_FORMAT) : "";
}

/** "2014-03-05" → "05.03.2014"; null/empty becomes "" */
export function isoToDisplay(iso: string | null | undefined) {
  const date = iso ? parseIsoDate(iso) : null;
  return date ? formatDisplayDate(date) : "";
}

/** Today's date in Türkiye as yyyy-MM-dd, wherever the code runs */
export function todayInIstanbul(now = new Date()) {
  // en-CA formats as yyyy-MM-dd
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(now);
}

/**
 * Whether a typed date (a parsed calendar day) is after today in Türkiye.
 * Compares days, not instants, so it doesn't depend on the server's time
 * zone: just after midnight in Istanbul a UTC server still has yesterday.
 */
export function isFutureDate(date: Date, now = new Date()) {
  return format(date, ISO_FORMAT) > todayInIstanbul(now);
}

const SENIORITY_STEP = 5;

/** Full years of membership, or null without an Üye Giriş Tarihi */
export function membershipYears(
  memberLoginDate: string | null | undefined,
  today = new Date(),
) {
  const start = memberLoginDate ? parseIsoDate(memberLoginDate) : null;
  return start ? differenceInYears(today, start) : null;
}

/** "5 Yıl", "10 Yıl"… for every completed 5 years; null below 5 */
export function seniorityBadge(
  memberLoginDate: string | null | undefined,
  today = new Date(),
) {
  const years = membershipYears(memberLoginDate, today);
  if (years === null || years < SENIORITY_STEP) return null;
  return `${Math.floor(years / SENIORITY_STEP) * SENIORITY_STEP} Yıl`;
}

/**
 * A date filter as typed (gg.aa.yyyy). Only "empty" and "valid" can be
 * applied; anything else means the list doesn't match what's typed yet.
 */
export function dateFilterText(text: string): {
  state: "empty" | "valid" | "incomplete" | "invalid";
  iso: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) return { state: "empty", iso: null };
  const iso = displayToIso(trimmed);
  if (iso) return { state: "valid", iso };
  return {
    state: trimmed.length >= "gg.aa.yyyy".length ? "invalid" : "incomplete",
    iso: null,
  };
}
