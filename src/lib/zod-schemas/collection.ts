import { z } from "zod";
import { AMOUNT_PATTERN, parseAmountInput } from "../money";
import { projectFieldsSchema } from "./project";
import {
  optionalTextSchema,
  requiredDisplayDateSchema,
  requiredIsoDateSchema,
} from "./shared";

const INVALID_AMOUNT = "Geçerli bir tutar girin";
const NOT_POSITIVE = "Tutar sıfırdan büyük olmalı";

const idSchema = (message: string) =>
  z.number({ error: message }).int(message).positive(message);

/** No proje, an existing one, or a new one created with the tahsilat */
const projectChoiceSchema = z.discriminatedUnion(
  "mode",
  [
    z.object({ mode: z.literal("none") }),
    z.object({ mode: z.literal("existing"), id: idSchema("Proje seçin") }),
    projectFieldsSchema.extend({ mode: z.literal("new") }),
  ],
  { error: "Proje seçimi geçersiz" },
);

/** POST and PATCH /api/collections: every field; amount as "1250.50" */
export const collectionSchema = z.object({
  memberId: idSchema("Üye seçin"),
  categoryId: idSchema("Tahsilat türü seçin"),
  methodId: idSchema("Tahsilat tipi seçin"),
  amount: z
    .string({ error: INVALID_AMOUNT })
    .regex(AMOUNT_PATTERN, INVALID_AMOUNT)
    .refine((amount) => Number(amount) > 0, NOT_POSITIVE),
  date: requiredIsoDateSchema,
  note: optionalTextSchema.transform((note) => note ?? null),
  project: projectChoiceSchema,
});

export type CollectionValues = z.input<typeof collectionSchema>;

export type ProjectMode = "none" | "existing" | "new";

const pickedSchema = (message: string) =>
  z
    .number()
    .nullable()
    .refine((id) => id !== null, message);

/**
 * The Tahsilat form. The Proje section keeps every input for all three
 * modes; only the chosen mode's inputs are checked and sent.
 */
export const collectionFormSchema = z.object({
  memberId: pickedSchema("Üye seçin"),
  categoryId: pickedSchema("Tahsilat türü seçin"),
  methodId: pickedSchema("Tahsilat tipi seçin"),
  amount: z
    .string()
    .trim()
    .min(1, "Tutar boş olamaz")
    .refine((text) => parseAmountInput(text) !== null, INVALID_AMOUNT)
    .refine((text) => Number(parseAmountInput(text)) > 0, NOT_POSITIVE),
  date: requiredDisplayDateSchema,
  note: z.string(),
  project: z
    .object({
      mode: z.enum(["none", "existing", "new"]),
      id: z.number().nullable(),
      name: z.string(),
      number: z.string(),
      active: z.boolean(),
    })
    .superRefine((project, ctx) => {
      if (project.mode === "existing" && project.id === null) {
        ctx.addIssue({ code: "custom", message: "Proje seçin", path: ["id"] });
      }
      if (project.mode === "new") {
        const result = projectFieldsSchema.safeParse(project);
        for (const issue of result.error?.issues ?? []) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: issue.path,
          });
        }
      }
    }),
});

/** What the form holds; pickers may still be null */
export type CollectionFormInput = z.input<typeof collectionFormSchema>;
/** What a valid form submits */
export type CollectionFormValues = z.output<typeof collectionFormSchema>;
