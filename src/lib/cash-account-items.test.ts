import { describe, expect, it } from "vitest";
import { cashAccountItems, initialCashAccountId } from "./cash-account-items";

const accounts = [
  { id: 1, name: "Kasa", active: true },
  { id: 2, name: "Eski Banka", active: false },
  { id: 3, name: "Ziraat", active: false },
];

describe("cashAccountItems", () => {
  it("offers only Aktif accounts for a new record", () => {
    expect(cashAccountItems(accounts, null)).toEqual([
      { value: 1, label: "Kasa" },
    ]);
  });

  it("keeps the record's own Pasif account, marked", () => {
    expect(cashAccountItems(accounts, 2)).toEqual([
      { value: 1, label: "Kasa" },
      { value: 2, label: "Eski Banka (Pasif)" },
    ]);
  });

  it("lists every account for a filter", () => {
    expect(cashAccountItems(accounts, "all").map((i) => i.value)).toEqual([
      1, 2, 3,
    ]);
  });
});

describe("initialCashAccountId", () => {
  const two = [
    { id: 1, name: "Kasa", active: true },
    { id: 4, name: "Banka", active: true },
    { id: 2, name: "Eski", active: false },
  ];

  it("keeps the record's own account", () => {
    expect(initialCashAccountId(two, 2, 1)).toBe(2);
  });

  it("takes the page it came from when Aktif", () => {
    expect(initialCashAccountId(two, undefined, 4)).toBe(4);
    expect(initialCashAccountId(two, undefined, 2)).toBeNull();
  });

  it("picks the only Aktif account, else nothing", () => {
    expect(initialCashAccountId(accounts, undefined, undefined)).toBe(1);
    expect(initialCashAccountId(two, undefined, undefined)).toBeNull();
  });
});
