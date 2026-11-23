import { z } from "zod";
import { parseSignedAmountInput, SIGNED_AMOUNT_PATTERN } from "../money";

const INVALID_AMOUNT = "Geçerli bir tutar girin";

const nameSchema = z
  .string()
  .trim()
  .min(1, "İsim boş olamaz")
  .max(200, "İsim en fazla 200 karakter olabilir");

/** POST and PATCH /api/cash-accounts; openingBalance as "1250.50" or "-1250.50" */
export const cashAccountSchema = z.object({
  name: nameSchema,
  openingBalance: z
    .string({ error: INVALID_AMOUNT })
    .regex(SIGNED_AMOUNT_PATTERN, INVALID_AMOUNT),
  active: z.boolean(),
});

export type CashAccountApiValues = z.input<typeof cashAccountSchema>;

/** The Kasa - Banka form: Başlangıç Bakiyesi typed the Turkish way, may be empty */
export const cashAccountFormSchema = z.object({
  name: nameSchema,
  openingBalance: z
    .string()
    .trim()
    .refine(
      (text) => text === "" || parseSignedAmountInput(text) !== null,
      INVALID_AMOUNT,
    ),
  active: z.boolean(),
});

export type CashAccountFormInput = z.input<typeof cashAccountFormSchema>;
export type CashAccountFormValues = z.output<typeof cashAccountFormSchema>;

/** Valid form values → what the API takes; an empty balance is 0 */
export function cashAccountToApi(
  values: CashAccountFormValues,
): CashAccountApiValues {
  return {
    ...values,
    // the schema has checked it parses
    openingBalance:
      values.openingBalance === ""
        ? "0.00"
        : (parseSignedAmountInput(values.openingBalance) as string),
  };
}
