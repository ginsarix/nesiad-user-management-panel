import { describe, expect, it } from "vitest";
import { memberRecordsText } from "./member-records";

describe("memberRecordsText", () => {
  it("names what the member has", () => {
    expect(memberRecordsText({ collections: 2, pledges: 0, accruals: 0 })).toBe(
      "2 tahsilat",
    );
    expect(memberRecordsText({ collections: 0, pledges: 3, accruals: 0 })).toBe(
      "3 taahhüt",
    );
    expect(memberRecordsText({ collections: 0, pledges: 0, accruals: 1 })).toBe(
      "1 tahakkuk",
    );
    expect(memberRecordsText({ collections: 2, pledges: 3, accruals: 0 })).toBe(
      "2 tahsilat ve 3 taahhüt",
    );
    expect(memberRecordsText({ collections: 2, pledges: 3, accruals: 1 })).toBe(
      "2 tahsilat, 3 taahhüt ve 1 tahakkuk",
    );
  });

  it("stays vague when the counts are unknown", () => {
    expect(memberRecordsText(null)).toBe("tahsilat, taahhüt veya tahakkuk");
  });
});
