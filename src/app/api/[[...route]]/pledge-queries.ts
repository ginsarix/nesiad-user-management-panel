import { asc, eq, inArray } from "drizzle-orm";
import type { Executor, Transaction } from "@/db";
import { authorizedRepresentativeTable, projectPledgeTable } from "@/db/schema";
import { pledgesAuditText } from "@/lib/pledges";
import type { PledgeInput } from "@/lib/zod-schemas/project";

/** A refused taahhüt row; `index` is its place in the submitted list */
export class InvalidPledgeError extends Error {
  constructor(
    message: string,
    readonly index: number,
  ) {
    super(message);
  }
}

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
  return pledgesAuditText(await loadPledges(executor, projectId));
}

/**
 * Throws InvalidPledgeError unless every yetkili exists and is Aktif or
 * already among the proje's saved rows (`currentIds`).
 */
export async function assertValidPledges(
  tx: Transaction,
  pledges: readonly PledgeInput[],
  currentIds: ReadonlySet<number>,
) {
  if (pledges.length === 0) return;

  const representatives = await tx
    .select({
      id: authorizedRepresentativeTable.id,
      active: authorizedRepresentativeTable.active,
    })
    .from(authorizedRepresentativeTable)
    .where(
      inArray(
        authorizedRepresentativeTable.id,
        pledges.map((p) => p.representativeId),
      ),
    );
  const activeById = new Map(representatives.map((r) => [r.id, r.active]));

  pledges.forEach((pledge, index) => {
    const active = activeById.get(pledge.representativeId);
    if (active === undefined) {
      throw new InvalidPledgeError("Seçilen yetkili bulunamadı", index);
    }
    if (!active && !currentIds.has(pledge.representativeId)) {
      throw new InvalidPledgeError("Pasif yetkili eklenemez", index);
    }
  });
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
      representativeId: pledge.representativeId,
      quantity: pledge.quantity,
      amount: pledge.amount,
      position,
    })),
  );
}
