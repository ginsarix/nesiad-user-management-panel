import { addDays, format } from "date-fns";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { authorizedRepresentativeTable, memberTable } from "@/db/schema";
import { ISO_FORMAT, parseIsoDate } from "@/lib/dates";
import { type Celebration, celebrationsOn } from "./celebrations";

/** Active members with a founding date and active yetkililer with a birthday */
async function loadCelebrants() {
  return Promise.all([
    db
      .select({
        id: memberTable.id,
        name: memberTable.title,
        phone: memberTable.phone,
        foundingDate: memberTable.foundingDate,
      })
      .from(memberTable)
      .where(
        and(
          eq(memberTable.status, "active"),
          isNotNull(memberTable.foundingDate),
        ),
      ),
    db
      .select({
        id: authorizedRepresentativeTable.id,
        name: authorizedRepresentativeTable.name,
        phone: authorizedRepresentativeTable.phone,
        dateOfBirth: authorizedRepresentativeTable.dateOfBirth,
      })
      .from(authorizedRepresentativeTable)
      .where(
        and(
          eq(authorizedRepresentativeTable.active, true),
          isNotNull(authorizedRepresentativeTable.dateOfBirth),
        ),
      ),
  ]);
}

/** Who celebrates on `date` (yyyy-MM-dd), from the active members and yetkililer */
export async function loadCelebrationsOn(date: string) {
  const [members, representatives] = await loadCelebrants();
  return celebrationsOn(date, members, representatives);
}

/**
 * Who celebrates on each of the `days` days starting at `from` (yyyy-MM-dd),
 * day by day, each with the day it falls on
 */
export async function loadCelebrationsBetween(from: string, days: number) {
  const start = parseIsoDate(from);
  if (!start) throw new Error(`Invalid date: ${from}`);
  const [members, representatives] = await loadCelebrants();

  return Array.from({ length: days }, (_, i) =>
    format(addDays(start, i), ISO_FORMAT),
  ).flatMap((on): (Celebration & { on: string })[] =>
    celebrationsOn(on, members, representatives).map((c) => ({ ...c, on })),
  );
}
