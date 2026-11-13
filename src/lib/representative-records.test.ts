import { describe, expect, it } from "vitest";
import { representativeRecordsText } from "./representative-records";

describe("representativeRecordsText", () => {
  it("names what the yetkili has", () => {
    expect(
      representativeRecordsText({ collections: 2, pledges: 0, accruals: 0 }),
    ).toBe("2 tahsilat");
    expect(
      representativeRecordsText({ collections: 0, pledges: 3, accruals: 0 }),
    ).toBe("3 taahhüt");
    expect(
      representativeRecordsText({ collections: 0, pledges: 0, accruals: 1 }),
    ).toBe("1 tahakkuk");
    expect(
      representativeRecordsText({ collections: 2, pledges: 3, accruals: 0 }),
    ).toBe("2 tahsilat ve 3 taahhüt");
    expect(
      representativeRecordsText({ collections: 2, pledges: 3, accruals: 1 }),
    ).toBe("2 tahsilat, 3 taahhüt ve 1 tahakkuk");
  });

  it("stays vague when the counts are unknown", () => {
    expect(representativeRecordsText(null)).toBe(
      "tahsilat, taahhüt veya tahakkuk",
    );
  });
});
