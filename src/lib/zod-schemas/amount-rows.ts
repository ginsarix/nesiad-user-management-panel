import { z } from "zod";
import { amountToInput, parseAmountInput } from "../money";
import {
  amountSchema,
  idSchema,
  pickedSchema,
  typedAmountSchema,
} from "./shared";

/**
 * Rows of yetkili × Adet × Tutar (per unit): a proje's Taahhütler and the
 * Tahakkuk list. Totals are never stored (src/lib/amount-rows.ts).
 */

/** The largest Adet a row may have */
export const MAX_QUANTITY = 1_000_000;
const QUANTITY_NOT_WHOLE = "Adet tam sayı olmalı";
const QUANTITY_TOO_SMALL = "Adet en az 1 olmalı";
const QUANTITY_TOO_LARGE = "Adet en fazla 1.000.000 olabilir";

/** One row as the API takes it; amount as "1250.50" (per unit) */
export const amountRowSchema = z.object({
  representativeId: idSchema("Yetkili seçin"),
  quantity: z
    .number({ error: QUANTITY_NOT_WHOLE })
    .int(QUANTITY_NOT_WHOLE)
    .min(1, QUANTITY_TOO_SMALL)
    .max(MAX_QUANTITY, QUANTITY_TOO_LARGE),
  amount: amountSchema,
});

export const amountRowsSchema = z
  .array(amountRowSchema)
  .max(500, "En fazla 500 satır eklenebilir");

export type AmountRowInput = z.output<typeof amountRowSchema>;

/** A row as typed: Adet as text, Tutar the Turkish way */
export const amountRowFormSchema = z.object({
  representativeId: pickedSchema("Yetkili seçin"),
  quantity: z
    .string()
    .trim()
    .min(1, "Adet boş olamaz")
    .regex(/^\d+$/, QUANTITY_NOT_WHOLE)
    .refine((text) => Number(text) >= 1, QUANTITY_TOO_SMALL)
    .refine((text) => Number(text) <= MAX_QUANTITY, QUANTITY_TOO_LARGE),
  amount: typedAmountSchema,
});

export type AmountRowFormRow = z.input<typeof amountRowFormSchema>;
type ValidAmountFormRow = z.output<typeof amountRowFormSchema>;

/** Valid form rows → what the API takes */
export function amountRowsToApi(
  rows: readonly ValidAmountFormRow[],
): AmountRowInput[] {
  return rows.map((row) => ({
    representativeId: row.representativeId as number,
    quantity: Number(row.quantity),
    // the schema has checked it parses
    amount: parseAmountInput(row.amount) as string,
  }));
}

/** Saved rows → what the form shows */
export function amountRowsToForm(
  rows: readonly {
    representativeId: number;
    quantity: number;
    amount: string;
  }[],
): AmountRowFormRow[] {
  return rows.map((row) => ({
    representativeId: row.representativeId,
    quantity: String(row.quantity),
    amount: amountToInput(row.amount),
  }));
}
