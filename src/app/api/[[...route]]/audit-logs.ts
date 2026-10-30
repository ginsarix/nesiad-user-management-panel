import { zValidator } from "@hono/zod-validator";
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@/db";
import { auditLogTable } from "@/db/schema";
import {
  AUDIT_PAGE_SIZE,
  type AuditFilters,
  NO_ACTOR,
  parseAuditFilters,
} from "@/lib/audit-filters";
import { compareTr } from "@/lib/turkish";
import type { AppEnv } from "./env";

/** Midnight in Istanbul of a yyyy-aa-gg day (+ `days`), as a timestamp */
function istanbulDayStart(isoDate: string, days = 0) {
  return sql`((${isoDate}::date + ${days}::int)::timestamp AT TIME ZONE 'Europe/Istanbul')`;
}

function whereOf(filters: AuditFilters) {
  const conditions: (SQL | undefined)[] = [];

  if (filters.actor === NO_ACTOR)
    conditions.push(isNull(auditLogTable.actorId));
  else if (filters.actor) {
    conditions.push(eq(auditLogTable.actorId, filters.actor));
  }
  if (filters.type) conditions.push(eq(auditLogTable.entityType, filters.type));
  if (filters.from) {
    conditions.push(
      gte(auditLogTable.createdAt, istanbulDayStart(filters.from)),
    );
  }
  if (filters.to) {
    // inclusive: up to the start of the next day
    conditions.push(
      lt(auditLogTable.createdAt, istanbulDayStart(filters.to, 1)),
    );
  }
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        ilike(auditLogTable.entityLabel, pattern),
        ilike(auditLogTable.actorName, pattern),
        ilike(auditLogTable.actorEmail, pattern),
      ),
    );
  }

  return and(...conditions);
}

// Read-only: the audit log has no routes to change or delete entries
// all optional text; parseAuditFilters drops anything invalid
const querySchema = z.object({
  page: z.string().optional(),
  q: z.string().optional(),
  actor: z.string().optional(),
  type: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const auditLogsRoute = new Hono<AppEnv>().get(
  "/",
  zValidator("query", querySchema),
  async (c) => {
    const query = c.req.valid("query");
    const filters = parseAuditFilters({
      get: (name) => query[name as keyof typeof query] ?? null,
    });
    const where = whereOf(filters);

    const [rows, total, actors] = await Promise.all([
      db
        .select()
        .from(auditLogTable)
        .where(where)
        .orderBy(desc(auditLogTable.createdAt), desc(auditLogTable.id))
        .limit(AUDIT_PAGE_SIZE)
        .offset((filters.page - 1) * AUDIT_PAGE_SIZE),
      db.$count(auditLogTable, where),
      // from the log itself, so deleted panel users can still be picked;
      // each with the name of their latest entry
      db
        .selectDistinctOn([auditLogTable.actorId], {
          id: auditLogTable.actorId,
          name: auditLogTable.actorName,
        })
        .from(auditLogTable)
        .where(isNotNull(auditLogTable.actorId))
        .orderBy(auditLogTable.actorId, desc(auditLogTable.createdAt)),
    ]);

    return c.json({
      rows,
      total,
      page: filters.page,
      pageSize: AUDIT_PAGE_SIZE,
      actors: actors
        .map((actor) => ({ id: actor.id ?? "", name: actor.name ?? "" }))
        .sort((a, b) => compareTr(a.name, b.name)),
    });
  },
);
