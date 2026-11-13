import { z } from "zod";
import { amountRowFormSchema, amountRowsSchema } from "./amount-rows";

/**
 * PUT /api/accruals: the whole list, and the version of the list the page
 * started from (a save over someone else's is refused)
 */
export const accrualBodySchema = z.object({
  rows: amountRowsSchema,
  version: z.string().min(1),
});

/** The Tahakkuk page's form */
export const accrualFormSchema = z.object({
  rows: z.array(amountRowFormSchema),
});
export type AccrualFormInput = z.input<typeof accrualFormSchema>;
export type AccrualFormValues = z.output<typeof accrualFormSchema>;
