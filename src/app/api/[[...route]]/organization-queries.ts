import { eq, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, type Executor } from "@/db";
import {
  committeeMemberTable,
  committeeTable,
  disciplinaryBoardMemberTable,
  disciplinaryBoardTable,
  managementBoardMemberTable,
  managementBoardTable,
  parameterTable,
  supervisoryBoardMemberTable,
  supervisoryBoardTable,
} from "@/db/schema";
import {
  ORGANIZATION_INFO,
  ORGANIZATIONS,
  type Organization,
} from "@/lib/organizations";
import { compareTr } from "@/lib/turkish";

/** One Organizasyon page's tables; all four share these column names */
export type OrganizationTables = {
  group: typeof committeeTable;
  person: typeof committeeMemberTable;
};

export const ORGANIZATION_TABLES: Record<Organization, OrganizationTables> = {
  management_board: {
    group: managementBoardTable,
    person: managementBoardMemberTable,
  },
  committee: { group: committeeTable, person: committeeMemberTable },
  disciplinary_board: {
    group: disciplinaryBoardTable,
    person: disciplinaryBoardMemberTable,
  },
  supervisory_board: {
    group: supervisoryBoardTable,
    person: supervisoryBoardMemberTable,
  },
};

export type RepresentativeOrganization = {
  organization: Organization;
  /** The group row's id; unique only within its organization */
  rowId: number;
  groupId: number;
  groupName: string;
  role: string;
};

/**
 * Every group row the yetkili is in, one entry per row (a yetkili listed
 * twice in a group appears twice): by page, then group name, then the
 * row's place in the group.
 */
export async function selectRepresentativeOrganizations(
  representativeId: number,
  executor: Executor = db,
): Promise<RepresentativeOrganization[]> {
  const perOrganization = await Promise.all(
    ORGANIZATIONS.map(async (organization) => {
      const { group, person } = ORGANIZATION_TABLES[organization];
      const rows = await executor
        .select({
          rowId: person.id,
          groupId: group.id,
          groupName: group.name,
          role: parameterTable.name,
          position: person.position,
        })
        .from(person)
        .innerJoin(group, eq(person.groupId, group.id))
        .innerJoin(parameterTable, eq(person.roleId, parameterTable.id))
        .where(eq(person.representativeId, representativeId));

      return rows
        .toSorted(
          (a, b) =>
            compareTr(a.groupName, b.groupName) ||
            a.groupId - b.groupId ||
            a.position - b.position,
        )
        .map(({ position: _, ...row }) => ({ organization, ...row }));
    }),
  );
  return perOrganization.flat();
}

/** "Komiteler › Eğitim Komitesi: Başkan, …" for the audit log */
export async function representativeOrganizationsText(
  executor: Executor,
  representativeId: number,
) {
  const rows = await selectRepresentativeOrganizations(
    representativeId,
    executor,
  );
  return (
    rows
      .map(
        (row) =>
          `${ORGANIZATION_INFO[row.organization].title} › ${row.groupName}: ${row.role}`,
      )
      .join(", ") || "—"
  );
}

/** How many group rows, across all four pages, use the Dernek Görevi `roleId` */
export function organizationRoleUsageSql(roleId: AnyPgColumn): SQL<number> {
  const counts = ORGANIZATIONS.map((organization) => {
    const { person } = ORGANIZATION_TABLES[organization];
    return sql`(select count(*) from ${person} where ${person.roleId} = ${roleId})`;
  });
  return sql<number>`(${sql.join(counts, sql` + `)})::int`;
}

export async function countOrganizationRoleUsage(
  executor: Executor,
  roleId: number,
) {
  const counts = await Promise.all(
    ORGANIZATIONS.map((organization) => {
      const { person } = ORGANIZATION_TABLES[organization];
      return executor.$count(person, eq(person.roleId, roleId));
    }),
  );
  return counts.reduce((sum, count) => sum + count, 0);
}
