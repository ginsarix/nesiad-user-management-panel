import { addDays, format } from "date-fns";
import { and, eq, exists, isNotNull } from "drizzle-orm";
import { memberNameSql } from "@/app/api/[[...route]]/member-rows";
import { db } from "@/db";
import { companyTable, memberTable } from "@/db/schema";
import { ISO_FORMAT, parseIsoDate } from "@/lib/dates";
import { type Celebration, celebrationsOn } from "./celebrations";

/**
 * Companies with a founding date and at least one Aktif member (once per
 * company, however many members it has), and Aktif members with a birth date
 */
async function loadCelebrants() {
  return Promise.all([
    db
      .select({
        id: companyTable.id,
        name: companyTable.title,
        phone: companyTable.phone,
        foundingDate: companyTable.foundingDate,
      })
      .from(companyTable)
      .where(
        and(
          isNotNull(companyTable.foundingDate),
          exists(
            db
              .select({ id: memberTable.id })
              .from(memberTable)
              .where(
                and(
                  eq(memberTable.companyId, companyTable.id),
                  eq(memberTable.status, "active"),
                ),
              ),
          ),
        ),
      ),
    db
      .select({
        id: memberTable.id,
        name: memberNameSql(),
        phone: memberTable.mobilePhone,
        birthDate: memberTable.birthDate,
      })
      .from(memberTable)
      .where(
        and(eq(memberTable.status, "active"), isNotNull(memberTable.birthDate)),
      ),
  ]);
}

/** Who celebrates on `date` (yyyy-MM-dd), from the active companies and members */
export async function loadCelebrationsOn(date: string) {
  const [companies, members] = await loadCelebrants();
  return celebrationsOn(date, companies, members);
}

/**
 * Who celebrates on each of the `days` days starting at `from` (yyyy-MM-dd),
 * day by day, each with the day it falls on
 */
export async function loadCelebrationsBetween(from: string, days: number) {
  const start = parseIsoDate(from);
  if (!start) throw new Error(`Invalid date: ${from}`);
  const [companies, members] = await loadCelebrants();

  return Array.from({ length: days }, (_, i) =>
    format(addDays(start, i), ISO_FORMAT),
  ).flatMap((on): (Celebration & { on: string })[] =>
    celebrationsOn(on, companies, members).map((c) => ({ ...c, on })),
  );
}
