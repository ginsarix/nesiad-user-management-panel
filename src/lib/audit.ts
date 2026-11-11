import type { db } from "@/db";
import type { AuditChange, AuditField } from "@/db/schema";
import { auditLogTable } from "@/db/schema";
import type { Organization } from "./organizations";

/** Who did it; null is the system (seed, scripts) or an unknown visitor */
export type AuditActor = { id: string; name: string; email: string } | null;

export type AuditEntityType =
  | "member"
  | "representative"
  | Organization
  | "sector"
  | "parameter"
  | "counterparty"
  | "payment"
  | "project"
  | "collection"
  | "panel_user"
  | "sms"
  | "auth";

export type AuditEntry = {
  actor: AuditActor;
  action: string;
  entityType: AuditEntityType;
  entityId?: string | number | null;
  entityLabel?: string | null;
  changes?: AuditChange[];
  details?: AuditField[];
  ip?: string | null;
  userAgent?: string | null;
};

/** `db` or a transaction, so the entry commits together with the change */
type Executor = Pick<typeof db, "insert">;

export async function recordAudit(executor: Executor, entry: AuditEntry) {
  await executor.insert(auditLogTable).values({
    actorId: entry.actor?.id ?? null,
    actorName: entry.actor?.name ?? null,
    actorEmail: entry.actor?.email ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId == null ? null : String(entry.entityId),
    entityLabel: entry.entityLabel ?? null,
    changes: entry.changes?.length ? entry.changes : null,
    details: entry.details?.length ? entry.details : null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
  });
}
