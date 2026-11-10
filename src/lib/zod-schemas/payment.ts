import { z } from "zod";
import { AMOUNT_PATTERN, parseAmountInput } from "../money";
import {
  optionalTextSchema,
  requiredDisplayDateSchema,
  requiredIsoDateSchema,
} from "./shared";

const INVALID_AMOUNT = "Geçerli bir tutar girin";
const NOT_POSITIVE = "Tutar sıfırdan büyük olmalı";

const idSchema = (message: string) =>
  z.number({ error: message }).int(message).positive(message);

/** POST and PATCH /api/payments: every field; amount as "1250.50" */
export const paymentSchema = z.object({
  counterpartyId: idSchema("Cari seçin"),
  amount: z
    .string({ error: INVALID_AMOUNT })
    .regex(AMOUNT_PATTERN, INVALID_AMOUNT)
    .refine((amount) => Number(amount) > 0, NOT_POSITIVE),
  date: requiredIsoDateSchema,
  categoryId: idSchema("Ödeme türü seçin"),
  methodId: idSchema("Ödeme tipi seçin"),
  note: optionalTextSchema.transform((note) => note ?? null),
});

export type PaymentValues = z.input<typeof paymentSchema>;

const pickedSchema = (message: string) =>
  z
    .number()
    .nullable()
    .refine((id) => id !== null, message);

/** The Ödeme form: amount typed the Turkish way, date as gg.aa.yyyy */
export const paymentFormSchema = z.object({
  counterpartyId: pickedSchema("Cari seçin"),
  amount: z
    .string()
    .trim()
    .min(1, "Tutar boş olamaz")
    .refine((text) => parseAmountInput(text) !== null, INVALID_AMOUNT)
    .refine((text) => Number(parseAmountInput(text)) > 0, NOT_POSITIVE),
  date: requiredDisplayDateSchema,
  categoryId: pickedSchema("Ödeme türü seçin"),
  methodId: pickedSchema("Ödeme tipi seçin"),
  note: z.string(),
});

/** What the form holds; pickers may still be null */
export type PaymentFormInput = z.input<typeof paymentFormSchema>;
/** What a valid form submits */
export type PaymentFormValues = z.output<typeof paymentFormSchema>;
