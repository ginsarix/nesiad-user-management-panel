import { describe, expect, it } from "vitest";
import { missingForCollections } from "./collection-prerequisites";

const aktif = [{ active: true }];
const tur = [{ kind: "collection_category" }];

describe("missingForCollections", () => {
  it("is nothing with an Aktif yetkili, a tür and an Aktif Kasa - Banka", () => {
    expect(missingForCollections(aktif, tur, aktif)).toEqual({
      representative: false,
      parameters: false,
      cashAccount: false,
    });
  });

  it("notices no Aktif yetkililer; Pasif ones don't count", () => {
    expect(missingForCollections([{ active: false }], tur, aktif)).toEqual({
      representative: true,
      parameters: false,
      cashAccount: false,
    });
  });

  it("notices a missing tür; payment entries don't count", () => {
    expect(
      missingForCollections(aktif, [{ kind: "payment_category" }], aktif),
    ).toEqual({ representative: false, parameters: true, cashAccount: false });
  });

  it("notices no Aktif Kasa - Banka; Pasif ones don't count", () => {
    expect(missingForCollections(aktif, tur, [{ active: false }])).toEqual({
      representative: false,
      parameters: false,
      cashAccount: true,
    });
  });

  it("claims nothing is missing while a list hasn't loaded", () => {
    expect(missingForCollections(undefined, undefined, undefined)).toEqual({
      representative: false,
      parameters: false,
      cashAccount: false,
    });
  });
});
