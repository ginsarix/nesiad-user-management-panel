import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/members/12?q=a")).toBe("/members/12?q=a");
    expect(safeNextPath("/members/./12")).toBe("/members/12");
  });

  it.each([
    null,
    undefined,
    "",
    "members",
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r\n/evil.com",
    "/\\\\evil.com",
    "/.//evil.com",
    "/..//evil.com",
    "/%2e//evil.com",
    "/a/..//evil.com",
  ])("falls back for %j", (next) => {
    expect(safeNextPath(next)).toBe("/");
  });
});
