import { describe, expect, it } from "vitest";
import {
  pledgeGrandTotal,
  pledgeRowTotal,
  pledgesAuditText,
  typedPledgeGrandTotal,
  typedPledgeTotal,
} from "./pledges";

describe("pledgeRowTotal", () => {
  it("multiplies in kuruş", () => {
    expect(pledgeRowTotal(3, "0.10")).toBe("0.30");
    expect(pledgeRowTotal(2, "1250.50")).toBe("2501.00");
  });

  it("stays exact past what a float can hold", () => {
    expect(pledgeRowTotal(1_000_000, "9999999999.99")).toBe(
      "9999999999990000.00",
    );
  });
});

describe("pledgeGrandTotal", () => {
  it("adds the row totals", () => {
    expect(
      pledgeGrandTotal([
        { quantity: 2, amount: "1000.00" },
        { quantity: 1, amount: "50.25" },
      ]),
    ).toBe("2050.25");
  });

  it("is zero without rows", () => {
    expect(pledgeGrandTotal([])).toBe("0.00");
  });
});

describe("typedPledgeTotal", () => {
  it("reads what is typed in the form", () => {
    expect(
      typedPledgeTotal({
        representativeId: 1,
        quantity: "2",
        amount: "1.250,50",
      }),
    ).toBe("2501.00");
  });

  it("is null while Adet or Tutar doesn't parse", () => {
    expect(
      typedPledgeTotal({ representativeId: 1, quantity: "", amount: "10" }),
    ).toBeNull();
    expect(
      typedPledgeTotal({ representativeId: 1, quantity: "2", amount: "abc" }),
    ).toBeNull();
    expect(
      typedPledgeTotal({ representativeId: 1, quantity: "1,5", amount: "10" }),
    ).toBeNull();
  });
});

describe("typedPledgeGrandTotal", () => {
  it("skips rows that don't parse yet", () => {
    expect(
      typedPledgeGrandTotal([
        { representativeId: 1, quantity: "2", amount: "1.000,00" },
        { representativeId: null, quantity: "", amount: "5" },
      ]),
    ).toBe("2000.00");
  });
});

describe("pledgesAuditText", () => {
  it("lists each row as name: Adet × Tutar", () => {
    expect(
      pledgesAuditText([
        { representativeName: "Ali Veli", quantity: 2, amount: "1000.00" },
        { representativeName: "Ayşe", quantity: 1, amount: "50.25" },
      ]),
    ).toBe("Ali Veli: 2 × 1.000,00 TL, Ayşe: 1 × 50,25 TL");
  });

  it("is a dash without rows", () => {
    expect(pledgesAuditText([])).toBe("—");
  });
});
