import { describe, expect, it } from "vitest";
import {
  autoFormatDisplayDate,
  dateFilterText,
  displayToIso,
  isoToDisplay,
  parseDisplayDate,
  seniorityBadge,
} from "./dates";

describe("parseDisplayDate", () => {
  it("parses a complete gg.aa.yyyy date", () => {
    const date = parseDisplayDate("05.03.2014");
    expect(date?.getFullYear()).toBe(2014);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(5);
  });

  it.each([
    "",
    "5.3.2014",
    "05.03.14",
    "31.02.2024",
    "29.02.2023",
    "Mart 2014",
    "2014",
    "2014-03-05",
    "05/03/2014",
    " 05.03.2014",
  ])("rejects %j", (text) => {
    expect(parseDisplayDate(text)).toBeNull();
  });

  it("accepts 29 February in a leap year", () => {
    expect(parseDisplayDate("29.02.2024")).not.toBeNull();
  });
});

describe("autoFormatDisplayDate", () => {
  it.each([
    ["", ""],
    ["0", "0"],
    ["01", "01."],
    ["01.0", "01.0"],
    ["01.01", "01.01."],
    ["01.01.2", "01.01.2"],
    ["01.01.2020", "01.01.2020"],
    // a dot typed after the automatic one
    ["01..", "01."],
    ["01.01..", "01.01."],
    // a digit typed after the dot was deleted
    ["010", "01.0"],
    // a dot typed after a single digit pads it
    ["1.", "01."],
    ["01.1.", "01.01."],
    // pasted
    ["01012020", "01.01.2020"],
    ["1/1/2020", "01.01.2020"],
    ["01.01.20201", "01.01.2020"],
  ])("%j → %j", (typed, formatted) => {
    expect(autoFormatDisplayDate(typed)).toBe(formatted);
  });
});

describe("iso <-> display", () => {
  it("converts both ways", () => {
    expect(displayToIso("05.03.2014")).toBe("2014-03-05");
    expect(isoToDisplay("2014-03-05")).toBe("05.03.2014");
  });

  it("treats empty values as empty", () => {
    expect(isoToDisplay(null)).toBe("");
    expect(displayToIso("")).toBe("");
  });
});

describe("seniorityBadge", () => {
  const today = new Date(2026, 9, 30); // 30.10.2026

  it.each([
    [null, null],
    ["2024-01-01", null], // 2 years
    ["2021-10-31", null], // 4 years, one day short of 5
    ["2021-10-30", "5 Yıl"], // exactly 5 years
    ["2018-05-01", "5 Yıl"], // 8 years
    ["2016-10-30", "10 Yıl"],
    ["1999-01-01", "25 Yıl"], // 27 years
  ])("%s → %s", (memberLoginDate, badge) => {
    expect(seniorityBadge(memberLoginDate, today)).toBe(badge);
  });
});

describe("dateFilterText", () => {
  it("is empty when nothing is typed", () => {
    expect(dateFilterText("  ")).toEqual({ state: "empty", iso: null });
  });

  it("gives the date once it's complete and real", () => {
    expect(dateFilterText("05.10.2026")).toEqual({
      state: "valid",
      iso: "2026-10-05",
    });
  });

  it("is incomplete while it's still being typed", () => {
    expect(dateFilterText("05.10.")).toEqual({
      state: "incomplete",
      iso: null,
    });
  });

  it("is invalid when complete but not a real day", () => {
    expect(dateFilterText("31.11.2026")).toEqual({
      state: "invalid",
      iso: null,
    });
  });
});
