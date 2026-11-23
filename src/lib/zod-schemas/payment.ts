import { z } from "zod";
import {
  amountSchema,
  idSchema,
  optionalTextSchema,
  pickedSchema,
  requiredDisplayDateSchema,
  requiredIsoDateSchema,
  typedAmountSchema,
} from "./shared";

/** POST and PATCH /api/payments: every field; amount as "1250.50" */
export const paymentSchema = z.object({
  counterpartyId: idSchema("Cari seçin"),
  amount: amountSchema,
  date: requiredIsoDateSchema,
  categoryId: idSchema("Ödeme türü seçin"),
  cashAccountId: idSchema("Kasa - Banka seçin"),
  note: optionalTextSchema.transform((note) => note ?? null),
});

export type PaymentValues = z.input<typeof paymentSchema>;

/** The Ödeme form: amount typed the Turkish way, date as gg.aa.yyyy */
export const paymentFormSchema = z.object({
  counterpartyId: pickedSchema("Cari seçin"),
  amount: typedAmountSchema,
  date: requiredDisplayDateSchema,
  categoryId: pickedSchema("Ödeme türü seçin"),
  cashAccountId: pickedSchema("Kasa - Banka seçin"),
  note: z.string(),
});

/** What the form holds; pickers may still be null */
export type PaymentFormInput = z.input<typeof paymentFormSchema>;
/** What a valid form submits */
export type PaymentFormValues = z.output<typeof paymentFormSchema>;
