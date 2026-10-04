/**
 * Shared retention windows (calendar days, UTC).
 * Soft-deleted projects and soft-deactivated accounts use the same 30-day window.
 */

export const SOFT_DELETE_RETENTION_DAYS = 30;

/** Super PMs are emailed this many days before an account is permanently purged. */
export const USER_PURGE_WARNING_DAYS_BEFORE = 2;

export function addCalendarDays(from: Date, days: number): Date {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
