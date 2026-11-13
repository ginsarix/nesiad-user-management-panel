/** "Kreş Projesi (PR-7)", how a proje is named in pickers and the audit log. Client-safe. */
export function projectLabel({
  name,
  number,
}: {
  name: string;
  number: string;
}) {
  return `${name} (${number})`;
}

/**
 * The key that makes Proje Numarası unique: case and surrounding spaces
 * don't count. Numbers are codes, often typed or pasted in ASCII, so the
 * Turkish dotted/dotless I don't count either ("PRJ-I" = "prj-i" = "prj-ı").
 */
export function projectNumberKey(number: string) {
  return number.trim().toLocaleLowerCase("tr").replaceAll("ı", "i");
}

/** The Taahhütler editor's texts */
export const PLEDGE_LABELS = {
  empty: "Henüz taahhüt eklenmemiş.",
  add: "Taahhüt ekle",
  remove: "Taahhüdü kaldır",
};
