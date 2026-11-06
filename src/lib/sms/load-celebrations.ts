import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { authorizedRepresentativeTable, memberTable } from "@/db/schema";
import { celebrationsOn } from "./celebrations";

/** Who celebrates on `date` (yyyy-MM-dd), from the active members and yetkililer */
export async function loadCelebrationsOn(date: string) {
  const [members, representatives] = await Promise.all([
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

  return celebrationsOn(date, members, representatives);
}
