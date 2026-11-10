import { z } from "zod";
import { PARAMETER_KINDS } from "../parameters";

/** PATCH /api/parameters/:id and the add/rename dialog */
export const parameterNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ad boş olamaz")
    .max(100, "Ad en fazla 100 karakter olabilir"),
});

export type ParameterNameFormValues = z.infer<typeof parameterNameSchema>;

/** POST /api/parameters */
export const createParameterSchema = parameterNameSchema.extend({
  kind: z.enum(PARAMETER_KINDS, { error: "Geçersiz liste" }),
});

export type CreateParameterValues = z.infer<typeof createParameterSchema>;
