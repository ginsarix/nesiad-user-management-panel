import { z } from "zod";
import { COLLECTION_NOTICE_PLACEHOLDERS } from "../sms/templates";
import { TEMPLATE_MAX_LENGTH, templateText } from "./sms";

const ALLOWED = "{yetkili}, {tutar}, {tarih}, {tur}, {tip}, {proje}";
const sms = () =>
  templateText(
    { name: "Mesaj", max: TEMPLATE_MAX_LENGTH, sms: true },
    COLLECTION_NOTICE_PLACEHOLDERS,
    ALLOWED,
  );
const subject = () =>
  templateText(
    { name: "Konu", max: 200 },
    COLLECTION_NOTICE_PLACEHOLDERS,
    ALLOWED,
  );
const body = () =>
  templateText(
    { name: "Metin", max: 5000 },
    COLLECTION_NOTICE_PLACEHOLDERS,
    ALLOWED,
  );

/** PUT /api/sms/collection-notice-settings and the Ayarlar form (same shape) */
export const collectionNoticeSettingsSchema = z.object({
  representativeSms: sms(),
  representativeEmailSubject: subject(),
  representativeEmailBody: body(),
  staffSms: sms(),
  staffEmailSubject: subject(),
  staffEmailBody: body(),
});
export type CollectionNoticeSettingsValues = z.infer<
  typeof collectionNoticeSettingsSchema
>;
