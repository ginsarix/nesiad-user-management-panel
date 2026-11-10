import { displayToIso, parseIsoDate } from "./dates";

/** The Ödemeler list filters, as kept in the URL and sent to the API */
export type PaymentFilters = {
  /** yyyy-aa-gg, inclusive */
  from: string | null;
  to: string | null;
  counterparty: number | null;
  /** Ödeme Türü (parameter id) */
  category: number | null;
  /** Ödeme Tipi (parameter id) */
  method: number | null;
};

export const NO_PAYMENT_FILTERS: PaymentFilters = {
  from: null,
  to: null,
  counterparty: null,
  category: null,
  method: null,
};

const ID_KEYS = ["counterparty", "category", "method"] as const;

function parseId(value: string | null) {
  const id = Number(value);
  return value && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Reads filters from URL search params; anything invalid is dropped */
export function parsePaymentFilters(params: {
  get(name: string): string | null;
}): PaymentFilters {
  const isoDate = (value: string | null) =>
    value && parseIsoDate(value) ? value : null;

  return {
    from: isoDate(params.get("from")),
    to: isoDate(params.get("to")),
    counterparty: parseId(params.get("counterparty")),
    category: parseId(params.get("category")),
    method: parseId(params.get("method")),
  };
}

/** The set filters as search params (for the URL and the API) */
export function paymentFiltersToParams(filters: PaymentFilters) {
  const params: Record<string, string> = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  for (const key of ID_KEYS) {
    const id = filters[key];
    if (id !== null) params[key] = String(id);
  }
  return params;
}

/**
 * A date filter as typed (gg.aa.yyyy). Only "empty" and "valid" can be
 * applied; anything else means the list doesn't match what's typed yet.
 */
export function dateFilterText(text: string): {
  state: "empty" | "valid" | "incomplete" | "invalid";
  iso: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) return { state: "empty", iso: null };
  const iso = displayToIso(trimmed);
  if (iso) return { state: "valid", iso };
  return {
    state: trimmed.length >= "gg.aa.yyyy".length ? "invalid" : "incomplete",
    iso: null,
  };
}
