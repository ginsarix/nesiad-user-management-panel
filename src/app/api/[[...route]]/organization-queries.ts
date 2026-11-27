import { asc, eq, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Executor } from "@/db";
import {
  committeeMemberTable,
  committeeTable,
  disciplinaryBoardMemberTable,
  disciplinaryBoardTable,
  honoraryBoardMemberTable,
  honoraryBoardTable,
  managementBoardMemberTable,
  managementBoardTable,
  memberTable,
  parameterTable,
  supervisoryBoardMemberTable,
  supervisoryBoardTable,
} from "@/db/schema";
import { ORGANIZATIONS, type Organization } from "@/lib/organizations";
import { memberActiveSql, memberNameSql } from "./member-rows";

/** One Organizasyon page's tables; all share these column names */
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
  honorary_board: {
    group: honoraryBoardTable,
    person: honoraryBoardMemberTable,
  },
};

/** The group with its people in their saved order, or null */
export async function loadOrganizationGroup(
  executor: Executor,
  { group, person }: OrganizationTables,
  id: number,
) {
  const [found] = await executor
    .select({ id: group.id, name: group.name })
    .from(group)
    .where(eq(group.id, id));
  if (!found) return null;

  const people = await executor
    .select({
      id: person.id,
      memberId: person.memberId,
      memberName: memberNameSql(),
      memberPhoto: memberTable.photo,
      memberActive: memberActiveSql(),
      roleId: person.roleId,
      roleName: parameterTable.name,
    })
    .from(person)
    .innerJoin(memberTable, eq(person.memberId, memberTable.id))
    .innerJoin(parameterTable, eq(person.roleId, parameterTable.id))
    .where(eq(person.groupId, id))
    .orderBy(asc(person.position), asc(person.id));

  return { ...found, people };
}

/** How many group rows, across all the pages, use the Dernek Görevi `roleId` */
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
