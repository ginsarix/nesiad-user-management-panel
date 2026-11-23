import { describe, expect, it } from "vitest";
import {
  COLLECTION_NOTICE_PLACEHOLDERS,
  DEFAULT_COLLECTION_NOTICE_TEMPLATES,
  fillTemplate,
  NOTICE_PLACEHOLDERS,
  unknownPlaceholders,
} from "./templates";

describe("fillTemplate", () => {
  it("fills known placeholders and leaves unknown ones as typed", () => {
    expect(fillTemplate("{ad} {firma} {x}", { ad: "A", firma: "F" })).toBe(
      "A F {x}",
    );
  });

  it("never re-expands applicant text", () => {
    expect(fillTemplate("{ad}", { ad: "{firma}", firma: "F" })).toBe("{firma}");
  });

  it("doesn't treat Object.prototype names as placeholders", () => {
    expect(fillTemplate("{toString}", { ad: "A" })).toBe("{toString}");
  });
});

describe("unknownPlaceholders", () => {
  it("checks against the celebration placeholders by default", () => {
    expect(unknownPlaceholders("{ad} {yil} {firma}")).toEqual(["{firma}"]);
  });

  it("checks against the given placeholders", () => {
    expect(unknownPlaceholders("{ad} {yil}", NOTICE_PLACEHOLDERS)).toEqual([
      "{yil}",
    ]);
  });
});

describe("tahsilat notice templates", () => {
  it("offer {kasa} and no longer {tip}", () => {
    expect(COLLECTION_NOTICE_PLACEHOLDERS).toHaveProperty("kasa");
    expect(COLLECTION_NOTICE_PLACEHOLDERS).not.toHaveProperty("tip");
  });

  it("name the Kasa - Banka only to staff by default", () => {
    const {
      representativeSms,
      representativeEmailSubject,
      representativeEmailBody,
      staffSms,
      staffEmailBody,
    } = DEFAULT_COLLECTION_NOTICE_TEMPLATES;
    for (const text of Object.values(DEFAULT_COLLECTION_NOTICE_TEMPLATES)) {
      expect(text).not.toContain("{tip}");
    }
    for (const text of [
      representativeSms,
      representativeEmailSubject,
      representativeEmailBody,
    ]) {
      expect(text).not.toContain("{kasa}");
    }
    expect(staffSms).toBe(
      "Yeni tahsilat: {yetkili}, {tutar} ({tur}, {kasa}), {tarih}. Proje: {proje}",
    );
    expect(staffEmailBody).toContain("Kasa - Banka: {kasa}");
  });
});
