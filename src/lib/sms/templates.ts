import type { Celebration, CelebrationKind } from "./celebrations";

/** What a celebration message can contain, e.g. "{ad}" */
export const TEMPLATE_PLACEHOLDERS = {
  ad: "üyenin unvanı ya da yetkilinin adı",
  yil: "kaçıncı yıl dönümü / yaş günü (sayı)",
} as const;

export const DEFAULT_MESSAGES: Record<CelebrationKind, string> = {
  founding:
    "Sayın {ad}, kuruluşunuzun {yil}. yıl dönümünü kutlar, nice başarılı yıllar dileriz. NESİAD",
  birthday:
    "Sayın {ad}, doğum gününüzü kutlar, sağlıklı ve mutlu nice yıllar dileriz. NESİAD",
};

/** What an application notice can contain */
export const NOTICE_PLACEHOLDERS = {
  ad: "başvuranın adı soyadı",
  firma: "firma adı",
} as const;

/** The notice texts shipped before staff edit them (Ayarlar page, Bildirimler tab) */
export const DEFAULT_NOTICE_TEMPLATES = {
  receivedSms:
    "Sayın {ad}, {firma} adına yaptığınız NESİAD üyelik başvurunuz alınmıştır. Değerlendirme sonucu size ayrıca bildirilecektir. NESİAD",
  receivedEmailSubject: "NESİAD üyelik başvurunuz alındı",
  receivedEmailBody:
    "Sayın {ad},\n\n{firma} adına yaptığınız NESİAD üyelik başvurunuz alınmıştır. Başvurunuz değerlendirildikten sonra sonucu size ayrıca bildirilecektir.\n\nNevşehir Sanayici ve İş İnsanları Derneği",
  acceptedSms:
    "Sayın {ad}, {firma} adına yaptığınız NESİAD üyelik başvurunuz kabul edilmiştir. Aramıza hoş geldiniz. NESİAD",
  rejectedSms:
    "Sayın {ad}, {firma} adına yaptığınız NESİAD üyelik başvurunuz olumlu sonuçlanmamıştır. İlginiz için teşekkür ederiz. NESİAD",
  acceptedEmailSubject: "NESİAD üyelik başvurunuz kabul edildi",
  acceptedEmailBody:
    "Sayın {ad},\n\n{firma} adına yaptığınız NESİAD üyelik başvurunuz kabul edilmiştir. Aramıza hoş geldiniz.\n\nNevşehir Sanayici ve İş İnsanları Derneği",
  rejectedEmailSubject: "NESİAD üyelik başvurunuz hakkında",
  rejectedEmailBody:
    "Sayın {ad},\n\n{firma} adına yaptığınız NESİAD üyelik başvurunuz olumlu sonuçlanmamıştır. İlginiz için teşekkür ederiz.\n\nNevşehir Sanayici ve İş İnsanları Derneği",
} as const;

/** What a tahsilat notice can contain */
export const COLLECTION_NOTICE_PLACEHOLDERS = {
  yetkili: "yetkilinin adı soyadı",
  tutar: "tutar, ör. 1.250,00 TL",
  tarih: "tahsilat tarihi",
  tur: "tahsilat türü",
  tip: "tahsilat tipi",
  proje: "proje (yoksa -)",
} as const;

/** The tahsilat notice texts shipped before staff edit them (Ayarlar page, Bildirimler tab) */
export const DEFAULT_COLLECTION_NOTICE_TEMPLATES = {
  representativeSms:
    "Sayın {yetkili}, {tarih} tarihli {tutar} tutarındaki {tur} ödemeniz alınmıştır. Teşekkür ederiz. NESİAD",
  representativeEmailSubject: "NESİAD ödemeniz alındı",
  representativeEmailBody:
    "Sayın {yetkili},\n\n{tarih} tarihli {tutar} tutarındaki {tur} ödemeniz ({tip}) alınmıştır. Teşekkür ederiz.\n\nNevşehir Sanayici ve İş İnsanları Derneği",
  staffSms:
    "Yeni tahsilat: {yetkili}, {tutar} ({tur}, {tip}), {tarih}. Proje: {proje}",
  staffEmailSubject: "Yeni tahsilat: {yetkili}, {tutar}",
  staffEmailBody:
    "Panele yeni bir tahsilat kaydedildi.\n\nYetkili: {yetkili}\nTutar: {tutar}\nTarih: {tarih}\nTahsilat Türü: {tur}\nTahsilat Tipi: {tip}\nProje: {proje}",
} as const;

const PLACEHOLDER = /\{([^{}]*)\}/g;

/**
 * "{ad}" → the name, "{yil}" → the year; anything else is left as typed.
 * Values are inserted in one pass, so text inside a value is never expanded.
 */
export function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(PLACEHOLDER, (match, name: string) =>
    Object.hasOwn(values, name) ? values[name] : match,
  );
}

/** Placeholders in `template` that aren't in `known`, e.g. ["{isim}"] */
export function unknownPlaceholders(
  template: string,
  known: Record<string, unknown> = TEMPLATE_PLACEHOLDERS,
) {
  return [...template.matchAll(PLACEHOLDER)]
    .filter(([, name]) => !Object.hasOwn(known, name))
    .map(([match]) => match);
}

/** The SMS text for a celebration, from the Ayarlar templates */
export function celebrationMessage(
  celebration: Pick<Celebration, "kind" | "years" | "contact">,
  templates: { foundingMessage: string; birthdayMessage: string },
) {
  const template =
    celebration.kind === "founding"
      ? templates.foundingMessage
      : templates.birthdayMessage;
  return fillTemplate(template, {
    ad: celebration.contact.name,
    yil: String(celebration.years),
  });
}
