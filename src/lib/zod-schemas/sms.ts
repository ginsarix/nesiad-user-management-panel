import { z } from "zod";
import { parseIsoDate } from "../dates";

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
