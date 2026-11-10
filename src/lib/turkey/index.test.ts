import { describe, expect, it } from "vitest";
import { districtsOf, isValidLocation, PROVINCES } from ".";

describe("PROVINCES", () => {
  it("lists 81 provinces in Turkish order", () => {
    expect(PROVINCES).toHaveLength(81);
    expect(PROVINCES.slice(0, 3)).toEqual([
      "Adana",
      "Adıyaman",
      "Afyonkarahisar",
    ]);
    expect(PROVINCES.indexOf("Çanakkale")).toBe(PROVINCES.indexOf("Bursa") + 1);
  });
});

describe("districtsOf", () => {
  it("lists a province's districts in Turkish order", () => {
    expect(districtsOf("Nevşehir")).toEqual([
      "Acıgöl",
      "Avanos",
      "Derinkuyu",
      "Gülşehir",
      "Hacıbektaş",
      "Kozaklı",
      "Merkez",
      "Ürgüp",
    ]);
  });

  it("gives nothing for an unknown or empty province", () => {
    expect(districtsOf("Yok")).toEqual([]);
    expect(districtsOf(null)).toEqual([]);
    expect(districtsOf("")).toEqual([]);
  });
});

describe("isValidLocation", () => {
  it("accepts nothing, a province, or a province with its district", () => {
    expect(isValidLocation(null, null)).toBe(true);
    expect(isValidLocation("Nevşehir", null)).toBe(true);
    expect(isValidLocation("Nevşehir", "Ürgüp")).toBe(true);
  });

  it("rejects a district of another province or without a province", () => {
    expect(isValidLocation("Nevşehir", "Kadıköy")).toBe(false);
    expect(isValidLocation(null, "Ürgüp")).toBe(false);
  });

  it("rejects an unknown province", () => {
    expect(isValidLocation("Nevsehir", null)).toBe(false);
  });
});
