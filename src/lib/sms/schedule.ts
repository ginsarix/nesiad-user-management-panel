import { todayInIstanbul } from "@/lib/dates";

/** The time of day in Türkiye as "HH:mm" (00–23), wherever the code runs */
export function timeInIstanbul(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    // "h23", not hour12: false, which some runtimes print as "24:05"
    hourCycle: "h23",
  }).format(now);
}

/**
 * Whether today's automatic SMS should go out at `now`: from `sendTime`
 * ("HH:mm", Istanbul) until midnight. A server that was down at `sendTime`
 * catches up later the same day; a missed day is skipped.
 */
export function isDue(now: Date, sendTime: string) {
  return timeInIstanbul(now) >= sendTime;
}

/** The Istanbul day a run at `now` sends for */
export function sendDay(now: Date) {
  return todayInIstanbul(now);
}
