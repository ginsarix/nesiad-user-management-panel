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
