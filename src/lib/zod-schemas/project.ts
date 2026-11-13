import { z } from "zod";
import { amountToInput, parseAmountInput } from "../money";
import {
  amountSchema,
  idSchema,
  pickedSchema,
  typedAmountSchema,
} from "./shared";

/** A proje's fields: the Projeler form, its API, and the Tahsilat form's "Yeni proje" */
export const projectFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Proje adı boş olamaz")
    .max(200, "Proje adı en fazla 200 karakter olabilir"),
  number: z
    .string()
    .trim()
    .min(1, "Proje numarası boş olamaz")
    .max(50, "Proje numarası en fazla 50 karakter olabilir"),
  active: z.boolean(),
});

export type ProjectFields = z.output<typeof projectFieldsSchema>;

const MAX_QUANTITY = 1_000_000;
const QUANTITY_NOT_WHOLE = "Adet tam sayı olmalı";
const QUANTITY_TOO_SMALL = "Adet en az 1 olmalı";
const QUANTITY_TOO_LARGE = "Adet en fazla 1.000.000 olabilir";

/** One taahhüt as the API takes it; amount as "1250.50" (per unit) */
export const pledgeSchema = z.object({
  representativeId: idSchema("Yetkili seçin"),
  quantity: z
    .number({ error: QUANTITY_NOT_WHOLE })
    .int(QUANTITY_NOT_WHOLE)
    .min(1, QUANTITY_TOO_SMALL)
    .max(MAX_QUANTITY, QUANTITY_TOO_LARGE),
  amount: amountSchema,
});

export const pledgesSchema = z
  .array(pledgeSchema)
  .max(500, "En fazla 500 taahhüt eklenebilir");

export type PledgeInput = z.output<typeof pledgeSchema>;

/** POST /api/projects; a page loaded before taahhütler existed sends none */
export const projectSchema = projectFieldsSchema.extend({
  pledges: pledgesSchema.default([]),
});
/** PATCH /api/projects/:id: without `pledges` the taahhütler stay as they are */
export const projectUpdateSchema = projectFieldsSchema.extend({
  pledges: pledgesSchema.optional(),
});
/** PUT /api/projects/:id/pledges */
export const pledgesBodySchema = z.object({ pledges: pledgesSchema });

export type ProjectApiValues = z.input<typeof projectSchema>;
export type ProjectUpdateValues = z.input<typeof projectUpdateSchema>;

/** A taahhüt row as typed: Adet as text, Tutar the Turkish way */
export const pledgeFormRowSchema = z.object({
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

export type PledgeFormRow = z.input<typeof pledgeFormRowSchema>;
type ValidPledgeFormRow = z.output<typeof pledgeFormRowSchema>;

/** The details page's Taahhütler form */
export const pledgesFormSchema = z.object({
  pledges: z.array(pledgeFormRowSchema),
});
export type PledgesFormInput = z.input<typeof pledgesFormSchema>;
export type PledgesFormValues = z.output<typeof pledgesFormSchema>;

/** The Projeler create/edit form */
export const projectFormSchema = projectFieldsSchema.extend({
  pledges: z.array(pledgeFormRowSchema),
});
export type ProjectFormInput = z.input<typeof projectFormSchema>;
export type ProjectFormValues = z.output<typeof projectFormSchema>;

/** Valid form rows → what the API takes */
export function pledgesToApi(
  rows: readonly ValidPledgeFormRow[],
): PledgeInput[] {
  return rows.map((row) => ({
    representativeId: row.representativeId as number,
    quantity: Number(row.quantity),
    // the schema has checked it parses
    amount: parseAmountInput(row.amount) as string,
  }));
}

/** Saved rows → what the form shows */
export function pledgesToForm(
  rows: readonly {
    representativeId: number;
    quantity: number;
    amount: string;
  }[],
): PledgeFormRow[] {
  return rows.map((row) => ({
    representativeId: row.representativeId,
    quantity: String(row.quantity),
    amount: amountToInput(row.amount),
  }));
}
