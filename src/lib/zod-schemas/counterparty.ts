import { z } from "zod";
import { isValidLocation, PROVINCES } from "../turkey";
import { emailTextSchema, optionalTextSchema } from "./shared";

const titleSchema = z
  .string()
  .trim()
  .min(1, "Ünvan boş olamaz")
  .max(200, "Ünvan en fazla 200 karakter olabilir");

/** Free text; blank or left out is stored as null */
const nullableTextSchema = optionalTextSchema.transform(
  (value) => value ?? null,
);

/** Şehir must be a province and İlçe one of its districts (or both blank) */
function checkLocation(
  { city, district }: { city: string | null; district: string | null },
  ctx: z.RefinementCtx,
) {
  if (isValidLocation(city || null, district || null)) return;
  if (city && !PROVINCES.includes(city)) {
    ctx.addIssue({
      code: "custom",
      message: "Geçerli bir il seçin",
      path: ["city"],
    });
  } else {
    ctx.addIssue({
      code: "custom",
      message: "Geçerli bir ilçe seçin",
      path: ["district"],
    });
  }
}

/** POST and PATCH /api/counterparties: every field, blanks as null */
export const counterpartySchema = z
  .object({
    title: titleSchema,
    city: nullableTextSchema,
    district: nullableTextSchema,
    address: nullableTextSchema,
    phone: nullableTextSchema,
    email: emailTextSchema.transform((value) => value || null).optional(),
  })
  .transform((values) => ({ ...values, email: values.email ?? null }))
  .superRefine(checkLocation);

export type CounterpartyValues = z.input<typeof counterpartySchema>;

/** The Cari form; Şehir and İlçe are "" when not picked */
export const counterpartyFormSchema = z
  .object({
    title: titleSchema,
    city: z.string(),
    district: z.string(),
    address: z.string(),
    phone: z.string(),
    email: emailTextSchema,
  })
  .superRefine(checkLocation);

export type CounterpartyFormValues = z.infer<typeof counterpartyFormSchema>;
