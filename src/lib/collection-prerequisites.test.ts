import { describe, expect, it } from "vitest";
import { missingForCollections } from "./collection-prerequisites";

const aktif = [{ active: true }];
const both = [{ kind: "collection_category" }, { kind: "collection_method" }];

describe("missingForCollections", () => {
  it("is nothing with an Aktif yetkili, a tür and a tip", () => {
    expect(missingForCollections(aktif, both)).toEqual({
      representative: false,
      parameters: false,
    });
  });

  it("notices no Aktif yetkililer; Pasif ones don't count", () => {
    expect(missingForCollections([{ active: false }], both)).toEqual({
      representative: true,
      parameters: false,
    });
  });

  it("notices a missing tür or tip; payment entries don't count", () => {
    expect(
      missingForCollections(aktif, [
        { kind: "collection_category" },
        { kind: "payment_method" },
      ]),
    ).toEqual({ representative: false, parameters: true });
  });

  it("claims nothing is missing while a list hasn't loaded", () => {
    expect(missingForCollections(undefined, undefined)).toEqual({
      representative: false,
      parameters: false,
    });
  });
});
