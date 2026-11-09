import { z } from "zod";
import { NOTICE_PLACEHOLDERS } from "../sms/templates";
import { TEMPLATE_MAX_LENGTH, templateText } from "./sms";

const ALLOWED = "{ad}, {firma}";
const sms = () =>
  templateText(
    { name: "Mesaj", max: TEMPLATE_MAX_LENGTH },
    NOTICE_PLACEHOLDERS,
    ALLOWED,
  );
const subject = () =>
  templateText({ name: "Konu", max: 200 }, NOTICE_PLACEHOLDERS, ALLOWED);
const body = () =>
  templateText({ name: "Metin", max: 5000 }, NOTICE_PLACEHOLDERS, ALLOWED);

/** PUT /api/sms/notice-settings and the Ayarlar form (same shape) */
export const noticeSettingsSchema = z.object({
  receivedSms: sms(),
  receivedEmailSubject: subject(),
  receivedEmailBody: body(),
  acceptedSms: sms(),
  rejectedSms: sms(),
  acceptedEmailSubject: subject(),
  acceptedEmailBody: body(),
  rejectedEmailSubject: subject(),
  rejectedEmailBody: body(),
});
export type NoticeSettingsValues = z.infer<typeof noticeSettingsSchema>;
