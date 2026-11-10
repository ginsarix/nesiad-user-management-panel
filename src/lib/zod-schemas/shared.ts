import { z } from "zod";
import { isFutureDate, parseDisplayDate, parseIsoDate } from "../dates";

export const safeNumSchema = <T extends z.ZodType = z.ZodNumber>(
  someType: T = z.number() as unknown as T,
) =>
  z.preprocess((val) => {
    if (typeof val === "number") return val;
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "string") {
      const trimmed = val.trim();
      return trimmed === "" ? undefined : Number(trimmed);
    }
    return undefined;
  }, someType);

/** Free-text field; a blank value is stored as null */
export const optionalTextSchema = z
  .string()
  .trim()
  .transform((value) => value || null)
  .optional();

/** An email address or blank */
export const emailTextSchema = z
  .string()
  .trim()
  .refine(
    (value) => !value || z.email().safeParse(value).success,
    "Geçerli bir e-posta adresi girin",
  );

export const INVALID_DATE_MESSAGE = "Geçerli bir tarih girin (gg.aa.yyyy)";
export const FUTURE_DATE_MESSAGE = "Tarih gelecekte olamaz";

/** A past-or-today date in the given format, or blank */
function optionalPastDate(parseDate: (text: string) => Date | null) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (!value) return;
      const date = parseDate(value);
      if (!date)
        ctx.addIssue({ code: "custom", message: INVALID_DATE_MESSAGE });
      else if (isFutureDate(date)) {
        ctx.addIssue({ code: "custom", message: FUTURE_DATE_MESSAGE });
      }
    });
}

/** API: yyyy-aa-gg, blank stored as null */
export const optionalIsoDateSchema = optionalPastDate(parseIsoDate)
  .transform((value) => value || null)
  .optional();

/** Forms: gg.aa.yyyy as typed, blank allowed */
export const optionalDisplayDateSchema = optionalPastDate(parseDisplayDate);

export const REQUIRED_DATE_MESSAGE = "Tarih boş olamaz";

/** API: a required past-or-today yyyy-aa-gg date */
export const requiredIsoDateSchema = z
  .string()
  .trim()
  .min(1, REQUIRED_DATE_MESSAGE)
  .pipe(optionalPastDate(parseIsoDate));

/** Forms: a required past-or-today gg.aa.yyyy date, as typed */
export const requiredDisplayDateSchema = z
  .string()
  .trim()
  .min(1, REQUIRED_DATE_MESSAGE)
  .pipe(optionalPastDate(parseDisplayDate));
