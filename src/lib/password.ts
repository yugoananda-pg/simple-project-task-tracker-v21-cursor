import { randomInt } from "crypto";

/** Alphabet omits ambiguous characters (0/O, 1/l/I). */
const TEMP_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

/**
 * Cryptographically strong temporary password for resets / out-of-band hand-off.
 * Meets `validatePassword` (length ≥ 6) and is long enough for one-time use.
 */
export function generateTemporaryPassword(length = 14): string {
  const size = Math.max(10, Math.min(64, length));
  let password = "";
  for (let i = 0; i < size; i += 1) {
    password += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return password;
}
