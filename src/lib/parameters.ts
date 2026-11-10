/** Client-safe: no db imports. */

/**
 * The lists on the Parametreler tab besides Sektörler, in display order.
 * "Tür" is what the money is for, "Tip" is how it moves.
 */
export const PARAMETER_KINDS = [
  "collection_category",
  "collection_method",
  "payment_category",
  "payment_method",
] as const;

export type ParameterKind = (typeof PARAMETER_KINDS)[number];

export const PARAMETER_KIND_LABELS: Record<ParameterKind, string> = {
  collection_category: "Tahsilat Türü",
  collection_method: "Tahsilat Tipi",
  payment_category: "Ödeme Türü",
  payment_method: "Ödeme Tipi",
};
