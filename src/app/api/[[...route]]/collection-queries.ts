import { and, desc, eq, gte, isNull, lte, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Executor } from "@/db";
import {
  cashAccountTable,
  collectionTable,
  memberTable,
  parameterTable,
  projectTable,
} from "@/db/schema";
import type { CollectionFilters } from "@/lib/collection-filters";
import { memberNameSql } from "./member-rows";

const category = alias(parameterTable, "category");

/** A sum of tahsilat amounts as "1250.50", added up in Postgres */
export function sumOfCollected() {
  return sql<string>`coalesce(sum(${collectionTable.amount}), 0)::numeric(14,2)::text`;
}

/** Tahsilatlar with the current member, Tahsilat Türü, Kasa - Banka and proje names */
function selectCollectionRows(executor: Executor = db) {
  return executor
    .select({
      id: collectionTable.id,
      date: collectionTable.date,
      amount: collectionTable.amount,
      note: collectionTable.note,
      memberId: collectionTable.memberId,
      memberName: memberNameSql(),
      categoryId: collectionTable.categoryId,
      categoryName: category.name,
      cashAccountId: collectionTable.cashAccountId,
      cashAccountName: cashAccountTable.name,
      projectId: collectionTable.projectId,
      projectName: projectTable.name,
      projectNumber: projectTable.number,
    })
    .from(collectionTable)
    .innerJoin(memberTable, eq(collectionTable.memberId, memberTable.id))
    .innerJoin(category, eq(collectionTable.categoryId, category.id))
    .innerJoin(
      cashAccountTable,
      eq(collectionTable.cashAccountId, cashAccountTable.id),
    )
    .leftJoin(projectTable, eq(collectionTable.projectId, projectTable.id));
}

function whereOf(filters: CollectionFilters) {
  const conditions: (SQL | undefined)[] = [];
  if (filters.from) conditions.push(gte(collectionTable.date, filters.from));
  if (filters.to) conditions.push(lte(collectionTable.date, filters.to));
  if (filters.member !== null) {
    conditions.push(eq(collectionTable.memberId, filters.member));
  }
  if (filters.category !== null) {
    conditions.push(eq(collectionTable.categoryId, filters.category));
  }
  if (filters.cashAccount !== null) {
    conditions.push(eq(collectionTable.cashAccountId, filters.cashAccount));
  }
  if (filters.project === "none") {
    conditions.push(isNull(collectionTable.projectId));
  } else if (filters.project !== null) {
    conditions.push(eq(collectionTable.projectId, filters.project));
  }
  return and(...conditions);
}

/**
 * The filtered tahsilatlar, newest first, with their count. No total: the
 * browser sums the rows it shows (`sumAmounts`, in kuruş).
 */
export async function selectCollections(filters: CollectionFilters) {
  const collections = await selectCollectionRows()
    .where(whereOf(filters))
    .orderBy(desc(collectionTable.date), desc(collectionTable.id));
  return { collections, count: collections.length };
}

export async function selectCollection(id: number, executor: Executor = db) {
  const [collection] = await selectCollectionRows(executor).where(
    eq(collectionTable.id, id),
  );
  return collection ?? null;
}

export type CollectionRow = NonNullable<
  Awaited<ReturnType<typeof selectCollection>>
>;
