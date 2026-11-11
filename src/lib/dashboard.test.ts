import { describe, expect, it } from "vitest";
import {
  chartMonths,
  daysBefore,
  joinYears,
  monthLabel,
  seniorityBuckets,
  yearBounds,
} from "./dashboard";

describe("dashboard helpers", () => {
  it("bounds the calendar year", () => {
    expect(yearBounds("2026-11-11")).toEqual({
      year: 2026,
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("lists the last 12 months across the year boundary", () => {
    const { months, from } = chartMonths("2026-03-31");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-04");
    expect(months.at(-1)).toBe("2026-03");
    expect(from).toBe("2025-04-01");
  });

  it("labels months in Turkish", () => {
    expect(monthLabel("2026-11")).toBe("Kas 26");
    expect(monthLabel("2025-08")).toBe("Ağu 25");
  });

  it("lists the last 10 years, oldest first", () => {
    expect(joinYears("2026-05-01")).toEqual([
      2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ]);
  });

  it("counts back days across a month boundary", () => {
    expect(daysBefore("2026-03-05", 30)).toBe("2026-02-03");
  });

  it("groups kıdem by full years, like the badge", () => {
    const { buckets, unknown } = seniorityBuckets(
      [
        "2026-01-01", // 0 years
        "2021-11-12", // 4 years: the 5th anniversary is tomorrow
        "2021-11-11", // exactly 5
        "2016-11-12", // 9
        "2016-11-11", // 10
        "2006-11-11", // 20
        "1990-01-01",
        "2027-01-01", // in the future: under 5
        null,
        null,
      ],
      "2026-11-11",
    );
    expect(buckets.map((b) => b.count)).toEqual([3, 2, 1, 2]);
    expect(unknown).toBe(2);
  });
});
