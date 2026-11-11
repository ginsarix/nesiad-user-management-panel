/**
 * The characters an SMS can carry. NetGSM sends with encoding "TR": the GSM
 * 03.38 default alphabet plus the Turkish single shift table (3GPP TS 23.038).
 * Anything else, like "₺", "â" or "…", reaches the phone as "?".
 * Client-safe.
 */

/** GSM 03.38 default alphabet (the escape code left out) */
const DEFAULT_ALPHABET =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** Turkish single shift table (form feed left out) */
const TURKISH_SHIFT = "^{}\\[~]|ĞİŞç€ğış";

const SMS_CHARACTERS = new Set(DEFAULT_ALPHABET + TURKISH_SHIFT);

/** The characters of `text` an SMS can't carry, each once, in order */
export function unsupportedSmsCharacters(text: string): string[] {
  const found = new Set<string>();
  for (const char of text) {
    if (!SMS_CHARACTERS.has(char)) found.add(char);
  }
  return [...found];
}

/** How the error shows a character: visible ones quoted, others by name */
function describe(char: string) {
  if (char === "\t") return "sekme";
  if (/[\s\p{C}]/u.test(char)) {
    const code = char.codePointAt(0)?.toString(16).toUpperCase() ?? "";
    return `görünmeyen karakter (U+${code.padStart(4, "0")})`;
  }
  return `"${char}"`;
}

/** The error for text with unsupported characters, or null when there are none */
export function unsupportedSmsCharactersError(text: string): string | null {
  const unsupported = unsupportedSmsCharacters(text);
  if (unsupported.length === 0) return null;
  return `SMS'te kullanılamayan karakter: ${unsupported.map(describe).join(", ")}. Telefona "?" olarak gider.`;
}
