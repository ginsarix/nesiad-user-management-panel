import { z } from "zod";

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

export const projectFormSchema = projectFieldsSchema;
export type ProjectFormValues = z.input<typeof projectFormSchema>;
