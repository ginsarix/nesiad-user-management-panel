import { z } from "zod";
import { amountToInput, parseAmountInput } from "../money";
import {
  amountSchema,
  idSchema,
  pickedSchema,
  typedAmountSchema,
} from "./shared";

/** One tahakkuk row as the API takes it; Aidat is a Tahsilat Türü */
export const accrualRowSchema = z.object({
  representativeId: idSchema("Yetkili seçin"),
  categoryId: idSchema("Aidat seçin"),
  amount: amountSchema,
});
export type AccrualRowInput = z.output<typeof accrualRowSchema>;

/**
 * PUT /api/accruals: the whole list, and the version of the list the page
 * started from (a save over someone else's is refused)
 */
export const accrualBodySchema = z.object({
  rows: z.array(accrualRowSchema).max(500, "En fazla 500 tahakkuk eklenebilir"),
  version: z.string().min(1),
});

/** A tahakkuk row as typed: Tutar the Turkish way */
export const accrualFormRowSchema = z.object({
  representativeId: pickedSchema("Yetkili seçin"),
  categoryId: pickedSchema("Aidat seçin"),
  amount: typedAmountSchema,
});
export type AccrualFormRow = z.input<typeof accrualFormRowSchema>;

/** The Tahakkuk page's form */
export const accrualFormSchema = z.object({
  rows: z.array(accrualFormRowSchema),
});
export type AccrualFormInput = z.input<typeof accrualFormSchema>;
export type AccrualFormValues = z.output<typeof accrualFormSchema>;

/** Valid form rows → what the API takes */
export function accrualsToApi(
  rows: readonly z.output<typeof accrualFormRowSchema>[],
): AccrualRowInput[] {
  return rows.map((row) => ({
    representativeId: row.representativeId as number,
    categoryId: row.categoryId as number,
    // the schema has checked it parses
    amount: parseAmountInput(row.amount) as string,
  }));
}

/** Saved rows → what the form shows */
export function accrualsToForm(
  rows: readonly {
    representativeId: number;
    categoryId: number;
    amount: string;
  }[],
): AccrualFormRow[] {
  return rows.map((row) => ({
    representativeId: row.representativeId,
    categoryId: row.categoryId,
    amount: amountToInput(row.amount),
  }));
}
