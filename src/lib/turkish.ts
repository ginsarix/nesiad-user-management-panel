const collator = new Intl.Collator("tr");

/** Turkish alphabetical comparator (Ç after C, Ş after S, etc.) */
export const compareTr = collator.compare;

/**
 * Normalizes text for search: Turkish-aware lowercasing, then strips
 * diacritics so "simsek" matches "Şimşek" and "isik" matches "IŞIK".
 */
export function foldTr(text: string) {
  return (
    text
      .toLocaleLowerCase("tr")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      // dotless ı has no decomposition, so NFD leaves it alone
      .replace(/ı/g, "i")
  );
}

/** Up to two initials from the words that start with a letter */
export function initialsTr(text: string) {
  return text
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0].toLocaleUpperCase("tr"))
    .join("");
}
