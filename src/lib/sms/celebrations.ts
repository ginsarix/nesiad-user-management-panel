import { compareTr } from "@/lib/turkish";
import { type Contact, checkPhone, type PhoneCheck } from "./recipients";

export type CelebrationKind = "founding" | "birthday";

/** A company (firma) with its founding date; it is celebrated once */
export type CelebrationCompany = {
  id: number;
  name: string;
  phone: string | null;
  /** yyyy-MM-dd */
  foundingDate: string | null;
};

/** A member (üye) with their birth date */
export type CelebrationMember = {
  id: number;
  name: string;
  phone: string | null;
  /** yyyy-MM-dd */
  birthDate: string | null;
};

export type Celebration = {
  kind: CelebrationKind;
  contact: Contact;
  /** The stored founding date or birthday, yyyy-MM-dd */
  date: string;
  /** Which anniversary or birthday this is, 1 or more */
  years: number;
  /** Where the SMS goes, or why it can't */
  phone: PhoneCheck;
};

/** "12. kuruluş yıl dönümü", "45. yaş günü" */
export function celebrationLabel(c: Pick<Celebration, "kind" | "years">) {
  return c.kind === "founding"
    ? `${c.years}. kuruluş yıl dönümü`
    : `${c.years}. yaş günü`;
}

function parts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * How many years `date` (yyyy-MM-dd) is after `stored`, when `date` is its
 * anniversary; null otherwise. 29 Şubat is celebrated on 28 Şubat in
 * non-leap years. The first anniversary is year 1, so the stored date itself
 * (and any earlier day) isn't one.
 */
export function anniversaryYears(stored: string, date: string) {
  const s = parts(stored);
  const d = parts(date);
  const sameDay = s.month === d.month && s.day === d.day;
  const leapDayMoved =
    s.month === 2 &&
    s.day === 29 &&
    d.month === 2 &&
    d.day === 28 &&
    !isLeapYear(d.year);
  if (!sameDay && !leapDayMoved) return null;

  const years = d.year - s.year;
  return years >= 1 ? years : null;
}

/**
 * Who gets an automatic SMS on `date` (yyyy-MM-dd): companies on their
 * founding date's anniversary, members on their birthday. Pass only the
 * ones that count (companies with an Aktif member, Aktif members).
 * Founding dates come first, then birthdays, each sorted by name.
 */
export function celebrationsOn(
  date: string,
  companies: CelebrationCompany[],
  members: CelebrationMember[],
): Celebration[] {
  const byName = (a: Celebration, b: Celebration) =>
    compareTr(a.contact.name, b.contact.name);

  const foundings = companies.flatMap((c): Celebration[] => {
    const years = c.foundingDate && anniversaryYears(c.foundingDate, date);
    if (!c.foundingDate || !years) return [];
    return [
      {
        kind: "founding",
        contact: { kind: "company", id: c.id, name: c.name, phone: c.phone },
        date: c.foundingDate,
        years,
        phone: checkPhone(c.phone),
      },
    ];
  });

  const birthdays = members.flatMap((m): Celebration[] => {
    const years = m.birthDate && anniversaryYears(m.birthDate, date);
    if (!m.birthDate || !years) return [];
    return [
      {
        kind: "birthday",
        contact: { kind: "member", id: m.id, name: m.name, phone: m.phone },
        date: m.birthDate,
        years,
        phone: checkPhone(m.phone),
      },
    ];
  });

  return [...foundings.sort(byName), ...birthdays.sort(byName)];
}
