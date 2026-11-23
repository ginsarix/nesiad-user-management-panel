import { describe, expect, it } from "vitest";
import { missingForPayments } from "./payment-prerequisites";

const cari = [{ id: 1 }];
const tur = [{ kind: "payment_category" }];
const aktif = [{ active: true }];

describe("missingForPayments", () => {
  it("is nothing with cariler, a tür and an Aktif Kasa - Banka", () => {
    expect(missingForPayments(cari, tur, aktif)).toEqual({
      counterparty: false,
      parameters: false,
      cashAccount: false,
    });
  });

  it("notices no cariler", () => {
    expect(missingForPayments([], tur, aktif)).toEqual({
      counterparty: true,
      parameters: false,
      cashAccount: false,
    });
  });

  it("notices a missing tür; tahsilat entries don't count", () => {
    expect(
      missingForPayments(cari, [{ kind: "collection_category" }], aktif),
    ).toEqual({ counterparty: false, parameters: true, cashAccount: false });
  });

  it("notices no Aktif Kasa - Banka; Pasif ones don't count", () => {
    expect(missingForPayments(cari, tur, [{ active: false }])).toEqual({
      counterparty: false,
      parameters: false,
      cashAccount: true,
    });
  });

  it("claims nothing is missing while a list hasn't loaded", () => {
    expect(missingForPayments(undefined, undefined, undefined)).toEqual({
      counterparty: false,
      parameters: false,
      cashAccount: false,
    });
  });
});
