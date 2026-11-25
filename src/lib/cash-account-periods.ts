import { format, subDays } from "date-fns";
import { ISO_FORMAT, isoToDisplay, parseIsoDate } from "./dates";
import { formatAmountText, toKurus } from "./money";

// Kasa - Banka periods (Dönemler). Client-safe: the API and the browser
// both use these. Unless said otherwise, periods are sorted by `startDate`
// ascending and dates are yyyy-MM-dd. A period runs from its start date up
// to the day before the next period's; the last one is open-ended.

/** Index of the period `date` falls in; -1 before the first (or without any) */
export function periodIndexFor(
  periods: readonly { startDate: string }[],
  date: string,
): number {
  return periods.findLastIndex((period) => period.startDate <= date);
}

/** The latest period that has started by `today`; null if none has */
export function currentPeriodOf<T extends { startDate: string }>(
  periods: readonly T[],
  today: string,
): T | null {
  return periods[periodIndexFor(periods, today)] ?? null;
}

/** A period's last day: the day before the next one starts; null if open-ended */
export function periodEndDate(nextStartDate: string | null): string | null {
  const next = nextStartDate ? parseIsoDate(nextStartDate) : null;
  return next ? format(subDays(next, 1), ISO_FORMAT) : null;
}

/** "01.01.2026 – 31.12.2026"; "01.01.2027 –" for the last period */
export function periodRangeText(
  startDate: string,
  nextStartDate: string | null,
): string {
  const end = periodEndDate(nextStartDate);
  return `${isoToDisplay(startDate)} –${end ? ` ${isoToDisplay(end)}` : ""}`;
}

/** Whether the source's Bakiye has moved since the last devir into a period */
export function isCarryStale(
  period: { carriedFromPeriodId: number | null; carriedAmount: string | null },
  sourceBalance: string | null,
): boolean {
  if (period.carriedFromPeriodId === null || period.carriedAmount === null) {
    return false;
  }
  if (sourceBalance === null) return false;
  return toKurus(period.carriedAmount) !== toKurus(sourceBalance);
}

/** "01.01.2025: 1.250,50 TL; 01.01.2026: -50,00 TL"; "—" without periods */
export function periodsAuditText(
  periods: readonly { startDate: string; openingBalance: string }[],
): string {
  return (
    periods
      .toSorted((a, b) => a.startDate.localeCompare(b.startDate))
      .map(
        (period) =>
          `${isoToDisplay(period.startDate)}: ${formatAmountText(period.openingBalance)}`,
      )
      .join("; ") || "—"
  );
}

/**
 * The Devir box's starting pair: into the current period (`currentIndex`),
 * or into the second one when the current is the first or there's none,
 * from the period just before it. Null with fewer than two periods.
 */
export function defaultCarryPair<T extends { id: number }>(
  periods: readonly T[],
  currentIndex: number,
): { fromId: number; toId: number } | null {
  if (periods.length < 2) return null;
  const to = Math.max(currentIndex, 1);
  return { fromId: periods[to - 1].id, toId: periods[to].id };
}
