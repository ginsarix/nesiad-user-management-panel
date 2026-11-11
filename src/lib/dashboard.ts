/** Client-safe: no db imports. Helpers for the dashboard (Genel Bakış). */
import { addMonths, format, subDays } from "date-fns";
import { ISO_FORMAT, membershipYears, parseIsoDate } from "./dates";

/** How many days of celebrations "Yaklaşan kutlamalar" looks ahead, today included */
export const CELEBRATION_DAYS = 7;
/** How far back "Gönderilemeyen SMS'ler" looks */
export const FAILED_SMS_DAYS = 30;
/** How many of the oldest Aday applications are listed */
export const CANDIDATE_LIST_SIZE = 5;
/** How many of the latest audit entries are listed */
export const RECENT_AUDIT_SIZE = 3;
/** How many months the Tahsilat/Ödeme chart covers, this month included */
export const CHART_MONTHS = 12;
/** How many years "Yıllara göre yeni üyeler" covers, this year included */
export const JOIN_YEARS = 10;

/** The calendar year of a yyyy-MM-dd day, as inclusive yyyy-MM-dd bounds */
export function yearBounds(today: string) {
  const year = Number(today.slice(0, 4));
  return { year, from: `${year}-01-01`, to: `${year}-12-31` };
}

/**
 * The `count` months up to and including today's, oldest first, as "yyyy-MM",
 * with the first day of the first one (yyyy-MM-dd)
 */
export function chartMonths(today: string, count = CHART_MONTHS) {
  const thisMonth = parseIsoDate(`${today.slice(0, 7)}-01`);
  if (!thisMonth) throw new Error(`Invalid date: ${today}`);
  const months = Array.from({ length: count }, (_, i) =>
    format(addMonths(thisMonth, i - count + 1), "yyyy-MM"),
  );
  return { months, from: `${months[0]}-01` };
}

const monthFormat = new Intl.DateTimeFormat("tr-TR", {
  month: "short",
  timeZone: "UTC",
});

/** "2026-03" → "Mar 26" */
export function monthLabel(month: string) {
  const date = new Date(`${month}-01T00:00:00Z`);
  return `${monthFormat.format(date)} ${month.slice(2, 4)}`;
}

/** The last `count` years up to today's, oldest first */
export function joinYears(today: string, count = JOIN_YEARS) {
  const year = Number(today.slice(0, 4));
  return Array.from({ length: count }, (_, i) => year - count + 1 + i);
}

export const SENIORITY_BUCKETS = [
  { label: "5 yıldan az", min: 0, max: 5 },
  { label: "5–10 yıl", min: 5, max: 10 },
  { label: "10–20 yıl", min: 10, max: 20 },
  { label: "20 yıl ve üzeri", min: 20, max: Number.POSITIVE_INFINITY },
] as const;

/**
 * How many members fall into each kıdem group, counted the same way as the
 * kıdem badge (full years since Üye Giriş Tarihi). Members without the date
 * are counted apart, in `unknown`.
 */
export function seniorityBuckets(
  memberLoginDates: (string | null)[],
  today: string,
) {
  const todayDate = parseIsoDate(today);
  if (!todayDate) throw new Error(`Invalid date: ${today}`);
  const counts = SENIORITY_BUCKETS.map(() => 0);
  let unknown = 0;

  for (const date of memberLoginDates) {
    const years = membershipYears(date, todayDate);
    // a date in the future counts as under 5 years
    const index =
      years === null
        ? -1
        : SENIORITY_BUCKETS.findIndex((b) => Math.max(years, 0) < b.max);
    if (index === -1) unknown++;
    else counts[index]++;
  }

  return {
    buckets: SENIORITY_BUCKETS.map((b, i) => ({
      label: b.label,
      count: counts[i],
    })),
    unknown,
  };
}

/** yyyy-MM-dd `days` days before `today` */
export function daysBefore(today: string, days: number) {
  const date = parseIsoDate(today);
  if (!date) throw new Error(`Invalid date: ${today}`);
  return format(subDays(date, days), ISO_FORMAT);
}
