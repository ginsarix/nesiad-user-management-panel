import { describe, expect, it } from "vitest";
import { missingForPayments } from "./payment-prerequisites";

const cari = [{ id: 1 }];
const both = [{ kind: "payment_category" }, { kind: "payment_method" }];

describe("missingForPayments", () => {
  it("is nothing when there are cariler, a tür and a tip", () => {
    expect(missingForPayments(cari, both)).toEqual({
      counterparty: false,
      parameters: false,
    });
  });

  it("notices no cariler", () => {
    expect(missingForPayments([], both)).toEqual({
      counterparty: true,
      parameters: false,
    });
  });

  it("notices a missing tür or tip; tahsilat entries don't count", () => {
    expect(
      missingForPayments(cari, [
        { kind: "payment_category" },
        { kind: "collection_method" },
      ]),
    ).toEqual({ counterparty: false, parameters: true });
  });

  it("claims nothing is missing while a list hasn't loaded", () => {
    expect(missingForPayments(undefined, undefined)).toEqual({
      counterparty: false,
      parameters: false,
    });
  });
});
