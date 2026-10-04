/**
 * Canonical email form for Auth + directory uniqueness.
 * Always persist and compare with this (trim + lower-case).
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
