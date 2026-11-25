import { describe, expect, it } from "vitest";
import { cashAccountToApi } from "./cash-account";

const values = {
  name: "Merkez Kasa",
  active: true,
  periods: [{ id: 7, startDate: "01.01.2026", openingBalance: "1.250,50" }],
};

describe("cashAccountToApi", () => {
  it("sends the periods when they were edited", () => {
    expect(cashAccountToApi(values, { periodsEdited: true })).toEqual({
      name: "Merkez Kasa",
      active: true,
      periods: [{ id: 7, startDate: "2026-01-01", openingBalance: "1250.50" }],
    });
  });

  it("leaves the periods out when they weren't, so a stale form can't undo a devir", () => {
    expect(cashAccountToApi(values, { periodsEdited: false })).toEqual({
      name: "Merkez Kasa",
      active: true,
    });
  });
});
