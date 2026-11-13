import { describe, expect, it } from "vitest";
import { representativeRecordsText } from "./representative-records";

describe("representativeRecordsText", () => {
  it("names what the yetkili has", () => {
    expect(representativeRecordsText(2, 0)).toBe("2 tahsilat");
    expect(representativeRecordsText(0, 3)).toBe("3 taahhüt");
    expect(representativeRecordsText(2, 3)).toBe("2 tahsilat ve 3 taahhüt");
  });

  it("stays vague when the counts are unknown", () => {
    expect(representativeRecordsText(null, null)).toBe("tahsilat veya taahhüt");
  });
});
