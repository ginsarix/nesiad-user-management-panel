/** Client-safe: no db imports. */

/**
 * The lists on the Parametreler tab besides Sektörler, in display order.
 * "Tür" is what the money is for, "Tip" is how it moves. Dernek Görevleri
 * isn't used anywhere yet (it is not the yetkili görev on a member link).
 */
export const PARAMETER_KINDS = [
  "collection_category",
  "collection_method",
  "payment_category",
  "payment_method",
  "association_role",
] as const;

export type ParameterKind = (typeof PARAMETER_KINDS)[number];

export const PARAMETER_KIND_LABELS: Record<ParameterKind, string> = {
  collection_category: "Tahsilat Türü",
  collection_method: "Tahsilat Tipi",
  payment_category: "Ödeme Türü",
  payment_method: "Ödeme Tipi",
  association_role: "Dernek Görevi",
};

/**
 * What a list's entries are used by, for "Bu kayıt 3 ödemede kullanılıyor"
 * and "bu ödemelerin … alanını değiştirin". Each kind is used by one feature.
 */
export function parameterUsageNouns(kind: ParameterKind) {
  if (kind === "association_role") {
    return {
      locative: "organizasyon kaydında",
      genitivePlural: "organizasyon kayıtlarının",
    };
  }
  return kind.startsWith("payment_")
    ? { locative: "ödemede", genitivePlural: "ödemelerin" }
    : { locative: "tahsilatta", genitivePlural: "tahsilatların" };
}
