import { NOTICE_PLACEHOLDERS } from "@/lib/sms/templates";
import type { NoticeGroup } from "./template-forms";

/** The received, accepted and rejected application notices */
export const APPLICATION_NOTICES: NoticeGroup = {
  placeholders: NOTICE_PLACEHOLDERS,
  sample: { ad: "Ayşe Yılmaz", firma: "Kapadokya Gıda A.Ş." },
  sms: [
    { label: "Başvuru alındı", name: "receivedSms" },
    { label: "Başvuru kabul edildi", name: "acceptedSms" },
    { label: "Başvuru reddedildi", name: "rejectedSms" },
  ],
  email: [
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
  ],
};
