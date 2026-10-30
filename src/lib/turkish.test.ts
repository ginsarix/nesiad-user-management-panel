import { describe, expect, it } from "vitest";
import { compareTr, foldTr, initialsTr } from "./turkish";

describe("foldTr", () => {
  it("lowercases with Turkish rules", () => {
    expect(foldTr("İSTANBUL")).toBe("istanbul");
    expect(foldTr("ISPARTA")).toBe("isparta");
  });

  it("strips Turkish letters to their ASCII base", () => {
    expect(foldTr("Şimşek Çağlayan Öğütür Işık")).toBe(
      "simsek caglayan ogutur isik",
    );
  });

  it("drops stray combining marks", () => {
    // "Nesi̇ad" as written on nesiad.org.tr, with U+0307 after the i
    expect(foldTr("Nesi̇ad")).toBe("nesiad");
  });
});

describe("compareTr", () => {
  it("sorts in Turkish alphabetical order", () => {
    const titles = ["Zeki", "Şimşek", "Sarı", "Çatak", "Cam", "Ümit", "Uzer"];
    expect(titles.toSorted(compareTr)).toEqual([
      "Cam",
      "Çatak",
      "Sarı",
      "Şimşek",
      "Uzer",
      "Ümit",
      "Zeki",
    ]);
  });
});

describe("initialsTr", () => {
  it("uses the first letters of the first two words", () => {
    expect(initialsTr("Anadolu OSGB")).toBe("AO");
    expect(initialsTr("ilk İşler")).toBe("İİ");
  });

  it("skips words that do not start with a letter", () => {
    expect(initialsTr("A&R Mimarlık")).toBe("AM");
    expect(initialsTr("3D Baskı Atölyesi")).toBe("BA");
  });

  it("handles single words and empty titles", () => {
    expect(initialsTr("Plenty")).toBe("P");
    expect(initialsTr("  ")).toBe("");
  });
});
