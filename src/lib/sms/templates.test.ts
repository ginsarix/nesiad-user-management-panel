import { describe, expect, it } from "vitest";
import {
  fillTemplate,
  NOTICE_PLACEHOLDERS,
  unknownPlaceholders,
} from "./templates";

describe("fillTemplate", () => {
  it("fills known placeholders and leaves unknown ones as typed", () => {
    expect(fillTemplate("{ad} {firma} {x}", { ad: "A", firma: "F" })).toBe(
      "A F {x}",
    );
  });

  it("never re-expands applicant text", () => {
    expect(fillTemplate("{ad}", { ad: "{firma}", firma: "F" })).toBe("{firma}");
  });

  it("doesn't treat Object.prototype names as placeholders", () => {
    expect(fillTemplate("{toString}", { ad: "A" })).toBe("{toString}");
  });
});

describe("unknownPlaceholders", () => {
  it("checks against the celebration placeholders by default", () => {
    expect(unknownPlaceholders("{ad} {yil} {firma}")).toEqual(["{firma}"]);
  });

  it("checks against the given placeholders", () => {
    expect(unknownPlaceholders("{ad} {yil}", NOTICE_PLACEHOLDERS)).toEqual([
      "{yil}",
    ]);
  });
});
