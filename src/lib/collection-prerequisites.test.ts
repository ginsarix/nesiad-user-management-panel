import { describe, expect, it } from "vitest";
import { missingForCollections } from "./collection-prerequisites";

const aktif = [{ status: "active" }];
const both = [{ kind: "collection_category" }, { kind: "collection_method" }];

describe("missingForCollections", () => {
  it("is nothing with an Aktif member, a tür and a tip", () => {
    expect(missingForCollections(aktif, both)).toEqual({
      member: false,
      parameters: false,
    });
  });

  it("notices no Aktif members; Pasif or Aday ones don't count", () => {
    expect(
      missingForCollections(
        [{ status: "passive" }, { status: "candidate" }],
        both,
      ),
    ).toEqual({ member: true, parameters: false });
  });

  it("notices a missing tür or tip; payment entries don't count", () => {
    expect(
      missingForCollections(aktif, [
        { kind: "collection_category" },
        { kind: "payment_method" },
      ]),
    ).toEqual({ member: false, parameters: true });
  });

  it("claims nothing is missing while a list hasn't loaded", () => {
    expect(missingForCollections(undefined, undefined)).toEqual({
      member: false,
      parameters: false,
    });
  });
});
