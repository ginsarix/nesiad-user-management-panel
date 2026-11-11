import {
  getCollectionNoticeTemplates,
  updateCollectionNoticeTemplates,
} from "@/lib/fetches/sms";
import { COLLECTION_NOTICE_PLACEHOLDERS } from "@/lib/sms/templates";
import { collectionNoticeSettingsSchema } from "@/lib/zod-schemas/collection-notices";
import { TemplateChannelForm } from "./template-forms";

const SAMPLE = {
  uye: "Kapadokya Gıda A.Ş.",
  tutar: "₺1.250,00",
  tarih: "10.11.2026",
  tur: "Aidat",
  tip: "Kart",
  proje: "Kreş Projesi (PR-7)",
};

const SMS_SCHEMA = collectionNoticeSettingsSchema.pick({
  memberSms: true,
  staffSms: true,
});
const EMAIL_SCHEMA = collectionNoticeSettingsSchema.omit({
  memberSms: true,
  staffSms: true,
});

/** The templates sent when a tahsilat is recorded */
export function CollectionNoticeSettings({
  channel,
  onDirtyChange,
}: {
  channel: "sms" | "email";
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const shared = {
    queryKey: ["collection-notice-settings"],
    load: () => getCollectionNoticeTemplates(),
    save: (values: Record<string, string>) =>
      updateCollectionNoticeTemplates(
        collectionNoticeSettingsSchema.parse(values),
      ),
    placeholders: COLLECTION_NOTICE_PLACEHOLDERS,
    sample: SAMPLE,
    loadError: "Tahsilat bildirim şablonları yüklenemedi.",
    onDirtyChange,
  };

  return channel === "sms" ? (
    <TemplateChannelForm
      {...shared}
      channel="sms"
      schema={SMS_SCHEMA}
      templates={[
        { label: "Üyeye", name: "memberSms" },
        { label: "Panel kullanıcılarına", name: "staffSms" },
      ]}
    />
  ) : (
    <TemplateChannelForm
      {...shared}
      channel="email"
      schema={EMAIL_SCHEMA}
      templates={[
        {
          label: "Üyeye",
          subject: "memberEmailSubject",
          body: "memberEmailBody",
        },
        {
          label: "Panel kullanıcılarına",
          subject: "staffEmailSubject",
          body: "staffEmailBody",
        },
      ]}
    />
  );
}
