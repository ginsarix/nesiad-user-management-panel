// No 0/O, 1/l/I: the password is read off a screen and typed from a text
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A random password for a new or reset panel account */
export function generatePassword(length = 12) {
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (value) => ALPHABET[value % ALPHABET.length]).join(
    "",
  );
}
