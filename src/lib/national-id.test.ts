import { describe, expect, it } from "vitest";
import { isValidNationalId, maskNationalId } from "./national-id";

describe("isValidNationalId", () => {
  it("accepts a number with correct check digits", () => {
    expect(isValidNationalId("10000000146")).toBe(true);
  });

  it.each(["10000000147", "00000000000", "1234567890", "1000000014a"])(
    "refuses %s",
    (bad) => {
      expect(isValidNationalId(bad)).toBe(false);
    },
  );
});

describe("maskNationalId", () => {
  it("keeps the first three digits", () => {
    expect(maskNationalId("10000000146")).toBe("100••••••••");
  });
});
