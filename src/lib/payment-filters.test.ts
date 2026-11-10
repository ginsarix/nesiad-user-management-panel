import { describe, expect, it } from "vitest";
import { dateFilterText } from "./payment-filters";

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
