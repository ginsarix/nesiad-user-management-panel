import { describe, expect, it } from "vitest";
import { isDue, sendDay, timeInIstanbul } from "./schedule";
import {
  DEFAULT_MESSAGES,
  fillTemplate,
  unknownPlaceholders,
} from "./templates";

// Istanbul is UTC+3 all year
const at = (utc: string) => new Date(`${utc}Z`);

describe("timeInIstanbul", () => {
  it.each([
    ["2027-02-28T06:00:00", "09:00"],
    ["2027-02-28T21:05:00", "00:05"], // midnight is 00, not 24
    ["2027-02-28T20:59:00", "23:59"],
  ])("%s UTC → %s", (utc, time) => {
    expect(timeInIstanbul(at(utc))).toBe(time);
  });
});

describe("isDue", () => {
  it.each([
    ["2027-02-28T05:59:00", false], // 08:59
    ["2027-02-28T06:00:00", true], // 09:00 exactly
    ["2027-02-28T12:30:00", true], // catch-up later the same day
    ["2027-02-28T20:59:00", true], // 23:59
    ["2027-02-28T21:00:00", false], // 00:00, the next day
  ])("%s UTC with 09:00 → %s", (utc, due) => {
    expect(isDue(at(utc), "09:00")).toBe(due);
  });
});

describe("sendDay", () => {
  it("is the Istanbul day, which starts 3 hours before UTC's", () => {
    expect(sendDay(at("2027-02-27T21:30:00"))).toBe("2027-02-28");
    expect(sendDay(at("2027-02-28T20:30:00"))).toBe("2027-02-28");
  });
});

describe("fillTemplate", () => {
  it("fills {ad} and {yil}, every time they appear", () => {
    expect(
      fillTemplate("{ad}: {yil}. yıl! Tebrikler {ad}", {
        ad: "Kapadokya Gıda",
        yil: "12",
      }),
    ).toBe("Kapadokya Gıda: 12. yıl! Tebrikler Kapadokya Gıda");
  });

  it("leaves unknown placeholders as typed", () => {
    expect(fillTemplate("{isim} {ad}", { ad: "A", yil: "1" })).toBe("{isim} A");
  });

  it("fills the default messages", () => {
    expect(
      fillTemplate(DEFAULT_MESSAGES.founding, { ad: "Alfa A.Ş.", yil: "12" }),
    ).toBe(
      "Sayın Alfa A.Ş., kuruluşunuzun 12. yıl dönümünü kutlar, nice başarılı yıllar dileriz. NESİAD",
    );
  });
});

describe("unknownPlaceholders", () => {
  it("lists what fillTemplate wouldn't fill", () => {
    expect(unknownPlaceholders("{ad} {yil} {isim} {}")).toEqual([
      "{isim}",
      "{}",
    ]);
    expect(unknownPlaceholders(DEFAULT_MESSAGES.birthday)).toEqual([]);
  });
});
