import { z } from "zod";
import { normalizeWebsite } from "./member";
import {
  optionalDisplayDateSchema,
  optionalIsoDateSchema,
  optionalTextSchema,
} from "./shared";

const titleSchema = z.string().trim().min(1, "Ünvan boş olamaz");

/** A sector id sent as text; blank clears the sector */
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

/** API: the company's text fields as sent (strings), typed; absent = unchanged */
export const companyFieldsSchema = z.object({
  title: titleSchema,
  address: optionalTextSchema,
  phone: optionalTextSchema,
  website: optionalWebsiteSchema,
  companyIntro: optionalTextSchema,
  sectorId: optionalSectorIdSchema,
  foundingDate: optionalIsoDateSchema,
  employeeCount: optionalEmployeeCountSchema,
});

/** The fields as the API stores them */
export type CompanyFields = Partial<z.output<typeof companyFieldsSchema>>;

/** Form twin: dates as gg.aa.yyyy, text as typed */
export const companyFormSchema = z.object({
  title: titleSchema,
  address: z.string(),
  phone: z.string(),
  website: z.string(),
  companyIntro: z.string(),
  sectorId: z.number().nullable(),
  foundingDate: optionalDisplayDateSchema,
  employeeCount: z.string(),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

/** What a member form says about the member's company, sent as JSON text */
export const memberCompanyInputSchema = z
  .string()
  .transform((text, ctx) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Geçersiz firma bilgisi" });
      return z.NEVER;
    }
  })
  .pipe(
    z.discriminatedUnion(
      "mode",
      [
        z.object({ mode: z.literal("none") }),
        z.object({
          mode: z.literal("existing"),
          id: z.number().int().positive("Geçersiz firma"),
          fields: companyFieldsSchema,
        }),
        z.object({ mode: z.literal("new"), fields: companyFieldsSchema }),
      ],
      { error: "Geçersiz firma bilgisi" },
    ),
  );

export type MemberCompanyInput =
  | { mode: "none" }
  | { mode: "existing"; id: number; fields: CompanyFields }
  | { mode: "new"; fields: CompanyFields };
