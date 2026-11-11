import { getNoticeSettings, updateNoticeSettings } from "@/lib/fetches/sms";
import { NOTICE_PLACEHOLDERS } from "@/lib/sms/templates";
import { noticeSettingsSchema } from "@/lib/zod-schemas/application-notices";
import { TemplateChannelForm } from "./template-forms";

const SAMPLE = { ad: "Ayşe Yılmaz", firma: "Kapadokya Gıda A.Ş." };

const SMS_SCHEMA = noticeSettingsSchema.pick({
  receivedSms: true,
  acceptedSms: true,
  rejectedSms: true,
});
const EMAIL_SCHEMA = noticeSettingsSchema.omit({
  receivedSms: true,
  acceptedSms: true,
  rejectedSms: true,
});

/** The templates of the received, accepted and rejected application notices */
export function NoticeSettings({
  channel,
  onDirtyChange,
}: {
  channel: "sms" | "email";
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const shared = {
    queryKey: ["notice-settings"],
    load: () => getNoticeSettings(),
    save: (values: Record<string, string>) =>
      updateNoticeSettings(noticeSettingsSchema.parse(values)),
    placeholders: NOTICE_PLACEHOLDERS,
    sample: SAMPLE,
    loadError: "Başvuru bildirim şablonları yüklenemedi.",
    onDirtyChange,
  };

  return channel === "sms" ? (
    <TemplateChannelForm
      {...shared}
      channel="sms"
      schema={SMS_SCHEMA}
      templates={[
        { label: "Başvuru alındı", name: "receivedSms" },
        { label: "Başvuru kabul edildi", name: "acceptedSms" },
        { label: "Başvuru reddedildi", name: "rejectedSms" },
      ]}
    />
  ) : (
    <TemplateChannelForm
      {...shared}
      channel="email"
      schema={EMAIL_SCHEMA}
      templates={[
        {
          label: "Başvuru alındı",
          subject: "receivedEmailSubject",
          body: "receivedEmailBody",
        },
        {
          label: "Başvuru kabul edildi",
          subject: "acceptedEmailSubject",
          body: "acceptedEmailBody",
        },
        {
          label: "Başvuru reddedildi",
          subject: "rejectedEmailSubject",
          body: "rejectedEmailBody",
        },
      ]}
    />
  );
}
