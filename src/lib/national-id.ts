/** A Turkish national ID number (TC Kimlik No): 11 digits with two check digits */
export function isValidNationalId(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;

  const d = value.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  // JS % keeps the sign, so shift the (possibly negative) result into 0-9
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  const eleventh = (odd + even + d[9]) % 10;

  return d[9] === tenth && d[10] === eleventh;
}

/** First three digits, the rest hidden: "100••••••••" */
export function maskNationalId(value: string): string {
  return value.slice(0, 3) + "•".repeat(8);
}
