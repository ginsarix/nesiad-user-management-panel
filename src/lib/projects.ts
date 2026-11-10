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
