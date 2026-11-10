/**
 * What has to exist before a payment can be recorded: a cari to pay, and
 * an Ödeme Türü and Ödeme Tipi. A list that hasn't loaded (undefined)
 * counts as not missing, so a failed request doesn't send staff off to add
 * things that already exist. Client-safe.
 */
export function missingForPayments(
  counterparties: readonly unknown[] | undefined,
  parameters: readonly { kind: string }[] | undefined,
) {
  return {
    counterparty: counterparties !== undefined && counterparties.length === 0,
    parameters:
      parameters !== undefined &&
      !(
        parameters.some((p) => p.kind === "payment_category") &&
        parameters.some((p) => p.kind === "payment_method")
      ),
  };
}
