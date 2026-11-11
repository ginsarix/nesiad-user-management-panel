import { COLLECTION_NOTICE_PLACEHOLDERS } from "@/lib/sms/templates";
import type { NoticeGroup } from "./template-forms";

/** The notices sent when a tahsilat is recorded */
export const COLLECTION_NOTICES: NoticeGroup = {
  placeholders: COLLECTION_NOTICE_PLACEHOLDERS,
  sample: {
    uye: "Kapadokya Gıda A.Ş.",
    tutar: "1.250,00 TL",
    tarih: "10.11.2026",
    tur: "Aidat",
    tip: "Kart",
    proje: "Kreş Projesi (PR-7)",
  },
  sms: [
    { label: "Üyeye", name: "memberSms" },
    { label: "Panel kullanıcılarına", name: "staffSms" },
  ],
  email: [
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
  ],
};
