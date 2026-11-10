// Imported by the public application form in the browser: nothing here may
// pull in the database, file storage or server-only environment variables.
import { z } from "zod";
import { isFutureDate, parseDisplayDate, parseIsoDate } from "../dates";
import { isValidNationalId } from "../national-id";
import { checkPhone } from "../sms/recipients";
import {
  documentFileSchema,
  logoOriginalFileSchema,
  MAX_LOGO_SIZE,
  normalizeWebsite,
} from "./member";
import { FUTURE_DATE_MESSAGE, INVALID_DATE_MESSAGE } from "./shared";

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

// control and format characters (NUL, bidi overrides, zero-width marks…)
const CONTROL_IN_LINE = /[\p{Cc}\p{Cf}]/u;

const controlMessage = (label: string) => `${label} geçersiz karakter içeriyor`;

// Names go into messages sent from NESİAD's own sender, so a link typed here
// would be delivered with its authority. Bare ".org" and ".tr" stay allowed:
// Turkish company names abbreviate ("Tur.Org.San.Ltd.Şti.").
const LINK_LIKE =
  /[a-z][a-z0-9+.-]*:\/\/|www\.|[^\s.]\.(?:com|net|info|biz|xyz|link|site|online|io|ly|me|app|org\.tr|com\.tr|net\.tr|gen\.tr|web\.tr)(?![\p{L}\p{N}])|[^\s.]\.[a-z]{2,}\//iu;

/**
 * Tested on a normalized copy, because browsers fold fullwidth letters and
 * lookalike dots into a real address. NFKC doesn't map the ideographic full
 * stop, so that one is replaced by hand. What's stored stays as typed.
 */
function looksLikeLink(value: string) {
  return LINK_LIKE.test(value.normalize("NFKC").replace(/\u3002/g, "."));
}

/** A required one-line field: every run of whitespace becomes one space */
function singleLine(label: string, max: number, options?: { noLinks?: true }) {
  return z
    .string()
    .transform(collapseWhitespace)
    .pipe(
      z
        .string()
        .min(1, `${label} boş olamaz`)
        .max(max, `${label} en fazla ${max} karakter olabilir`)
        .refine((v) => !CONTROL_IN_LINE.test(v), controlMessage(label))
        .refine(
          (v) => !options?.noLinks || !looksLikeLink(v),
          `${label} bağlantı içeremez`,
        ),
    );
}

/** Control characters other than \n, \r and \t are refused */
function hasBadControl(value: string) {
  return /[\p{Cc}\p{Cf}]/u.test(value.replace(/[\n\r\t]/g, ""));
}

/** A required field that may span lines */
function multiLine(label: string, max: number, options?: { min?: number }) {
  let schema = z.string().trim().min(1, `${label} boş olamaz`);
  if (options?.min) {
    schema = schema.min(
      options.min,
      `${label} en az ${options.min} karakter olmalıdır`,
    );
  }
  return schema
    .max(max, `${label} en fazla ${max} karakter olabilir`)
    .refine((v) => !hasBadControl(v), controlMessage(label));
}

/** Counted after trimming, as the schema does */
export const COMPANY_INTRO_MIN_LENGTH = 1000;

const emailSchema = singleLine("E-posta", 254).pipe(
  z
    .string()
    .refine((v) => z.email().safeParse(v).success, "Geçerli bir e-posta girin"),
);

const mobilePhoneSchema = singleLine("Cep telefonu", 30).pipe(
  z.string().refine((v) => checkPhone(v).ok, "Geçerli bir cep telefonu girin"),
);

const nationalIdSchema = z
  .string()
  .trim()
  .min(1, "TC Kimlik No boş olamaz")
  .refine(isValidNationalId, "Geçerli bir TC Kimlik No girin");

const genderSchema = z
  .enum(["", "male", "female"])
  .refine((value) => value !== "", "Cinsiyet seçin");

/** The choices on the public form; stored as shown (the column is free text) */
export const EDUCATION_LEVELS = [
  "İlkokul/Ortaokul",
  "Lise",
  "Ön Lisans",
  "Lisans",
  "Yüksek Lisans - Doktora",
] as const;

const EDUCATION_MESSAGE = "Eğitim durumu seçin";
const educationSchema = z
  .enum(["", ...EDUCATION_LEVELS], EDUCATION_MESSAGE)
  .refine((value) => value !== "", EDUCATION_MESSAGE);

const websiteTextSchema = singleLine("Web sitesi", 300).pipe(
  z
    .string()
    .refine(
      (v) => normalizeWebsite(v) !== null,
      "Geçerli bir web adresi girin",
    ),
);

const EMPLOYEE_COUNT_MESSAGE =
  "Çalışan sayısı en fazla 7 haneli bir tam sayı olmalıdır";
const employeeCountTextSchema = z
  .string()
  .trim()
  .refine((v) => /^\d{1,7}$/.test(v), EMPLOYEE_COUNT_MESSAGE);

/** A required past-or-today date in the given format */
function requiredDate(parse: (text: string) => Date | null) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (!value) {
        ctx.addIssue({ code: "custom", message: "Doğum tarihi boş olamaz" });
        return;
      }
      const date = parse(value);
      if (!date) {
        ctx.addIssue({ code: "custom", message: INVALID_DATE_MESSAGE });
      } else if (isFutureDate(date)) {
        ctx.addIssue({ code: "custom", message: FUTURE_DATE_MESSAGE });
      }
    });
}

/**
 * The logo as a public applicant sends it. Unlike the staff logo schema it
 * doesn't trust the declared type (browsers may send none): the name is a
 * hint and the server checks the contents. A PDF or SVG logo arrives as the
 * PNG the applicant's browser drew from it, with the file as `logoOriginal`.
 */
