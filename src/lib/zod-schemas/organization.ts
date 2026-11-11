import { z } from "zod";
import { ORGANIZATION_SLUGS } from "../organizations";

const nameSchema = z.string().trim().min(1, "İsim boş olamaz");

/** The `:organization` URL parameter: a slug from ORGANIZATION_INFO */
export const organizationParamSchema = z.object({
  organization: z.enum(ORGANIZATION_SLUGS, { error: "Geçersiz organizasyon" }),
});

/**
 * A group with all its people, in order. Create and update both send the
 * whole group; `people` replaces the rows. The same yetkili may appear twice.
 */
export const organizationGroupSchema = z.object({
  name: nameSchema,
  people: z.array(
    z.object({
      representativeId: z.number().int().positive(),
      roleId: z.number().int().positive(),
    }),
  ),
});

/** Client-side form values; a newly added row has nothing picked yet */
export const organizationGroupFormSchema = z.object({
  name: nameSchema,
  people: z.array(
    z.object({
      representativeId: z
        .number()
        .nullable()
        .refine((id) => id !== null, "Yetkili seçin"),
      roleId: z
        .number()
        .nullable()
        .refine((id) => id !== null, "Görev seçin"),
    }),
  ),
});

/** What the form holds; a row's ids may still be null */
export type OrganizationGroupFormInput = z.input<
  typeof organizationGroupFormSchema
>;
/** What a valid form submits */
export type OrganizationGroupFormValues = z.output<
  typeof organizationGroupFormSchema
>;
