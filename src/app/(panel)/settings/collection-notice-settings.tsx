import { COLLECTION_NOTICE_PLACEHOLDERS } from "@/lib/sms/templates";
import type { NoticeGroup } from "./template-forms";

/** The notices sent when a tahsilat is recorded */
export const COLLECTION_NOTICES: NoticeGroup = {
  placeholders: COLLECTION_NOTICE_PLACEHOLDERS,
  sample: {
    uye: "Ayşe Yılmaz",
    tutar: "1.250,00 TL",
    tarih: "10.11.2026",
    tur: "Aidat",
    kasa: "Merkez Kasa",
    proje: "Kreş Projesi (PR-7)",
  },
  sms: [
    { label: "Üyeye", name: "representativeSms" },
    { label: "Panel kullanıcılarına", name: "staffSms" },
  ],
  email: [
    {
      label: "Üyeye",
      subject: "representativeEmailSubject",
      body: "representativeEmailBody",
    },
    {
      label: "Panel kullanıcılarına",
      subject: "staffEmailSubject",
      body: "staffEmailBody",
    },
  ],
};
