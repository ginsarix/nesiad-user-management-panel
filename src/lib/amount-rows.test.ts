import { describe, expect, it } from "vitest";
import {
  amountRowsAuditText,
  grandTotal,
  rowTotal,
  typedGrandTotal,
  typedRowTotal,
} from "./amount-rows";

describe("rowTotal", () => {
  it("multiplies in kuruş", () => {
    expect(rowTotal(3, "0.10")).toBe("0.30");
    expect(rowTotal(2, "1250.50")).toBe("2501.00");
  });

  it("stays exact past what a float can hold", () => {
    expect(rowTotal(1_000_000, "9999999999.99")).toBe("9999999999990000.00");
  });
});

describe("grandTotal", () => {
  it("adds the row totals", () => {
    expect(
      grandTotal([
        { quantity: 2, amount: "1000.00" },
        { quantity: 1, amount: "50.25" },
      ]),
    ).toBe("2050.25");
  });

  it("is zero without rows", () => {
    expect(grandTotal([])).toBe("0.00");
  });
});

describe("typedRowTotal", () => {
  it("reads what is typed in the form", () => {
    expect(
      typedRowTotal({
        representativeId: 1,
        quantity: "2",
        amount: "1.250,50",
      }),
    ).toBe("2501.00");
  });

  it("is null while Adet or Tutar doesn't parse", () => {
    expect(
      typedRowTotal({ representativeId: 1, quantity: "", amount: "10" }),
    ).toBeNull();
    expect(
      typedRowTotal({ representativeId: 1, quantity: "2", amount: "abc" }),
    ).toBeNull();
    expect(
      typedRowTotal({ representativeId: 1, quantity: "1,5", amount: "10" }),
    ).toBeNull();
  });
});

describe("typedRowTotal past the Adet limit", () => {
  it("is null instead of throwing for an Adet too long for a number", () => {
    const row = { representativeId: 1, quantity: "9".repeat(400), amount: "1" };
    expect(() => typedRowTotal(row)).not.toThrow();
    expect(typedRowTotal(row)).toBeNull();
    expect(typedGrandTotal([row])).toBe("0.00");
  });

  it("is null above 1.000.000, which the form refuses", () => {
    expect(
      typedRowTotal({
        representativeId: 1,
        quantity: "1000001",
        amount: "1",
      }),
    ).toBeNull();
  });
});

describe("typedGrandTotal", () => {
  it("skips rows that don't parse yet", () => {
    expect(
      typedGrandTotal([
        { representativeId: 1, quantity: "2", amount: "1.000,00" },
        { representativeId: null, quantity: "", amount: "5" },
      ]),
    ).toBe("2000.00");
  });
});

describe("amountRowsAuditText", () => {
  it("lists each row as name: Adet × Tutar", () => {
    expect(
      amountRowsAuditText([
        { representativeName: "Ali Veli", quantity: 2, amount: "1000.00" },
        { representativeName: "Ayşe", quantity: 1, amount: "50.25" },
      ]),
    ).toBe("Ali Veli: 2 × 1.000,00 TL, Ayşe: 1 × 50,25 TL");
  });

  it("is a dash without rows", () => {
    expect(amountRowsAuditText([])).toBe("—");
  });
});
