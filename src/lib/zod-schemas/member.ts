import { z } from "zod";
import { optionalDisplayDateSchema, optionalIsoDateSchema } from "./shared";

export const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MiB

export const logoFileSchema = z
  .instanceof(File)
  .refine((f) => f.size <= MAX_LOGO_SIZE, "Logo 5 MB'dan küçük olmalıdır")
  .refine(
    (f) => f.type.startsWith("image/"),
    "Sadece resim dosyaları kabul edilir",
  );

const titleSchema = z.string().trim().min(1, "Ünvan boş olamaz");

/** Free-text field; a blank value is stored as null */
const optionalTextSchema = z
  .string()
  .trim()
  .transform((value) => value || null)
  .optional();

export const createMemberSchema = z.object({
  title: titleSchema,

  memberLoginDate: optionalIsoDateSchema,

  /** Defaults to aktif when left out */
  active: z.stringbool().optional(),

  logo: logoFileSchema.optional(),

  address: optionalTextSchema,
  phone: optionalTextSchema,
  sector: optionalTextSchema,
  foundingDate: optionalIsoDateSchema,
});

export const updateMemberSchema = createMemberSchema.partial().extend({
  /** Clears the current logo when no new one is uploaded */
  removeLogo: z.stringbool().optional(),
});

/** Client-side form values (dates as gg.aa.yyyy); sent to the API as multipart form data */
export const memberFormSchema = z.object({
  title: titleSchema,
  memberLoginDate: optionalDisplayDateSchema,
  active: z.boolean(),
  address: z.string(),
  phone: z.string(),
  sector: z.string(),
  foundingDate: optionalDisplayDateSchema,
  logo: logoFileSchema.nullable(),
  removeLogo: z.boolean(),
});

export type MemberFormValues = z.infer<typeof memberFormSchema>;
