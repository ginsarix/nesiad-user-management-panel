/** Client-safe: no db imports. */

/**
 * The lists on the Parametreler tab besides Sektörler, in display order.
 * "Tür" is what the money is for (how it moves is its Kasa - Banka).
 * Dernek Görevleri is the Görev on the Organizasyon pages (not the yetkili
 * görev on a member link).
 */
export const PARAMETER_KINDS = [
  "collection_category",
  "payment_category",
  "association_role",
] as const;

export type ParameterKind = (typeof PARAMETER_KINDS)[number];

export const PARAMETER_KIND_LABELS: Record<ParameterKind, string> = {
  collection_category: "Tahsilat Türü",
  payment_category: "Ödeme Türü",
  association_role: "Dernek Görevi",
};

/**
 * What a list's entries are used by, for "Bu kayıt 3 ödemede kullanılıyor"
 * and "bu ödemelerin Ödeme Türü alanını değiştirin": the users, and the
 * field to change there.
 */
export function parameterUsageNouns(kind: ParameterKind) {
  const field = PARAMETER_KIND_LABELS[kind];
  if (kind === "association_role") {
    return {
      locative: "organizasyon kaydında",
      genitivePlural: "organizasyon kayıtlarının",
      field,
    };
  }
  if (kind === "collection_category") {
    // a Tahsilat Türü is also a tahakkuk row's Aidat
    return {
      locative: "tahsilat veya tahakkuk kaydında",
      genitivePlural: "kayıtların",
      field: `${field} / Aidat`,
    };
  }
  return { locative: "ödemede", genitivePlural: "ödemelerin", field };
}
