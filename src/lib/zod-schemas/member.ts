import { z } from "zod";
import { isValidNationalId } from "../national-id";
import { ORGANIZATIONS } from "../organizations";
import { checkPhone } from "../sms/recipients";
import { memberCompanyInputSchema } from "./company";
import {
  optionalDisplayDateSchema,
  optionalIsoDateSchema,
  optionalTextSchema,
} from "./shared";

export const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MiB

/** Room for a logo (with its PDF/SVG) and two documents plus the text fields */
export const MAX_REQUEST_SIZE = 4 * MAX_LOGO_SIZE + 1024 * 1024;

export const documentFileSchema = z
  .instanceof(File)
  .refine((f) => f.size > 0, "Dosya boş olamaz")
  .refine((f) => f.size <= MAX_LOGO_SIZE, "Dosyalar 5 MB'dan küçük olmalıdır")
  .refine(
    (f) => /\.(pdf|png|jpe?g)$/i.test(f.name),
    "Sadece PDF, PNG veya JPG dosyaları kabul edilir",
  );

// lives with the company now; re-exported for the application schema
export { normalizeWebsite } from "./company";

/** The logo image the API stores; a PDF/SVG logo arrives already drawn as PNG */
export const logoFileSchema = z
  .instanceof(File)
  .refine((f) => f.size <= MAX_LOGO_SIZE, "Logo 5 MB'dan küçük olmalıdır")
  .refine(
    (f) => f.type.startsWith("image/"),
    "Sadece resim dosyaları kabul edilir",
  );

/** The PDF or SVG a logo was drawn from, sent with the PNG; checked by contents */
export const logoOriginalFileSchema = z
  .instanceof(File)
  .refine((f) => f.size > 0, "Dosya boş olamaz")
  .refine((f) => f.size <= MAX_LOGO_SIZE, "Logo 5 MB'dan küçük olmalıdır");

/** A logo as picked in a panel form: an image, or a PDF/SVG drawn before upload */
export const logoFormFileSchema = z
  .instanceof(File)
  .refine((f) => f.size <= MAX_LOGO_SIZE, "Logo 5 MB'dan küçük olmalıdır")
  .refine(
    (f) =>
      f.type.startsWith("image/") ||
      f.type === "application/pdf" ||
      /\.(pdf|svg)$/i.test(f.name),
    "Sadece resim, PDF veya SVG dosyaları kabul edilir",
  );

const titleSchema = z.string().trim().min(1, "Ünvan boş olamaz");

const optionalEmailSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (value && !z.email().safeParse(value).success) {
      ctx.addIssue({ code: "custom", message: "Geçerli bir e-posta girin" });
    }
  })
  .transform((value) => value || null)
  .optional();

const optionalMobilePhoneSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (value && !checkPhone(value).ok) {
      ctx.addIssue({
        code: "custom",
        message: "Geçerli bir cep telefonu girin",
      });
    }
  })
  .transform((value) => value || null)
  .optional();

/** Blank leaves the stored number as it is (it is never shown back to staff) */
const nationalIdInputSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return undefined;
    if (!isValidNationalId(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Geçerli bir TC Kimlik No girin",
      });
      return z.NEVER;
    }
    return value;
  })
  .optional();

const optionalGenderSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    if (value !== "male" && value !== "female") {
      ctx.addIssue({ code: "custom", message: "Geçersiz cinsiyet" });
      return z.NEVER;
    }
    return value;
  })
  .optional();

export const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MiB

export const PHOTO_TOO_LARGE_MESSAGE = "Fotoğraf 5 MB'dan küçük olmalıdır";

/** A member's photo as the API receives it; contents are checked when stored */
export const photoFileSchema = z
  .instanceof(File)
  .refine((f) => f.size > 0, "Dosya boş olamaz")
  .refine((f) => f.size <= MAX_PHOTO_SIZE, PHOTO_TOO_LARGE_MESSAGE);

/** Room for the member form's files (photo, logo with its PDF/SVG, two documents) */
export const MAX_MEMBER_REQUEST_SIZE = MAX_REQUEST_SIZE + MAX_PHOTO_SIZE;