const publicLogoSchema = z
  .instanceof(File, { error: "Logo seçin" })
  .refine((f) => f.size > 0, "Dosya boş olamaz")
  .refine((f) => f.size <= MAX_LOGO_SIZE, "Dosyalar 5 MB'dan küçük olmalıdır")
  .refine((f) => /\.(png|jpe?g)$/i.test(f.name), "Logo PNG veya JPG olmalıdır");

/** The logo as the applicant picks it; a PDF/SVG is drawn to PNG before sending */
const publicLogoFormSchema = z
  .instanceof(File, { error: "Logo seçin" })
  .refine((f) => f.size > 0, "Dosya boş olamaz")
  .refine((f) => f.size <= MAX_LOGO_SIZE, "Dosyalar 5 MB'dan küçük olmalıdır")
  .refine(
    (f) => /\.(png|jpe?g|pdf|svg)$/i.test(f.name),
    "Logo PNG, JPG, PDF veya SVG olmalıdır",
  );

/** Fields whose rules are the same on the form and on the server */
const sharedFields = {
  applicantFirstName: singleLine("Ad", 100, { noLinks: true }),
  applicantLastName: singleLine("Soyad", 100, { noLinks: true }),
  birthPlace: singleLine("Doğum yeri", 100),
  education: educationSchema,
  title: singleLine("Firma adı", 200, { noLinks: true }),
  applicantRole: singleLine("Görev ve ünvan", 200),
  address: multiLine("İş adresi", 1000),
  phone: singleLine("İş telefonu", 30),
  companyIntro: multiLine("Firma tanıtım yazısı", 5000, {
    min: COMPANY_INTRO_MIN_LENGTH,
  }),
  referenceName: singleLine("Referans", 200),
  otherAssociations: z
    .string()
    .trim()
    .max(2000, "Dernek, meslek grupları en fazla 2000 karakter olabilir")
    .refine(
      (v) => !hasBadControl(v),
      controlMessage("Dernek, meslek grupları"),
    ),
  email: emailSchema,
  mobilePhone: mobilePhoneSchema,
  nationalId: nationalIdSchema,
  gender: genderSchema,
};

const CONSENT_MESSAGE = "Devam etmek için onaylamanız gerekir";

/** Multipart fields as the server receives them (dates yyyy-aa-gg, consents "true") */
export const applicationApiSchema = z.object({
  applicantFirstName: sharedFields.applicantFirstName,
  applicantLastName: sharedFields.applicantLastName,
  birthDate: requiredDate(parseIsoDate),
  birthPlace: sharedFields.birthPlace,
  nationalId: sharedFields.nationalId,
  gender: sharedFields.gender.pipe(z.enum(["male", "female"])),
  education: sharedFields.education,
  mobilePhone: sharedFields.mobilePhone,
  email: sharedFields.email,

  title: sharedFields.title,
  applicantRole: sharedFields.applicantRole,
  employeeCount: employeeCountTextSchema.transform(Number),
  address: sharedFields.address,
  phone: sharedFields.phone,
  website: websiteTextSchema.transform((v) => normalizeWebsite(v) as string),
  companyIntro: sharedFields.companyIntro,

  referenceName: sharedFields.referenceName,
  otherAssociations: sharedFields.otherAssociations
    .optional()
    .transform((v) => v || null),

  logo: publicLogoSchema,
  /** Only together with `logo`, which is drawn from it */
  logoOriginal: logoOriginalFileSchema.optional(),
  identityDocument: documentFileSchema,
  activityDocument: documentFileSchema,

  consentRules: z.literal("true", CONSENT_MESSAGE),
  consentData: z.literal("true", CONSENT_MESSAGE),

  /** Hidden from people, filled in by bots (only mounted on the last step) */
  leaveBlank: z.string().optional(),
});

/** Client-side form values (date as gg.aa.yyyy, files as chosen) */
export const applicationFormSchema = z.object({
  applicantFirstName: sharedFields.applicantFirstName,
  applicantLastName: sharedFields.applicantLastName,
  birthDate: requiredDate(parseDisplayDate),
  birthPlace: sharedFields.birthPlace,
  nationalId: sharedFields.nationalId,
  gender: sharedFields.gender,
  education: sharedFields.education,
  mobilePhone: sharedFields.mobilePhone,
  email: sharedFields.email,

  title: sharedFields.title,
  applicantRole: sharedFields.applicantRole,
  employeeCount: employeeCountTextSchema,
  address: sharedFields.address,
  phone: sharedFields.phone,
  website: websiteTextSchema,
  companyIntro: sharedFields.companyIntro,

  referenceName: sharedFields.referenceName,
  otherAssociations: sharedFields.otherAssociations,

  logo: publicLogoFormSchema.nullable().refine((f) => f !== null, "Logo seçin"),
  identityDocument: documentFileSchema
    .nullable()
    .refine((f) => f !== null, "Kimlik belgesi seçin"),
  activityDocument: documentFileSchema
    .nullable()
    .refine((f) => f !== null, "Faaliyet belgesi seçin"),

  consentRules: z.boolean().refine((v) => v, CONSENT_MESSAGE),
  consentData: z.boolean().refine((v) => v, CONSENT_MESSAGE),

  /** Hidden from people, filled in by bots (only mounted on the last step); sent as typed */
  leaveBlank: z.string(),
});

export type ApplicationFormValues = z.infer<typeof applicationFormSchema>;
/** What the form holds while it is being filled in (no gender or files yet) */
export type ApplicationFormInput = z.input<typeof applicationFormSchema>;
