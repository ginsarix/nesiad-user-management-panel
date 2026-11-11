import { z } from "zod";
import { parseIsoDate } from "../dates";
import { unsupportedSmsCharactersError } from "../sms/gsm";
import { TEMPLATE_PLACEHOLDERS, unknownPlaceholders } from "../sms/templates";

/** NetGSM's limit for a message with Turkish characters (encoding "TR") */
export const SMS_MAX_LENGTH = 883;

export const smsMessageSchema = z
  .string()
  .trim()
  .min(1, "Mesaj yazın")
  .max(SMS_MAX_LENGTH, `Mesaj en fazla ${SMS_MAX_LENGTH} karakter olabilir`)
  .superRefine(refuseUnsupportedSmsCharacters);

/** Refuses characters NetGSM would deliver as "?" */
function refuseUnsupportedSmsCharacters(value: string, ctx: z.RefinementCtx) {
  const message = unsupportedSmsCharactersError(value);
  if (message) ctx.addIssue({ code: "custom", message });
}

const idsSchema = z.array(z.number().int().positive());

/** POST /api/sms/send */
export const smsSendSchema = z
  .object({
    message: smsMessageSchema,
    memberIds: idsSchema,
    representativeIds: idsSchema,
  })
  .refine((v) => v.memberIds.length + v.representativeIds.length > 0, {
    message: "En az bir alıcı seçin",
  });

export type SmsSendValues = z.infer<typeof smsSendSchema>;

/** GET /api/sms/celebrations */
export const celebrationsQuerySchema = z.object({
  date: z
    .string()
    .refine((v) => parseIsoDate(v) !== null, "Geçerli bir tarih girin"),
});

/** The Manuel tab's form; recipients are picked outside the form */
export const smsFormSchema = z.object({ message: smsMessageSchema });
export type SmsFormValues = z.input<typeof smsFormSchema>;

/** Room left for {ad} and {yil} within SMS_MAX_LENGTH */
export const TEMPLATE_MAX_LENGTH = 700;

/**
 * Text that may contain placeholders; refuses any not in `known`.
 * `allowed` is how the error lists them, e.g. "{ad}, {yil}". An `sms`
 * template also refuses characters an SMS can't carry.
 */
export function templateText(
  { name, max, sms = false }: { name: string; max: number; sms?: boolean },
  known: Record<string, unknown>,
  allowed: string,
) {
  return z
    .string()
    .trim()
    .min(1, `${name} yazın`)
    .max(max, `${name} en fazla ${max} karakter olabilir`)
    .superRefine((value, ctx) => {
      const unknown = unknownPlaceholders(value, known);
      if (unknown.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: `Tanınmayan alan: ${unknown.join(", ")}. Kullanılabilenler: ${allowed}`,
        });
      }
      if (sms) refuseUnsupportedSmsCharacters(value, ctx);
    });
}

const templateSchema = templateText(
  { name: "Mesaj", max: TEMPLATE_MAX_LENGTH, sms: true },
  TEMPLATE_PLACEHOLDERS,
  "{ad}, {yil}",
);

/** PUT /api/sms/settings and the Ayarlar form (same shape) */
export const smsSettingsSchema = z.object({
  autoEnabled: z.boolean(),
  sendTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saati ss:dd olarak girin"),
  foundingMessage: templateSchema,
  birthdayMessage: templateSchema,
});
export type SmsSettingsValues = z.infer<typeof smsSettingsSchema>;
