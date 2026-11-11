/**
 * TL amounts. They are stored as numeric(12,2) and travel as strings like
 * "1250.50", so they never pass through a float before being summed.
 * Client-safe.
 */

/** The API's form of an amount: up to 10 digits, a dot, 2 decimals */
export const AMOUNT_PATTERN = /^\d{1,10}\.\d{2}$/;

// Turkish input: dots group thousands (in threes), a comma starts up to 2
// decimals. "1.250,50", "1250,5", "1250"
const INPUT_PATTERN = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;
const MAX_INTEGER_DIGITS = 10;

/** "1.250,5" → "1250.50"; null when it isn't a Turkish-typed amount */
export function parseAmountInput(text: string): string | null {
  const match = INPUT_PATTERN.exec(text.trim());
  if (!match) return null;
  const integer = match[1].replaceAll(".", "").replace(/^0+(?=\d)/, "");
  if (integer.length > MAX_INTEGER_DIGITS) return null;
  const decimals = (match[2] ?? "").padEnd(2, "0");
  return `${integer}.${decimals}`;
}

const currencyFormat = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
});

const inputFormat = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "1250.5" → "₺1.250,50" (display only) */
export function formatAmount(amount: string | number) {
  return currencyFormat.format(Number(amount));
}

/**
 * "1250.5" → "1.250,50 TL", for notices. SMS go out in the GSM Turkish
 * character set, which has no "₺" (it arrives as "?").
 */
export function formatAmountText(amount: string | number) {
  return `${inputFormat.format(Number(amount))} TL`;
}

/** "1250.50" → "1.250,50", how the amount input shows a saved amount */
export function amountToInput(amount: string) {
  return inputFormat.format(Number(amount));
}
