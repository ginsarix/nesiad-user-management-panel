import { describe, expect, it } from "vitest";
import { accrualsAuditText, typedAccrualTotal } from "./accruals";

describe("accrualsAuditText", () => {
  it("lists each row as name: Aidat Tutar", () => {
    expect(
      accrualsAuditText([
        {
          representativeName: "Ali Veli",
          categoryName: "2027 Aidatı",
          amount: "1000.00",
        },
        { representativeName: "Ayşe", categoryName: "Bağış", amount: "50.25" },
      ]),
    ).toBe("Ali Veli: 2027 Aidatı 1.000,00 TL, Ayşe: Bağış 50,25 TL");
  });

  it("is a dash without rows", () => {
    expect(accrualsAuditText([])).toBe("—");
  });
});

describe("typedAccrualTotal", () => {
  it("adds the Tutar typed so far, skipping what doesn't parse", () => {
    expect(
      typedAccrualTotal([
        { representativeId: 1, categoryId: 2, amount: "1.250,50" },
        { representativeId: null, categoryId: null, amount: "abc" },
        { representativeId: 1, categoryId: null, amount: "100" },
      ]),
    ).toBe("1350.50");
  });
});
