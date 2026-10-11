/**
 * Working-day arithmetic (Wave 4A-2).
 * Business days = Mon–Fri excluding registered Holiday dates.
 * All calendar inputs are local `YYYY-MM-DD` strings.
 */

export type LocalDateString = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseLocalDateParts(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = DATE_RE.exec(value.trim().slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Inclusive UTC-noon Date for stable day walking without DST drift. */
export function localDateToUtcNoon(value: LocalDateString): Date | null {
  const parts = parseLocalDateParts(value);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
}

export function utcNoonToLocalDateString(date: Date): LocalDateString {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function compareLocalDates(a: LocalDateString, b: LocalDateString): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function clampLocalDateRange(
  start: LocalDateString,
  due: LocalDateString,
): { start: LocalDateString; due: LocalDateString; wasInverted: boolean } {
  if (compareLocalDates(start, due) <= 0) {
    return { start, due, wasInverted: false };
  }
  return { start, due: start, wasInverted: true };
}

export type HolidaySet = ReadonlySet<LocalDateString>;

export function toHolidaySet(
  dates: Iterable<LocalDateString | Date>,
): HolidaySet {
  const set = new Set<LocalDateString>();
  for (const value of dates) {
    if (value instanceof Date) {
      set.add(utcNoonToLocalDateString(value));
    } else {
      const parts = parseLocalDateParts(value);
      if (parts) {
        set.add(
          `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
        );
      }
    }
  }
  return set;
}

/**
 * IsWorkDay(t): Mon–Fri and not in H.
 * Uses UTC day-of-week on noon timestamps so calendar days are stable.
 */
export function isWorkDay(
  date: LocalDateString,
  holidays: HolidaySet = new Set(),
): boolean {
  const noon = localDateToUtcNoon(date);
  if (!noon) return false;
  const dow = noon.getUTCDay(); // 0 Sun … 6 Sat
  if (dow === 0 || dow === 6) return false;
  if (holidays.has(utcNoonToLocalDateString(noon))) return false;
  return true;
}

/**
 * Count working days inclusive of both endpoints.
 * Inverted ranges are clamped (due = start). Empty/invalid → 0 before clamp.
 */
export function countWorkingDaysInclusive(
  start: LocalDateString | null | undefined,
  due: LocalDateString | null | undefined,
  holidays: HolidaySet = new Set(),
): number {
  if (!start || !due) return 0;
  if (!parseLocalDateParts(start) || !parseLocalDateParts(due)) return 0;

  const range = clampLocalDateRange(start, due);
  let cursor = localDateToUtcNoon(range.start);
  const end = localDateToUtcNoon(range.due);
  if (!cursor || !end) return 0;

  let count = 0;
  while (cursor.getTime() <= end.getTime()) {
    const key = utcNoonToLocalDateString(cursor);
    if (isWorkDay(key, holidays)) {
      count += 1;
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return count;
}

/**
 * Planned duration D_planned = max(1, working days inclusive).
 * Missing dates → 0 (caller may fall back to equal weights).
 *
 * Same calendar start/due always yields at least 1 (including when that day
 * is a weekend or holiday). Use this for List WD columns and weight maths —
 * never show 0 / "—" when both endpoints are present.
 */
export function plannedWorkingDuration(
  start: LocalDateString | null | undefined,
  due: LocalDateString | null | undefined,
  holidays: HolidaySet = new Set(),
): number {
  if (!start || !due) return 0;
  const raw = countWorkingDaysInclusive(start, due, holidays);
  return Math.max(1, raw);
}

/**
 * Working days strictly after `from` through `to`.
 * The anchor day is not counted, so this is how many working days `to` sits
 * after `from`. The same day, or an inverted range, is 0.
 */
export function workingDaysAfter(
  from: LocalDateString | null | undefined,
  to: LocalDateString | null | undefined,
  holidays: HolidaySet = new Set(),
): number {
  if (!from || !to) return 0;
  if (compareLocalDates(to, from) <= 0) return 0;
  const span = countWorkingDaysInclusive(from, to, holidays);
  if (isWorkDay(from, holidays)) return Math.max(0, span - 1);
  return span;
}

/**
 * Elapsed working days from start through asOf (inclusive), or 0 if asOf < start.
 */
export function elapsedWorkingDays(
  start: LocalDateString | null | undefined,
  asOf: LocalDateString,
  holidays: HolidaySet = new Set(),
): number {
  if (!start) return 0;
  if (compareLocalDates(asOf, start) < 0) return 0;
  return countWorkingDaysInclusive(start, asOf, holidays);
}
