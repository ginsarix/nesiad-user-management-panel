import { z } from "zod";
import { amountRowFormSchema, amountRowsSchema } from "./amount-rows";

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

/** POST /api/projects; a page loaded before taahhütler existed sends none */
export const projectSchema = projectFieldsSchema.extend({
  pledges: amountRowsSchema.default([]),
});
/** PATCH /api/projects/:id: without `pledges` the taahhütler stay as they are */
export const projectUpdateSchema = projectFieldsSchema.extend({
  pledges: amountRowsSchema.optional(),
});
/** PUT /api/projects/:id/pledges */
export const pledgesBodySchema = z.object({ pledges: amountRowsSchema });

export type ProjectApiValues = z.input<typeof projectSchema>;
export type ProjectUpdateValues = z.input<typeof projectUpdateSchema>;

/** The details page's Taahhütler form */
export const pledgesFormSchema = z.object({
  pledges: z.array(amountRowFormSchema),
});
export type PledgesFormInput = z.input<typeof pledgesFormSchema>;
export type PledgesFormValues = z.output<typeof pledgesFormSchema>;

/** The Projeler create/edit form */
export const projectFormSchema = projectFieldsSchema.extend({
  pledges: z.array(amountRowFormSchema),
});
export type ProjectFormInput = z.input<typeof projectFormSchema>;
export type ProjectFormValues = z.output<typeof projectFormSchema>;
