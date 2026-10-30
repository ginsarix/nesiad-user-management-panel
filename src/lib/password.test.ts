import { describe, expect, it } from "vitest";
import { generatePassword } from "./password";
import { MIN_PASSWORD_LENGTH } from "./zod-schemas/auth";

describe("generatePassword", () => {
  it("is long enough for the password rules", () => {
    expect(generatePassword().length).toBeGreaterThanOrEqual(
      MIN_PASSWORD_LENGTH,
    );
  });

  it("avoids look-alike characters", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePassword()).toMatch(/^[^0O1lI]+$/);
    }
  });

  it("differs each time", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