/** Multipart carries lists and the company choice as JSON text */
export function jsonTextSchema<T extends z.ZodType>(
  schema: T,
  message: string,
) {
  return z
    .string()
    .transform((text, ctx) => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

const INVALID_ORGANIZATIONS_MESSAGE = "Geçersiz organizasyon listesi";

/**
 * The member's Organizasyon group rows. `rowId` names a row the member
 * already has (it keeps its place in the group); a row without one is new
 * and goes to the end of its group.
 */
export const organizationRowsTextSchema = jsonTextSchema(
  z.array(
    z.object({
      organization: z.enum(ORGANIZATIONS),
      rowId: z.number().int().positive().nullable(),
      groupId: z.number().int().positive(),
      roleId: z.number().int().positive(),
    }),
    { error: INVALID_ORGANIZATIONS_MESSAGE },
  ),
  INVALID_ORGANIZATIONS_MESSAGE,
);

export type OrganizationRowInput = z.output<
  typeof organizationRowsTextSchema
>[number];

const firstNameSchema = z.string().trim().min(1, "Adı boş olamaz");
const lastNameSchema = z.string().trim().min(1, "Soyadı boş olamaz");

/**
 * API schema; the member form is sent as multipart form data. `company` is
 * the Firma section's choice as JSON text (left out: no company); the logo
 * and Faaliyet Belgesi belong to that company.
 */
export const createMemberSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  companyRole: optionalTextSchema,

  memberLoginDate: optionalIsoDateSchema,

  /** Defaults to aktif when left out; candidates come from the public application */
  status: z.enum(["active", "passive"]).optional(),

  email: optionalEmailSchema,
  mobilePhone: optionalMobilePhoneSchema,
  birthDate: optionalIsoDateSchema,
  notes: optionalTextSchema,
  poPositiveCardNo: optionalTextSchema,
  photo: photoFileSchema.optional(),

  birthPlace: optionalTextSchema,
  nationalId: nationalIdInputSchema,
  education: optionalTextSchema,
  otherAssociations: optionalTextSchema,
  gender: optionalGenderSchema,
  referenceName: optionalTextSchema,
  identityDocument: documentFileSchema.optional(),

  company: memberCompanyInputSchema.optional(),

  /** The Organizasyon group rows this member is in */
  organizations: organizationRowsTextSchema.optional(),

  logo: logoFileSchema.optional(),
  /** Only together with `logo`, which is drawn from it */
  logoOriginal: logoOriginalFileSchema.optional(),
  activityDocument: documentFileSchema.optional(),
});

/**
 * Fields left out are kept: no `company` leaves the member's company as it
 * is, no `organizations` leaves their group rows
 */
export const updateMemberSchema = createMemberSchema.partial().extend({
  /** Clears the current photo when no new one is uploaded */
  removePhoto: z.stringbool().optional(),
  /** Clears the company's logo when no new one is uploaded */
  removeLogo: z.stringbool().optional(),
});

/** Client-side form values (dates as gg.aa.yyyy); sent to the API as multipart form data */
export const memberFormSchema = z.object({
  title: titleSchema,
  memberLoginDate: optionalDisplayDateSchema,
  /** Left out for candidates and rejected members, whose status the form can't change */
  status: z.enum(["active", "passive"]).optional(),
  address: z.string(),
  phone: z.string(),
  sectorId: z.number().nullable(),
  foundingDate: optionalDisplayDateSchema,
  logo: logoFormFileSchema.nullable(),
  removeLogo: z.boolean(),

  // Applicant fields. Text is sent as typed, so blank clears the stored value;
  // a blank TC number and no document keep what is stored
  applicantFirstName: z.string(),
  applicantLastName: z.string(),
  applicantRole: z.string(),
  employeeCount: z.string(),
  website: z.string(),
  email: z.string(),
  mobilePhone: z.string(),
  birthDate: optionalDisplayDateSchema,
  birthPlace: z.string(),
  nationalId: z.string(),
  education: z.string(),
  otherAssociations: z.string(),
  companyIntro: z.string(),
  gender: z.enum(["", "male", "female"]),
  referenceName: z.string(),
  identityDocument: documentFileSchema.nullable(),
  activityDocument: documentFileSchema.nullable(),
});

export type MemberFormValues = z.infer<typeof memberFormSchema>;

/** Logo Değiştir dialog on the member page; a new file is required */
export const memberLogoFormSchema = z.object({
  logo: logoFormFileSchema
    .nullable()
    .refine((logo) => logo !== null, "Yeni bir logo seçin"),
});
