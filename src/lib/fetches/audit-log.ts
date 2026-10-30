import type { ClientRequestOptions } from "hono/client";
import { type AuditFilters, auditFiltersToParams } from "../audit-filters";
import { rpcClient } from "../rpc-client";

/** `options` lets server-side prefetches forward the user's cookies */
export async function getAuditLogs(
  filters: AuditFilters,
  options?: ClientRequestOptions,
) {
  const res = await rpcClient.api["audit-logs"].$get(
    { query: auditFiltersToParams(filters) },
    options,
  );

  if (!res.ok) throw new Error("An error occured while getting audit logs");

  return await res.json();
}

export type AuditLogPage = Awaited<ReturnType<typeof getAuditLogs>>;
export type AuditLogRow = AuditLogPage["rows"][number];
