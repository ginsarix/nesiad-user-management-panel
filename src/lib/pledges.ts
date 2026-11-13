/**
 * Taahhüt totals: Adet × Tutar per row and the Genel Toplam. They are
 * never stored; this computes them wherever they are shown, in whole kuruş
 * (BigInt), so no float ever rounds them. Client-safe.
 */
import {
  formatAmountText,
  fromKurus,
  parseAmountInput,
  toKurus,
} from "./money";
import { MAX_QUANTITY, type PledgeFormRow } from "./zod-schemas/project";

/** 2 × "1250.50" → "2501.00" */
export function pledgeRowTotal(quantity: number, amount: string): string {
  return fromKurus(BigInt(quantity) * toKurus(amount));
}

/** The Genel Toplam of saved rows; "0.00" without rows */
export function pledgeGrandTotal(
  rows: readonly { quantity: number; amount: string }[],
): string {
  return fromKurus(
    rows.reduce(
      (sum, row) => sum + BigInt(row.quantity) * toKurus(row.amount),
      BigInt(0),
    ),
  );
}

const WHOLE_NUMBER = /^\d+$/;

/**
 * A form row's typed Adet and Tutar, or null while either doesn't parse or
 * Adet is past what the form accepts (a long paste would otherwise reach
 * BigInt as Infinity and throw during render)
 */
function typedValues(row: PledgeFormRow) {
  const quantity = row.quantity.trim();
  const amount = parseAmountInput(row.amount);
  if (!WHOLE_NUMBER.test(quantity) || amount === null) return null;
  if (Number(quantity) > MAX_QUANTITY) return null;
  return { quantity: Number(quantity), amount };
}

/** A form row's Toplam as typed; null while Adet or Tutar doesn't parse */
export function typedPledgeTotal(row: PledgeFormRow): string | null {
  const values = typedValues(row);
  return values && pledgeRowTotal(values.quantity, values.amount);
}

/** The form's Genel Toplam, leaving out rows that don't parse yet */
export function typedPledgeGrandTotal(rows: readonly PledgeFormRow[]): string {
  return pledgeGrandTotal(
    rows.flatMap((row) => {
      const values = typedValues(row);
      return values ? [values] : [];
    }),
  );
}

/** "Ali Veli: 2 × 1.000,00 TL, Ayşe: 1 × 50,25 TL"; "—" without rows */
export function pledgesAuditText(
  rows: readonly {
    representativeName: string;
    quantity: number;
    amount: string;
  }[],
): string {
  return (
    rows
      .map(
        (row) =>
          `${row.representativeName}: ${row.quantity} × ${formatAmountText(row.amount)}`,
      )
      .join(", ") || "—"
  );
}
