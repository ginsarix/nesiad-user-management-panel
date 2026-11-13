import { parseIsoDate } from "./dates";

export const AUDIT_PAGE_SIZE = 50;

export const AUDIT_ENTITY_TYPES = [
  "member",
  "representative",
  "management_board",
  "committee",
  "disciplinary_board",
  "supervisory_board",
  "sector",
  "parameter",
  "counterparty",
  "payment",
  "project",
  "collection",
  "accrual",
  "panel_user",
  "sms",
  "auth",
] as const;
export type AuditEntityTypeFilter = (typeof AUDIT_ENTITY_TYPES)[number];

/** Actor filter value for entries without a logged-in user */
export const NO_ACTOR = "none";

/** The Denetim Kayıtları filters, as kept in the URL and sent to the API */
export type AuditFilters = {
  page: number;
  q: string;
  actor: string | null;
  type: AuditEntityTypeFilter | null;
  /** yyyy-aa-gg, Istanbul days, inclusive */
  from: string | null;
  to: string | null;
};

/** Reads filters from URL search params; anything invalid is dropped */
export function parseAuditFilters(params: {
  get(name: string): string | null;
}): AuditFilters {
  const page = Number(params.get("page"));
  const type = params.get("type");
  const isoDate = (value: string | null) =>
    value && parseIsoDate(value) ? value : null;

  return {
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
    q: params.get("q")?.trim() ?? "",
    actor: params.get("actor") || null,
    type: AUDIT_ENTITY_TYPES.includes(type as AuditEntityTypeFilter)
      ? (type as AuditEntityTypeFilter)
      : null,
    from: isoDate(params.get("from")),
    to: isoDate(params.get("to")),
  };
}

/** The non-default filters as search params (for the URL and the API) */
export function auditFiltersToParams(filters: AuditFilters) {
  const params: Record<string, string> = {};
  if (filters.page > 1) params.page = String(filters.page);
  if (filters.q) params.q = filters.q;
  if (filters.actor) params.actor = filters.actor;
  if (filters.type) params.type = filters.type;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  return params;
}
