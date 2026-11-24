import { and, eq, inArray, max } from "drizzle-orm";
import type { Transaction } from "@/db";
import { parameterTable } from "@/db/schema";
import { type AuditActor, recordAudit } from "@/lib/audit";
import { change } from "@/lib/audit-diff";
import { ORGANIZATIONS, organizationPeopleText } from "@/lib/organizations";
import type { OrganizationRowInput } from "@/lib/zod-schemas/authorized-representative";
import {
  loadOrganizationGroup,
  ORGANIZATION_TABLES,
  type OrganizationTables,
} from "./organization-queries";

/** A refused save; `message` is the response's error (400) */
export class InvalidOrganizationsError extends Error {}

/**
 * A row the form edits is gone or was moved: someone saved one of the
 * groups while the form was open (409)
 */
export class StaleOrganizationsError extends Error {
  constructor() {
    super(
      "Organizasyon grupları bu sırada değiştirildi. Sayfayı yenileyip tekrar deneyin.",
    );
  }
}

/** The position after the group's last row */
async function nextPosition(
  tx: Transaction,
  { person }: OrganizationTables,
  groupId: number,
) {
  const [{ last }] = await tx
    .select({ last: max(person.position) })
    .from(person)
    .where(eq(person.groupId, groupId));
  return (last ?? -1) + 1;
}

/**
 * Makes `rows` the yetkili's Organizasyon group rows, from the yetkili form.
 * Unlike the group form, which saves a whole group, this touches only the
 * yetkili's own rows, so everyone else keeps their place: a row the form
 * kept (`rowId`) stays where it is (a new görev is set in place), a new row
 * or one moved to another group goes to the end of that group, and rows
 * left out are removed. Each group that changed gets its own audit entry,
 * the same "Kişiler" change its page would record.
 *
 * `active` is the yetkili's state after the save: a Pasif yetkili can't be
 * put in a group they aren't already in, as on the group form.
 */
export async function syncRepresentativeOrganizations(
  tx: Transaction,
  {
    representativeId,
    rows,
    active,
    actor,
  }: {
    representativeId: number;
    rows: OrganizationRowInput[];
    active: boolean;
    actor: AuditActor;
  },
) {
  const roleIds = [...new Set(rows.map((row) => row.roleId))];
  if (roleIds.length > 0) {
    const roles = await tx
      .select({ id: parameterTable.id })
      .from(parameterTable)
      .where(
        and(
          inArray(parameterTable.id, roleIds),
          eq(parameterTable.kind, "association_role"),
        ),
      );
    if (roles.length !== roleIds.length) {
      throw new InvalidOrganizationsError("Seçilen görev bulunamadı");
    }
  }

  // one page at a time: inside a transaction they share one connection
  for (const organization of ORGANIZATIONS) {
    const tables = ORGANIZATION_TABLES[organization];
    const { group, person } = tables;
    const wanted = rows.filter((row) => row.organization === organization);

    const current = await tx
      .select({
        id: person.id,
        groupId: person.groupId,
        roleId: person.roleId,
      })
      .from(person)
      .where(eq(person.representativeId, representativeId));
    if (wanted.length === 0 && current.length === 0) continue;

    const currentById = new Map(current.map((row) => [row.id, row]));
    const keptIds = new Set<number>();
    for (const { rowId } of wanted) {
      if (rowId === null) continue;
      if (!currentById.has(rowId) || keptIds.has(rowId)) {
        throw new StaleOrganizationsError();
      }
      keptIds.add(rowId);
    }

    const groupIds = [...new Set(wanted.map((row) => row.groupId))];
    if (groupIds.length > 0) {
      const found = await tx
        .select({ id: group.id })
        .from(group)
        .where(inArray(group.id, groupIds));
      if (found.length !== groupIds.length) {
        throw new InvalidOrganizationsError("Seçilen grup bulunamadı");
      }
    }

    const currentGroupIds = new Set(current.map((row) => row.groupId));
    if (!active && wanted.some((row) => !currentGroupIds.has(row.groupId))) {
      throw new InvalidOrganizationsError(
        "Pasif yetkili yeni bir gruba eklenemez",
      );
    }

    const removed = current.filter((row) => !keptIds.has(row.id));
    const added = wanted.filter((row) => row.rowId === null);
    const edited = wanted.flatMap((row) => {
      const before =
        row.rowId === null ? undefined : currentById.get(row.rowId);
      if (!before) return [];
      if (before.groupId === row.groupId && before.roleId === row.roleId) {
        return [];
      }
      return [{ ...row, id: before.id, fromGroupId: before.groupId }];
    });

    const touchedGroupIds = new Set([
      ...removed.map((row) => row.groupId),
      ...added.map((row) => row.groupId),
      ...edited.flatMap((row) => [row.fromGroupId, row.groupId]),
    ]);
    if (touchedGroupIds.size === 0) continue;

    const before = new Map<number, string>();
    for (const groupId of touchedGroupIds) {
      const loaded = await loadOrganizationGroup(tx, tables, groupId);
      before.set(groupId, organizationPeopleText(loaded?.people ?? []));
    }

    if (removed.length > 0) {
      await tx.delete(person).where(
        inArray(
          person.id,
          removed.map((row) => row.id),
        ),
      );
    }
    for (const row of edited) {
      await tx
        .update(person)
        .set(
          row.groupId === row.fromGroupId
            ? { roleId: row.roleId }
            : {
                groupId: row.groupId,
                roleId: row.roleId,
                position: await nextPosition(tx, tables, row.groupId),
              },
        )
        .where(eq(person.id, row.id));
    }
    for (const row of added) {
      await tx.insert(person).values({
        groupId: row.groupId,
        representativeId,
        roleId: row.roleId,
        position: await nextPosition(tx, tables, row.groupId),
      });
    }

    for (const groupId of touchedGroupIds) {
      const loaded = await loadOrganizationGroup(tx, tables, groupId);
      if (!loaded) continue;
      const changes = change(
        "Kişiler",
        before.get(groupId),
        organizationPeopleText(loaded.people),
      );
      if (changes.length === 0) continue;
      await recordAudit(tx, {
        actor,
        action: "update",
        entityType: organization,
        entityId: groupId,
        entityLabel: loaded.name,
        changes,
      });
    }
  }
}
