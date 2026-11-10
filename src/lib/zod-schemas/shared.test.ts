import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requiredIsoDateSchema } from "./shared";

describe("past-or-today dates", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    // the server's clock may be in UTC while staff are in Istanbul (UTC+3)
    process.env.TZ = "UTC";
    vi.useFakeTimers();
    // 01:30 on 11 November in Istanbul, still 10 November in UTC
    vi.setSystemTime(new Date("2026-11-10T22:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("accepts today in Istanbul even when the server's day is behind", () => {
    expect(requiredIsoDateSchema.safeParse("2026-11-11").success).toBe(true);
  });

  it("rejects the day after today in Istanbul", () => {
    const result = requiredIsoDateSchema.safeParse("2026-11-12");
    expect(result.error?.issues[0].message).toBe("Tarih gelecekte olamaz");
  });
});
