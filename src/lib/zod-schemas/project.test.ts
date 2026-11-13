import { describe, expect, it } from "vitest";
import {
  pledgeFormRowSchema,
  pledgesSchema,
  pledgesToApi,
  pledgesToForm,
} from "./project";

function firstMessage(result: { error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

describe("pledgesSchema", () => {
  const row = { representativeId: 4, quantity: 2, amount: "1250.50" };

  it("accepts a valid row and an empty list", () => {
    expect(pledgesSchema.safeParse([row]).success).toBe(true);
    expect(pledgesSchema.safeParse([]).success).toBe(true);
  });

  it("needs a whole Adet of at least 1", () => {
    expect(
      firstMessage(pledgesSchema.safeParse([{ ...row, quantity: 0 }])),
    ).toBe("Adet en az 1 olmalı");
    expect(
      firstMessage(pledgesSchema.safeParse([{ ...row, quantity: 1.5 }])),
    ).toBe("Adet tam sayı olmalı");
    expect(
      firstMessage(pledgesSchema.safeParse([{ ...row, quantity: 1_000_001 }])),
    ).toBe("Adet en fazla 1.000.000 olabilir");
  });

  it("needs a Tutar above zero", () => {
    expect(
      firstMessage(pledgesSchema.safeParse([{ ...row, amount: "0.00" }])),
    ).toBe("Tutar sıfırdan büyük olmalı");
  });
});

describe("pledgeFormRowSchema", () => {
  it("needs Adet typed as a whole number", () => {
    expect(
      firstMessage(
        pledgeFormRowSchema.safeParse({
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
        pledgeFormRowSchema.safeParse({
          representativeId: null,
          quantity: "1",
          amount: "10",
        }),
      ),
    ).toBe("Yetkili seçin");
  });
});

describe("pledgesToApi / pledgesToForm", () => {
  it("round-trip a saved row", () => {
    const saved = [{ representativeId: 4, quantity: 2, amount: "1250.50" }];
    const form = pledgesToForm(saved);
    expect(form).toEqual([
      { representativeId: 4, quantity: "2", amount: "1.250,50" },
    ]);
    expect(
      pledgesToApi(form.map((row) => pledgeFormRowSchema.parse(row))),
    ).toEqual(saved);
  });
});
