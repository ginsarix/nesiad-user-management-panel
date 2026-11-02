import { describe, expect, it } from "vitest";
import {
  anniversaryYears,
  type CelebrationMember,
  type CelebrationRepresentative,
  celebrationLabel,
  celebrationsOn,
} from "./celebrations";

describe("anniversaryYears", () => {
  it.each([
    ["2014-03-05", "2026-03-05", 12],
    ["2014-03-05", "2026-03-06", null],
    ["2014-03-05", "2026-04-05", null],
    // the stored date itself and earlier days aren't anniversaries
    ["2026-03-05", "2026-03-05", null],
    ["2027-03-05", "2026-03-05", null],
    // 29 Şubat: on 28 Şubat in non-leap years, on 29 Şubat in leap years
    ["2000-02-29", "2027-02-28", 27],
    ["2000-02-29", "2028-02-29", 28],
    ["2000-02-29", "2028-02-28", null],
    ["2000-02-29", "2027-03-01", null],
    ["2000-02-29", "2100-02-28", 100], // 2100 isn't a leap year
    ["2000-02-29", "2000-02-28", null],
    // 28 Şubat stays on 28 Şubat
    ["1990-02-28", "2028-02-28", 38],
    ["1990-02-28", "2028-02-29", null],
  ])("%s on %s → %s", (stored, date, years) => {
    expect(anniversaryYears(stored, date)).toBe(years);
  });
});

describe("celebrationLabel", () => {
  it("names the year", () => {
    expect(celebrationLabel({ kind: "founding", years: 12 })).toBe(
      "12. kuruluş yıl dönümü",
    );
    expect(celebrationLabel({ kind: "birthday", years: 45 })).toBe(
      "45. yaş günü",
    );
  });
});

// PLAN.md Level 4 done check: 2027-02-28 and 2028-02-29
const members: CelebrationMember[] = [
  {
    id: 1,
    name: "Zeta Gıda",
    phone: "0532 000 00 01",
    foundingDate: "2015-02-28",
  },
  {
    id: 2,
    name: "Alfa İnşaat",
    phone: "0384 213 11 11",
    foundingDate: "2012-02-29",
  },
  { id: 3, name: "Beta Tekstil", phone: null, foundingDate: "2010-03-01" },
  {
    id: 4,
    name: "Çınar Lojistik",
    phone: "0532 000 00 04",
    foundingDate: null,
  },
  {
    id: 5,
    name: "Yeni Firma",
    phone: "0532 000 00 05",
    foundingDate: "2027-02-28",
  },
];
const representatives: CelebrationRepresentative[] = [
  {
    id: 1,
    name: "Şule Kaya",
    phone: "0535 000 00 01",
    dateOfBirth: "1980-02-29",
  },
  {
    id: 2,
    name: "Ahmet Yılmaz",
    phone: "0535 000 00 02",
    dateOfBirth: "1975-02-28",
  },
  {
    id: 3,
    name: "İpek Demir",
    phone: "0535 000 00 03",
    dateOfBirth: "1990-02-27",
  },
  { id: 4, name: "Ömer Ak", phone: "", dateOfBirth: "1988-02-29" },
];

const summary = (date: string) =>
  celebrationsOn(date, members, representatives).map((c) => ({
    who: `${c.contact.kind}:${c.contact.id}`,
    label: celebrationLabel(c),
    phone: c.phone,
  }));

describe("celebrationsOn", () => {
  it("2027-02-28: 28 and 29 Şubat, foundings first, by Turkish name order", () => {
    expect(summary("2027-02-28")).toEqual([
      {
        who: "member:2",
        label: "15. kuruluş yıl dönümü",
        phone: { ok: false, reason: "invalid" },
      },
      {
        who: "member:1",
        label: "12. kuruluş yıl dönümü",
        phone: { ok: true, phone: "5320000001" },
      },
      {
        who: "representative:2",
        label: "52. yaş günü",
        phone: { ok: true, phone: "5350000002" },
      },
      {
        who: "representative:4",
        label: "39. yaş günü",
        phone: { ok: false, reason: "no_phone" },
      },
      {
        who: "representative:1",
        label: "47. yaş günü",
        phone: { ok: true, phone: "5350000001" },
      },
    ]);
  });

  it("2028-02-29: only 29 Şubat", () => {
    expect(summary("2028-02-29").map((c) => [c.who, c.label])).toEqual([
      ["member:2", "16. kuruluş yıl dönümü"],
      ["representative:4", "40. yaş günü"],
      ["representative:1", "48. yaş günü"],
    ]);
  });

  it("2028-02-28: only 28 Şubat, since 29 Şubat comes the next day", () => {
    expect(summary("2028-02-28").map((c) => [c.who, c.label])).toEqual([
      ["member:5", "1. kuruluş yıl dönümü"],
      ["member:1", "13. kuruluş yıl dönümü"],
      ["representative:2", "53. yaş günü"],
    ]);
  });

  it("keeps the stored date and contact", () => {
    const [first] = celebrationsOn("2026-03-01", members, representatives);
    expect(first).toEqual({
      kind: "founding",
      contact: { kind: "member", id: 3, name: "Beta Tekstil", phone: null },
      date: "2010-03-01",
      years: 16,
      phone: { ok: false, reason: "no_phone" },
    });
  });

  it("returns nobody on a day without celebrations", () => {
    expect(celebrationsOn("2027-06-15", members, representatives)).toEqual([]);
  });
});
