import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/members/12?q=a")).toBe("/members/12?q=a");
  });

  it.each([
    null,
    undefined,
    "",
    "members",
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
  ])("falls back for %j", (next) => {
    expect(safeNextPath(next)).toBe("/members");
  });
});
