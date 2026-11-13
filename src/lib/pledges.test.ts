import { describe, expect, it } from "vitest";
import {
  newPledgeRow,
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

describe("typedPledgeTotal past the Adet limit", () => {
  it("is null instead of throwing for an Adet too long for a number", () => {
    const row = { representativeId: 1, quantity: "9".repeat(400), amount: "1" };
    expect(() => typedPledgeTotal(row)).not.toThrow();
    expect(typedPledgeTotal(row)).toBeNull();
    expect(typedPledgeGrandTotal([row])).toBe("0.00");
  });

  it("is null above 1.000.000, which the form refuses", () => {
    expect(
      typedPledgeTotal({
        representativeId: 1,
        quantity: "1000001",
        amount: "1",
      }),
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

describe("newPledgeRow", () => {
  const filled = {
    representativeId: 4,
    quantity: "3",
    amount: "50,00",
  };

  it("starts at Adet 1 with no Tutar", () => {
    const blank = { representativeId: null, quantity: "1", amount: "" };
    expect(newPledgeRow([], false)).toEqual(blank);
    expect(newPledgeRow([filled], false)).toEqual(blank);
    expect(newPledgeRow([], true)).toEqual(blank);
  });

  it("copies the last row's Adet and Tutar while applying to all", () => {
    expect(newPledgeRow([{ ...filled, quantity: "9" }, filled], true)).toEqual({
      representativeId: null,
      quantity: "3",
      amount: "50,00",
    });
  });
});
