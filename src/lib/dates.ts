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

export function isFutureDate(date: Date, today = new Date()) {
  return date.getTime() > today.getTime();
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
