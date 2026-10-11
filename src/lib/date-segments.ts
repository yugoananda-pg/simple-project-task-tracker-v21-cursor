/**
 * Day / month / year editing for the date field.
 * A segment is only a date once it is complete, so the first digit of a year
 * never becomes a stored date.
 */

export type DateSegment = "day" | "month" | "year";

export type DateParts = {
  day: string;
  month: string;
  year: string;
};

const ORDER: readonly DateSegment[] = ["day", "month", "year"];

export function emptyParts(): DateParts {
  return { day: "", month: "", year: "" };
}

export function partsFromIso(iso: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return emptyParts();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return emptyParts();
  }
  return { day: match[3], month: match[2], year: match[1] };
}

/** A real calendar date, or null while any part is still incomplete or impossible. */
export function isoFromParts(parts: DateParts): string | null {
  if (!/^\d{4}$/.test(parts.year)) return null;
  if (!/^\d{1,2}$/.test(parts.month) || !/^\d{1,2}$/.test(parts.day)) return null;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function isBlank(parts: DateParts): boolean {
  return parts.day === "" && parts.month === "" && parts.year === "";
}

export type DigitResult = {
  parts: DateParts;
  /** Next segment when this keystroke finished the current one. */
  advance: DateSegment | null;
  /** True when day, month and year now form a real date. */
  complete: boolean;
};

/**
 * Type one digit into a segment.
 * `fresh` means this is the first keystroke after the segment was chosen, so
 * it replaces the whole segment (typing "2" on 1902 shows "2", not a new date).
 * A day of 4–9, or a month of 2–9, is taken as that number and the caret moves on.
 */
export function typeDigit(
  parts: DateParts,
  segment: DateSegment,
  digit: string,
  fresh: boolean,
): DigitResult {
  const current = fresh ? "" : parts[segment];
  if (segment === "year") {
    const year = current.length >= 4 ? digit : current + digit;
    const next = { ...parts, year };
    return {
      parts: next,
      advance: null,
      complete: year.length === 4 && isoFromParts(next) !== null,
    };
  }

  if (current.length === 0) {
    const maxSingle = segment === "day" ? "3" : "1";
    if (digit > maxSingle) {
      const next = { ...parts, [segment]: `0${digit}` };
      const advance = segment === "day" ? "month" : "year";
      return {
        parts: next,
        advance,
        complete: isoFromParts(next) !== null,
      };
    }
    return {
      parts: { ...parts, [segment]: digit },
      advance: null,
      complete: false,
    };
  }

  const combined = Number(current + digit);
  const limit = segment === "day" ? 31 : 12;
  if (combined < 1 || combined > limit) {
    return { parts, advance: null, complete: false };
  }
  const next = {
    ...parts,
    [segment]: String(combined).padStart(2, "0"),
  };
  return {
    parts: next,
    advance: segment === "day" ? "month" : "year",
    complete: isoFromParts(next) !== null,
  };
}

/**
 * Remove the last digit. On a freshly chosen segment the first press clears
 * it. An empty segment moves to the previous one.
 */
export function backspace(
  parts: DateParts,
  segment: DateSegment,
  fresh: boolean,
): { parts: DateParts; segment: DateSegment } {
  if (fresh && parts[segment] !== "") {
    return { parts: { ...parts, [segment]: "" }, segment };
  }
  if (parts[segment] !== "") {
    return {
      parts: { ...parts, [segment]: parts[segment].slice(0, -1) },
      segment,
    };
  }
  const index = ORDER.indexOf(segment);
  if (index <= 0) return { parts, segment };
  const previous = ORDER[index - 1];
  return {
    parts: { ...parts, [previous]: parts[previous].slice(0, -1) },
    segment: previous,
  };
}

export function neighbour(
  segment: DateSegment,
  direction: -1 | 1,
): DateSegment | null {
  const index = ORDER.indexOf(segment) + direction;
  if (index < 0 || index >= ORDER.length) return null;
  return ORDER[index];
}

/** Move a complete date by one day, month or year. Returns null if `iso` is not complete. */
export function stepIso(
  iso: string,
  segment: DateSegment,
  delta: number,
): string | null {
  const parts = partsFromIso(iso);
  if (isoFromParts(parts) === null) return null;
  const date = new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
  );
  if (segment === "day") date.setDate(date.getDate() + delta);
  else if (segment === "month") date.setMonth(date.getMonth() + delta);
  else date.setFullYear(date.getFullYear() + delta);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Monday-first month grid. Always six rows, so the calendar never changes height. */
export function monthCells(year: number, month: number): Array<number | null> {
  const first = new Date(year, month, 1).getDay();
  const leading = (first + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= count; day += 1) cells.push(day);
  while (cells.length < 42) cells.push(null);
  return cells;
}

export function yearsInRange(minIso: string, maxIso: string): number[] {
  const min = Number(minIso.slice(0, 4));
  const max = Number(maxIso.slice(0, 4));
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return [];
  const years: number[] = [];
  for (let year = min; year <= max; year += 1) years.push(year);
  return years;
}
