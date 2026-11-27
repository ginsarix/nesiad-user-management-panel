import { z } from "zod";
import { isValidNationalId } from "../national-id";
import { ORGANIZATIONS } from "../organizations";
import { checkPhone } from "../sms/recipients";
import { companyFormSchema, memberCompanyInputSchema } from "./company";
import {
  emailTextSchema,
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

/** The Firma section's fields as typed; the chosen mode decides which are checked */
const companyFormFieldsSchema = z.object({
  title: z.string(),
  address: z.string(),
  phone: z.string(),
  website: z.string(),
  companyIntro: z.string(),
  sectorId: z.number().nullable(),
  foundingDate: z.string(),
  employeeCount: z.string(),
});

export type CompanyFormFields = z.infer<typeof companyFormFieldsSchema>;

export const EMPTY_COMPANY_FIELDS: CompanyFormFields = {
  title: "",
  address: "",
  phone: "",
  website: "",
  companyIntro: "",
  sectorId: null,
  foundingDate: "",
  employeeCount: "",
};

export type CompanyMode = "none" | "existing" | "new";

/**
 * The Firma section: no company, an existing one (its fields editable in
 * place, which changes it for every member on it) or a new one. Each mode
 * keeps its own fields, so switching back and forth loses nothing. The logo
 * and Faaliyet Belgesi go to whichever company the member ends up on.
 */
const memberCompanyFormSchema = z
  .object({
    mode: z.enum(["none", "existing", "new"]),
    /** The picked company while the mode is existing; null until one is */
    id: z.number().nullable(),
    existing: companyFormFieldsSchema,
    new: companyFormFieldsSchema,
    logo: logoFormFileSchema.nullable(),
    removeLogo: z.boolean(),
    activityDocument: documentFileSchema.nullable(),
  })
  .superRefine((company, ctx) => {
    if (company.mode === "none") return;
    if (company.mode === "existing" && company.id === null) {
      ctx.addIssue({ code: "custom", message: "Firma seçin", path: ["id"] });
    }
    const key = company.mode;
    for (const issue of companyFormSchema.safeParse(company[key]).error
      ?.issues ?? []) {
      ctx.addIssue({
        code: "custom",
        message: issue.message,
        path: [key, ...issue.path],
      });
    }
  })
  .transform((company) => {
    const files = {
      logo: company.logo,
      removeLogo: company.removeLogo,
      activityDocument: company.activityDocument,
    };
    if (company.mode === "existing" && company.id !== null) {
      return {
        mode: "existing" as const,
        id: company.id,
        fields: company.existing,
        ...files,
      };
    }
    if (company.mode === "new") {
      return { mode: "new" as const, fields: company.new, ...files };
    }
    return { mode: "none" as const };
  });

const organizationFormRowSchema = z.object({
  // the saved row this one edits; null for a row added in the form
  rowId: z.number().nullable(),
  // null while a newly added row has nothing picked yet
  organization: z
    .enum(ORGANIZATIONS)
    .nullable()
    .refine((organization) => organization !== null, "Organizasyon seçin"),
  groupId: z
    .number()
    .nullable()
    .refine((id) => id !== null, "Grup seçin"),
  roleId: z
    .number()
    .nullable()
    .refine((id) => id !== null, "Görev seçin"),
});

/**
 * Client-side form values (dates as gg.aa.yyyy); sent to the API as
 * multipart form data. Text is sent as typed, so blank clears the stored
 * value; a blank TC number and no document keep what is stored.
 */
export const memberFormSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  memberLoginDate: optionalDisplayDateSchema,
  /** Left out for candidates and rejected members, whose status the form can't change */
  status: z.enum(["active", "passive"]).optional(),
  email: emailTextSchema,
  mobilePhone: z
    .string()
    .trim()
    .refine(
      (value) => !value || checkPhone(value).ok,
      "Geçerli bir cep telefonu girin",
    ),
  birthDate: optionalDisplayDateSchema,
  notes: z.string(),
  poPositiveCardNo: z.string(),
  /** Already shrunk to the JPEG that is uploaded, when it was picked */
  photo: z
    .instanceof(File)
    .refine((f) => f.size <= MAX_PHOTO_SIZE, PHOTO_TOO_LARGE_MESSAGE)
    .nullable(),
  removePhoto: z.boolean(),

  birthPlace: z.string(),
  nationalId: z
    .string()
    .trim()
    .refine(
      (value) => !value || isValidNationalId(value),
      "Geçerli bir TC Kimlik No girin",
    ),
  education: z.string(),
  otherAssociations: z.string(),
  gender: z.enum(["", "male", "female"]),
  referenceName: z.string(),
  identityDocument: documentFileSchema.nullable(),

  /** Görev at the company; cleared when the member has none */
  companyRole: z.string(),
  company: memberCompanyFormSchema,
  organizations: z.array(organizationFormRowSchema),
});

/** What the form holds; pickers may still be null */
export type MemberFormInput = z.input<typeof memberFormSchema>;
/** What a valid form submits: the company as the chosen mode, every row picked */
export type MemberFormValues = z.output<typeof memberFormSchema>;

/** Logo Değiştir dialog on the member page; a new file is required */
export const memberLogoFormSchema = z.object({
  logo: logoFormFileSchema
    .nullable()
    .refine((logo) => logo !== null, "Yeni bir logo seçin"),
});
