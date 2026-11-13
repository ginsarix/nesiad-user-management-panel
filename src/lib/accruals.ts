/** Tahakkuk texts and totals. Client-safe. */
import { formatAmountText, parseAmountInput, sumAmounts } from "./money";
import type { AccrualFormRow } from "./zod-schemas/accrual";

/** "Ali Veli: 2027 Aidatı 1.000,00 TL, …"; "—" without rows */
export function accrualsAuditText(
  rows: readonly {
    representativeName: string;
    categoryName: string;
    amount: string;
  }[],
) {
  return (
    rows
      .map(
        (row) =>
          `${row.representativeName}: ${row.categoryName} ${formatAmountText(row.amount)}`,
      )
      .join(", ") || "—"
  );
}

/** The form's Genel Toplam: the Tutar of each row that parses yet */
export function typedAccrualTotal(rows: readonly AccrualFormRow[]) {
  return sumAmounts(
    rows.flatMap((row) => {
      const amount = parseAmountInput(row.amount);
      return amount === null ? [] : [amount];
    }),
  );
}
