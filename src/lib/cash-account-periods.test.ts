import { describe, expect, it } from "vitest";
import {
  currentPeriodOf,
  defaultCarryPair,
  isCarryStale,
  periodEndDate,
  periodIndexFor,
  periodRangeText,
  periodsAuditText,
} from "./cash-account-periods";

const P = [
  { id: 1, startDate: "2025-01-01" },
  { id: 2, startDate: "2026-01-01" },
  { id: 3, startDate: "2027-01-01" },
];

describe("periodIndexFor", () => {
  it("finds the period a date falls in", () => {
    expect(periodIndexFor(P, "2024-12-31")).toBe(-1);
    expect(periodIndexFor(P, "2025-12-31")).toBe(0);
    expect(periodIndexFor(P, "2026-01-01")).toBe(1);
    expect(periodIndexFor(P, "2030-05-05")).toBe(2);
    expect(periodIndexFor([], "2026-01-01")).toBe(-1);
  });
});

describe("currentPeriodOf", () => {
  it("is the latest period that has started", () => {
    expect(currentPeriodOf(P, "2026-11-25")?.id).toBe(2);
  });

  it("is null when every period is in the future", () => {
    expect(currentPeriodOf(P, "2024-06-01")).toBeNull();
    expect(currentPeriodOf([], "2024-06-01")).toBeNull();
  });
});

describe("periodEndDate", () => {
  it("ends a period the day before the next one starts", () => {
    expect(periodEndDate("2027-01-01")).toBe("2026-12-31");
    expect(periodEndDate("2024-03-01")).toBe("2024-02-29");
    expect(periodEndDate(null)).toBeNull();
  });
});

describe("periodRangeText", () => {
  it("writes the range, open-ended for the last period", () => {
    expect(periodRangeText("2026-01-01", "2027-01-01")).toBe(
      "01.01.2026 – 31.12.2026",
    );
    expect(periodRangeText("2027-01-01", null)).toBe("01.01.2027 –");
  });
});

describe("isCarryStale", () => {
  const link = { carriedFromPeriodId: 1, carriedAmount: "100.00" };

  it("is stale when the source's Bakiye moved since the devir", () => {
    expect(isCarryStale(link, "100.00")).toBe(false);
    expect(isCarryStale(link, "150.00")).toBe(true);
  });

  it("is never stale without a devir link or a source Bakiye", () => {
    expect(
      isCarryStale(
        { carriedFromPeriodId: null, carriedAmount: null },
        "150.00",
      ),
    ).toBe(false);
    expect(isCarryStale(link, null)).toBe(false);
  });
});

describe("periodsAuditText", () => {
  it("lists periods sorted by date", () => {
    expect(
      periodsAuditText([
        { startDate: "2026-01-01", openingBalance: "-50.00" },
        { startDate: "2025-01-01", openingBalance: "1250.50" },
      ]),
    ).toBe("01.01.2025: 1.250,50 TL; 01.01.2026: -50,00 TL");
    expect(periodsAuditText([])).toBe("—");
  });
});

describe("defaultCarryPair", () => {
  it("is null with a single period", () => {
    expect(defaultCarryPair(P.slice(0, 1), 0)).toBeNull();
  });

  it("carries into the current period from the one before it", () => {
    expect(defaultCarryPair(P, 1)).toEqual({ fromId: 1, toId: 2 });
    expect(defaultCarryPair(P, 2)).toEqual({ fromId: 2, toId: 3 });
  });

  it("carries into the second period when the current one is the first or none", () => {
    expect(defaultCarryPair(P, 0)).toEqual({ fromId: 1, toId: 2 });
    expect(defaultCarryPair(P, -1)).toEqual({ fromId: 1, toId: 2 });
  });
});
