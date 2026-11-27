import { asc, eq } from "drizzle-orm";
import type { Executor, Transaction } from "@/db";
import { memberTable, projectPledgeTable } from "@/db/schema";
import { pledgesAuditText } from "@/lib/pledges";
import type { PledgeInput } from "@/lib/zod-schemas/project";
import { memberActiveSql, memberNameSql } from "./member-rows";

/** A proje's taahhütler in the order entered, with their member */
export function loadPledges(executor: Executor, projectId: number) {
  return executor
    .select({
      id: projectPledgeTable.id,
      memberId: projectPledgeTable.memberId,
      memberName: memberNameSql(),
      memberPhoto: memberTable.photo,
      memberActive: memberActiveSql(),
      quantity: projectPledgeTable.quantity,
      amount: projectPledgeTable.amount,
    })
    .from(projectPledgeTable)
    .innerJoin(memberTable, eq(projectPledgeTable.memberId, memberTable.id))
    .where(eq(projectPledgeTable.projectId, projectId))
    .orderBy(asc(projectPledgeTable.position), asc(projectPledgeTable.id));
}

/** The "Taahhütler" audit value of a proje's saved rows */
export async function pledgesText(executor: Executor, projectId: number) {
  return pledgesAuditText(await loadPledges(executor, projectId));
}

/** Replaces all of the proje's taahhütler, keeping the given order */
export async function replacePledges(
  tx: Transaction,
  projectId: number,
  pledges: readonly PledgeInput[],
) {
  await tx
    .delete(projectPledgeTable)
    .where(eq(projectPledgeTable.projectId, projectId));
  if (pledges.length === 0) return;

  await tx.insert(projectPledgeTable).values(
    pledges.map((pledge, position) => ({
      projectId,
      memberId: pledge.memberId,
      quantity: pledge.quantity,
      amount: pledge.amount,
      position,
    })),
  );
}
