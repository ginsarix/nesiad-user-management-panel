import type { Celebration, CelebrationKind } from "./celebrations";

/** What a celebration message can contain, e.g. "{ad}" */
export const TEMPLATE_PLACEHOLDERS = {
  ad: "üyenin unvanı ya da yetkilinin adı",
  yil: "kaçıncı yıl dönümü / yaş günü (sayı)",
} as const;

export type TemplateValues = Record<keyof typeof TEMPLATE_PLACEHOLDERS, string>;

export const DEFAULT_MESSAGES: Record<CelebrationKind, string> = {
  founding:
    "Sayın {ad}, kuruluşunuzun {yil}. yıl dönümünü kutlar, nice başarılı yıllar dileriz. NESİAD",
  birthday:
    "Sayın {ad}, doğum gününüzü kutlar, sağlıklı ve mutlu nice yıllar dileriz. NESİAD",
};

const PLACEHOLDER = /\{([^{}]*)\}/g;

/** "{ad}" → the name, "{yil}" → the year; anything else is left as typed */
export function fillTemplate(template: string, values: TemplateValues) {
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in values ? values[name as keyof TemplateValues] : match,
  );
}

/** Placeholders in `template` that fillTemplate doesn't know, e.g. ["{isim}"] */
export function unknownPlaceholders(template: string) {
  return [...template.matchAll(PLACEHOLDER)]
    .filter(([, name]) => !(name in TEMPLATE_PLACEHOLDERS))
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
