import {
  and,
  count,
  desc,
  eq,
  gte,
  isNull,
  lte,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Executor } from "@/db";
import {
  authorizedRepresentativeTable,
  collectionTable,
  parameterTable,
  projectTable,
} from "@/db/schema";
import type { CollectionFilters } from "@/lib/collection-filters";

const category = alias(parameterTable, "category");
const method = alias(parameterTable, "method");

/** A sum of tahsilat amounts as "1250.50", added up in Postgres */
export function sumOfCollected() {
  return sql<string>`coalesce(sum(${collectionTable.amount}), 0)::numeric(14,2)::text`;
}

/** Tahsilatlar with the current yetkili name, parameter and proje names */
function selectCollectionRows(executor: Executor = db) {
  return executor
    .select({
      id: collectionTable.id,
      date: collectionTable.date,
      amount: collectionTable.amount,
      note: collectionTable.note,
      representativeId: collectionTable.representativeId,
      representativeName: authorizedRepresentativeTable.name,
      categoryId: collectionTable.categoryId,
      categoryName: category.name,
      methodId: collectionTable.methodId,
      methodName: method.name,
      projectId: collectionTable.projectId,
      projectName: projectTable.name,
      projectNumber: projectTable.number,
    })
    .from(collectionTable)
    .innerJoin(
      authorizedRepresentativeTable,
      eq(collectionTable.representativeId, authorizedRepresentativeTable.id),
    )
    .innerJoin(category, eq(collectionTable.categoryId, category.id))
    .innerJoin(method, eq(collectionTable.methodId, method.id))
    .leftJoin(projectTable, eq(collectionTable.projectId, projectTable.id));
}

function whereOf(filters: CollectionFilters) {
  const conditions: (SQL | undefined)[] = [];
  if (filters.from) conditions.push(gte(collectionTable.date, filters.from));
  if (filters.to) conditions.push(lte(collectionTable.date, filters.to));
  if (filters.representative !== null) {
    conditions.push(
      eq(collectionTable.representativeId, filters.representative),
    );
  }
  if (filters.category !== null) {
    conditions.push(eq(collectionTable.categoryId, filters.category));
  }
  if (filters.method !== null) {
    conditions.push(eq(collectionTable.methodId, filters.method));
  }
  if (filters.project === "none") {
    conditions.push(isNull(collectionTable.projectId));
  } else if (filters.project !== null) {
    conditions.push(eq(collectionTable.projectId, filters.project));
  }
  return and(...conditions);
}

/** The filtered tahsilatlar, newest first, with their count and total */
export async function selectCollections(filters: CollectionFilters) {
  const where = whereOf(filters);
  const [collections, [summary]] = await Promise.all([
    selectCollectionRows()
      .where(where)
      .orderBy(desc(collectionTable.date), desc(collectionTable.id)),
    db
      .select({ count: count(), total: sumOfCollected() })
      .from(collectionTable)
      .where(where),
  ]);
  return { collections, count: summary.count, total: summary.total };
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
