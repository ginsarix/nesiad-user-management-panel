import { z } from "zod";
import { parseIsoDate } from "../dates";
import { unknownPlaceholders } from "../sms/templates";

/** NetGSM's limit for a message with Turkish characters (encoding "TR") */
export const SMS_MAX_LENGTH = 883;

export const smsMessageSchema = z
  .string()
  .trim()
  .min(1, "Mesaj yazın")
  .max(SMS_MAX_LENGTH, `Mesaj en fazla ${SMS_MAX_LENGTH} karakter olabilir`);

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

const templateSchema = z
  .string()
  .trim()
  .min(1, "Mesaj yazın")
  .max(
    TEMPLATE_MAX_LENGTH,
    `Mesaj en fazla ${TEMPLATE_MAX_LENGTH} karakter olabilir`,
  )
  .superRefine((value, ctx) => {
    const unknown = unknownPlaceholders(value);
    if (unknown.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `Tanınmayan alan: ${unknown.join(", ")}. Kullanılabilenler: {ad}, {yil}`,
      });
    }
  });

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
