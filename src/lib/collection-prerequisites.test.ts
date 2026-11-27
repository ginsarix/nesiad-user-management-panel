import { describe, expect, it } from "vitest";
import { missingForCollections } from "./collection-prerequisites";

const aktif = [{ active: true }];
const aktifUye = [{ status: "active" }];
const tur = [{ kind: "collection_category" }];

describe("missingForCollections", () => {
  it("is nothing with an Aktif üye, a tür and an Aktif Kasa - Banka", () => {
    expect(missingForCollections(aktifUye, tur, aktif)).toEqual({
      member: false,
      parameters: false,
      cashAccount: false,
    });
  });

  it("notices no Aktif üyeler; Pasif, Aday and Reddedildi ones don't count", () => {
    expect(
      missingForCollections(
        [
          { status: "passive" },
          { status: "candidate" },
          { status: "rejected" },
        ],
        tur,
        aktif,
      ),
    ).toEqual({
      member: true,
      parameters: false,
      cashAccount: false,
    });
  });

  it("notices a missing tür; payment entries don't count", () => {
    expect(
      missingForCollections(aktifUye, [{ kind: "payment_category" }], aktif),
    ).toEqual({ member: false, parameters: true, cashAccount: false });
  });

  it("notices no Aktif Kasa - Banka; Pasif ones don't count", () => {
    expect(missingForCollections(aktifUye, tur, [{ active: false }])).toEqual({
      member: false,
      parameters: false,
      cashAccount: true,
    });
  });

  it("claims nothing is missing while a list hasn't loaded", () => {
    expect(missingForCollections(undefined, undefined, undefined)).toEqual({
      member: false,
      parameters: false,
      cashAccount: false,
    });
  });
});
