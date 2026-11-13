import { parseIsoDate } from "./dates";

/** The Tahsilatlar list filters, as kept in the URL and sent to the API */
export type CollectionFilters = {
  /** yyyy-aa-gg, inclusive */
  from: string | null;
  to: string | null;
  /** the yetkili the tahsilat is from */
  representative: number | null;
  /** Tahsilat Türü (parameter id) */
  category: number | null;
  /** Tahsilat Tipi (parameter id) */
  method: number | null;
  /** a proje, or "none" for tahsilatlar without one (Projesiz) */
  project: number | "none" | null;
};

export const NO_COLLECTION_FILTERS: CollectionFilters = {
  from: null,
  to: null,
  representative: null,
  category: null,
  method: null,
  project: null,
};

const ID_KEYS = ["representative", "category", "method"] as const;

function parseId(value: string | null) {
  const id = Number(value);
  return value && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Reads filters from URL search params; anything invalid is dropped */
export function parseCollectionFilters(params: {
  get(name: string): string | null;
}): CollectionFilters {
  const isoDate = (value: string | null) =>
    value && parseIsoDate(value) ? value : null;
  const project = params.get("project");

  return {
    from: isoDate(params.get("from")),
    to: isoDate(params.get("to")),
    representative: parseId(params.get("representative")),
    category: parseId(params.get("category")),
    method: parseId(params.get("method")),
    project: project === "none" ? "none" : parseId(project),
  };
}

/** The set filters as search params (for the URL and the API) */
export function collectionFiltersToParams(filters: CollectionFilters) {
  const params: Record<string, string> = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  for (const key of ID_KEYS) {
    const id = filters[key];
    if (id !== null) params[key] = String(id);
  }
  if (filters.project !== null) params.project = String(filters.project);
  return params;
}
