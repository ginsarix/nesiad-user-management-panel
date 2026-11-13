import { z } from "zod";
import { projectFieldsSchema } from "./project";
import {
  amountSchema,
  idSchema,
  optionalTextSchema,
  pickedSchema,
  requiredDisplayDateSchema,
  requiredIsoDateSchema,
  typedAmountSchema,
} from "./shared";

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
  representativeId: idSchema("Yetkili seçin"),
  categoryId: idSchema("Tahsilat türü seçin"),
  methodId: idSchema("Tahsilat tipi seçin"),
  amount: amountSchema,
  date: requiredIsoDateSchema,
  note: optionalTextSchema.transform((note) => note ?? null),
  project: projectChoiceSchema,
});

export type CollectionValues = z.input<typeof collectionSchema>;

export type ProjectMode = "none" | "existing" | "new";

/**
 * The Tahsilat form. The Proje section keeps every input for all three
 * modes; only the chosen mode's inputs are checked and sent.
 */
export const collectionFormSchema = z.object({
  representativeId: pickedSchema("Yetkili seçin"),
  categoryId: pickedSchema("Tahsilat türü seçin"),
  methodId: pickedSchema("Tahsilat tipi seçin"),
  amount: typedAmountSchema,
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
