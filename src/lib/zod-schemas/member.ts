import { z } from "zod";
import { isValidNationalId } from "../national-id";
import { checkPhone } from "../sms/recipients";
import {
  optionalDisplayDateSchema,
  optionalIsoDateSchema,
  optionalTextSchema,
} from "./shared";

export const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MiB

/** Room for a logo (with its PDF) and two documents plus the text fields */
export const MAX_REQUEST_SIZE = 4 * MAX_LOGO_SIZE + 1024 * 1024;

export const documentFileSchema = z
  .instanceof(File)
  .refine((f) => f.size > 0, "Dosya boş olamaz")
  .refine((f) => f.size <= MAX_LOGO_SIZE, "Dosyalar 5 MB'dan küçük olmalıdır")
  .refine(
    (f) => /\.(pdf|png|jpe?g)$/i.test(f.name),
    "Sadece PDF, PNG veya JPG dosyaları kabul edilir",
  );

/**
 * A web address as an http(s) URL, adding https:// when no scheme is typed.
 * Null for anything else (javascript:, mailto:, garbage), so a stored value
 * is always safe to use as a link.
 */
export function normalizeWebsite(value: string): string | null {
  const text = value.trim();
  if (!text) return null;

  // "ornek.com:8080" has a port, not a scheme
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text);
  const withScheme = hasScheme ? text : `https://${text}`;

  try {
    const { protocol } = new URL(withScheme);
    return protocol === "http:" || protocol === "https:" ? withScheme : null;
  } catch {
    return null;
  }
}

/** The logo image the API stores; a PDF logo arrives already drawn as PNG */
export const logoFileSchema = z
  .instanceof(File)
  .refine((f) => f.size <= MAX_LOGO_SIZE, "Logo 5 MB'dan küçük olmalıdır")
  .refine(
    (f) => f.type.startsWith("image/"),
    "Sadece resim dosyaları kabul edilir",
  );

/** The original of a PDF logo, sent with the PNG drawn from it */
export const logoPdfFileSchema = z
  .instanceof(File)
  .refine((f) => f.size > 0, "Dosya boş olamaz")
  .refine((f) => f.size <= MAX_LOGO_SIZE, "Logo 5 MB'dan küçük olmalıdır");

/** A logo as picked in a panel form: an image, or a PDF drawn before upload */
export const logoFormFileSchema = z
  .instanceof(File)
  .refine((f) => f.size <= MAX_LOGO_SIZE, "Logo 5 MB'dan küçük olmalıdır")
  .refine(
    (f) =>
      f.type.startsWith("image/") ||
      f.type === "application/pdf" ||
      /\.pdf$/i.test(f.name),
    "Sadece resim veya PDF dosyaları kabul edilir",
  );

const titleSchema = z.string().trim().min(1, "Ünvan boş olamaz");

/** A sector id sent as form text; blank clears the sector */
const optionalSectorIdSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
      ctx.addIssue({ code: "custom", message: "Geçersiz sektör" });
      return z.NEVER;
    }
    return id;
  })
  .optional();

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

const optionalWebsiteSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    const website = normalizeWebsite(value);
    if (!website) {
      ctx.addIssue({ code: "custom", message: "Geçerli bir web adresi girin" });
      return z.NEVER;
    }
    return website;
  })
  .optional();

/** Largest Postgres integer */
const MAX_EMPLOYEE_COUNT = 2_147_483_647;

const optionalEmployeeCountSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    // digits only (no 1e3, 0x10, -1) and within Postgres integer
    const count = /^\d+$/.test(value) ? Number(value) : Number.NaN;
    if (!(count <= MAX_EMPLOYEE_COUNT)) {
      ctx.addIssue({
        code: "custom",
        message: "Çalışan sayısı sıfır veya daha büyük bir tam sayı olmalıdır",
      });
      return z.NEVER;
    }
    return count;
  })
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

export const createMemberSchema = z.object({
  title: titleSchema,

  memberLoginDate: optionalIsoDateSchema,

  /** Defaults to aktif when left out; candidates come from the public application */
  status: z.enum(["active", "passive"]).optional(),

  logo: logoFileSchema.optional(),
  /** Only together with `logo`, which is drawn from it */
  logoPdf: logoPdfFileSchema.optional(),

  address: optionalTextSchema,
  phone: optionalTextSchema,
  sectorId: optionalSectorIdSchema,
  foundingDate: optionalIsoDateSchema,

  applicantFirstName: optionalTextSchema,
  applicantLastName: optionalTextSchema,
  applicantRole: optionalTextSchema,
  employeeCount: optionalEmployeeCountSchema,
  website: optionalWebsiteSchema,
  email: optionalEmailSchema,
  mobilePhone: optionalMobilePhoneSchema,
  birthDate: optionalIsoDateSchema,
  birthPlace: optionalTextSchema,
  nationalId: nationalIdInputSchema,
  education: optionalTextSchema,
  otherAssociations: optionalTextSchema,
  companyIntro: optionalTextSchema,
  gender: optionalGenderSchema,
  referenceName: optionalTextSchema,
  identityDocument: documentFileSchema.optional(),
  activityDocument: documentFileSchema.optional(),
});

export const updateMemberSchema = createMemberSchema.partial().extend({
  /** Clears the current logo when no new one is uploaded */
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
