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

/** The notice texts shipped before staff edit them (Ayarlar tab) */
export const DEFAULT_NOTICE_TEMPLATES = {
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
