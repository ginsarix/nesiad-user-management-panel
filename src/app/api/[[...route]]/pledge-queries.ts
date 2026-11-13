import { asc, eq } from "drizzle-orm";
import type { Executor, Transaction } from "@/db";
import { authorizedRepresentativeTable, projectPledgeTable } from "@/db/schema";
import { amountRowsAuditText } from "@/lib/amount-rows";
import type { AmountRowInput } from "@/lib/zod-schemas/amount-rows";

/** A proje's taahhütler in the order entered, with their yetkili */
export function loadPledges(executor: Executor, projectId: number) {
  return executor
    .select({
      id: projectPledgeTable.id,
      representativeId: projectPledgeTable.representativeId,
      representativeName: authorizedRepresentativeTable.name,
      representativePhoto: authorizedRepresentativeTable.photo,
      representativeActive: authorizedRepresentativeTable.active,
      quantity: projectPledgeTable.quantity,
      amount: projectPledgeTable.amount,
    })
    .from(projectPledgeTable)
    .innerJoin(
      authorizedRepresentativeTable,
      eq(projectPledgeTable.representativeId, authorizedRepresentativeTable.id),
    )
    .where(eq(projectPledgeTable.projectId, projectId))
    .orderBy(asc(projectPledgeTable.position), asc(projectPledgeTable.id));
}

/** The "Taahhütler" audit value of a proje's saved rows */
export async function pledgesText(executor: Executor, projectId: number) {
  return amountRowsAuditText(await loadPledges(executor, projectId));
}

/** Replaces all of the proje's taahhütler, keeping the given order */
export async function replacePledges(
  tx: Transaction,
  projectId: number,
  pledges: readonly AmountRowInput[],
) {
  await tx
    .delete(projectPledgeTable)
    .where(eq(projectPledgeTable.projectId, projectId));
  if (pledges.length === 0) return;

  await tx.insert(projectPledgeTable).values(
    pledges.map((pledge, position) => ({
      projectId,
      representativeId: pledge.representativeId,
      quantity: pledge.quantity,
      amount: pledge.amount,
      position,
    })),
  );
}
