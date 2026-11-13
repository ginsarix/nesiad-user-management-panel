import { describe, expect, it } from "vitest";
import {
  amountRowFormSchema,
  amountRowsSchema,
  amountRowsToApi,
  amountRowsToForm,
} from "./amount-rows";

function firstMessage(result: { error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

describe("amountRowsSchema", () => {
  const row = { representativeId: 4, quantity: 2, amount: "1250.50" };

  it("accepts a valid row and an empty list", () => {
    expect(amountRowsSchema.safeParse([row]).success).toBe(true);
    expect(amountRowsSchema.safeParse([]).success).toBe(true);
  });

  it("needs a whole Adet of at least 1", () => {
    expect(
      firstMessage(amountRowsSchema.safeParse([{ ...row, quantity: 0 }])),
    ).toBe("Adet en az 1 olmalı");
    expect(
      firstMessage(amountRowsSchema.safeParse([{ ...row, quantity: 1.5 }])),
    ).toBe("Adet tam sayı olmalı");
    expect(
      firstMessage(
        amountRowsSchema.safeParse([{ ...row, quantity: 1_000_001 }]),
      ),
    ).toBe("Adet en fazla 1.000.000 olabilir");
  });

  it("needs a Tutar above zero", () => {
    expect(
      firstMessage(amountRowsSchema.safeParse([{ ...row, amount: "0.00" }])),
    ).toBe("Tutar sıfırdan büyük olmalı");
  });
});

describe("amountRowFormSchema", () => {
  it("needs Adet typed as a whole number", () => {
    expect(
      firstMessage(
        amountRowFormSchema.safeParse({
          representativeId: 4,
          quantity: "abc",
          amount: "10",
        }),
      ),
    ).toBe("Adet tam sayı olmalı");
  });

  it("needs a yetkili", () => {
    expect(
      firstMessage(
        amountRowFormSchema.safeParse({
          representativeId: null,
          quantity: "1",
          amount: "10",
        }),
      ),
    ).toBe("Yetkili seçin");
  });
});

describe("amountRowsToApi / amountRowsToForm", () => {
  it("round-trip a saved row", () => {
    const saved = [{ representativeId: 4, quantity: 2, amount: "1250.50" }];
    const form = amountRowsToForm(saved);
    expect(form).toEqual([
      { representativeId: 4, quantity: "2", amount: "1.250,50" },
    ]);
    expect(
      amountRowsToApi(form.map((row) => amountRowFormSchema.parse(row))),
    ).toEqual(saved);
  });
});
