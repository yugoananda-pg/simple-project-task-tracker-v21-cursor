import { format } from "date-fns";

import type { Task, TaskStatus } from "@/src/lib/types";

/** Default progress % when creating a task in a given status. */
export function defaultProgressForStatus(status: TaskStatus): number {
  switch (status) {
    case "todo":
      return 0;
    case "in_progress":
      return 1;
    case "done":
      return 100;
    default:
      return 0;
  }
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Map a progress percent to the matching Kanban status. */
export function statusFromProgress(progress: number): TaskStatus {
  const value = clampProgress(progress);
  if (value <= 0) return "todo";
  if (value >= 100) return "done";
  return "in_progress";
}

/**
 * Progress to apply when status changes.
 * Doing keeps an in-range value (1–99); 0% or 100% collapse to 1%.
 */
export function progressFromStatusChange(
  status: TaskStatus,
  currentProgress: number,
): number {
  switch (status) {
    case "todo":
      return 0;
    case "in_progress": {
      const current = clampProgress(currentProgress);
      return current > 0 && current < 100 ? current : 1;
    }
    case "done":
      return 100;
    default:
      return 0;
  }
}

/**
 * Local calendar date as YYYY-MM-DD.
 * Never use `toISOString().slice(0, 10)` — that shifts the day in UTC+ timezones.
 */
export function toLocalDateString(date: Date = new Date()): string {
  return format(date, "yyyy-MM-dd");
}

/** Calendar years the tracker accepts for schedule dates. */
export const PLAUSIBLE_YEAR_MIN = 2000;
export const PLAUSIBLE_YEAR_MAX = 2100;

/**
 * True when `value` is a real calendar date (no 30 February) in an accepted
 * year. A mistyped year such as 0227 or 1902 would otherwise stretch every
 * chart axis, so every save path checks this first.
 */
export function isPlausibleLocalDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < PLAUSIBLE_YEAR_MIN || year > PLAUSIBLE_YEAR_MAX) return false;
  const probe = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Convert a local YYYY-MM-DD string into a Date suitable for Prisma `@db.Date`.
 * Uses UTC noon so the calendar day is stable across timezones when serialised.
 */
export function localDateStringToDbDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim().slice(0, 10));
  if (!match) {
    throw new Error(`Invalid local date string: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/** Format a Prisma `@db.Date` value back to YYYY-MM-DD without timezone drift. */
export function dbDateToLocalDateString(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysToLocalDateString(
  dateString: string,
  days: number,
): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
}

/** True when YYYY-MM-DD is strictly after today (local). */
export function isFutureLocalDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return false;
  return datePart > toLocalDateString();
}

/**
 * Actual duration is start→finish, both in the past or today, finish not before start.
 * Returns a user-facing message, or null when the pair is allowed.
 */
export function actualDateRangeError(
  start: string | null,
  finish: string | null,
): string | null {
  if (isFutureLocalDate(start)) {
    return "Actual start date cannot be in the future.";
  }
  if (isFutureLocalDate(finish)) {
    return "Actual finish date cannot be in the future.";
  }
  if (finish && !start) {
    return "Enter an actual start date before the actual finish date. Duration needs both dates.";
  }
  if (start && finish && finish < start) {
    return "Actual finish date cannot be earlier than the actual start date.";
  }
  return null;
}

type TaskDateFields = {
  initialStartDate: string | null;
  initialDueDate: string | null;
  updatedStartDate: string | null;
  updatedDueDate: string | null;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
};

function pickDate(
  patch: Partial<TaskDateFields>,
  current: TaskDateFields,
  key: keyof TaskDateFields,
): string | null {
  return patch[key] !== undefined ? patch[key] ?? null : current[key];
}

/** Range checks for a finished set of dates — used when the drawer closes. */
export function taskDatePatchError(
  current: TaskDateFields,
  patch: Partial<TaskDateFields>,
): string | null {
  const initialStart = pickDate(patch, current, "initialStartDate");
  const initialDue = pickDate(patch, current, "initialDueDate");
  if (initialStart && initialDue && initialDue < initialStart) {
    return "Initial due date cannot be before the initial start date.";
  }

  const updatedStart = pickDate(patch, current, "updatedStartDate");
  const updatedDue = pickDate(patch, current, "updatedDueDate");
  if (updatedStart && updatedDue && updatedDue < updatedStart) {
    return "Updated due date cannot be before the updated start date.";
  }

  return actualDateRangeError(
    pickDate(patch, current, "actualStartDate"),
    pickDate(patch, current, "actualCompletionDate"),
  );
}

const DATE_FIELD_LABEL: Record<keyof TaskDateFields, string> = {
  initialStartDate: "Initial start",
  initialDueDate: "Initial due",
  updatedStartDate: "Updated start",
  updatedDueDate: "Updated due",
  actualStartDate: "Actual start",
  actualCompletionDate: "Actual completion",
};

export type RestoredField = {
  key: string;
  label: string;
  reason: string;
};

function dateChanged(
  patch: Partial<TaskDateFields>,
  current: TaskDateFields,
  key: keyof TaskDateFields,
): boolean {
  return patch[key] !== undefined && (patch[key] ?? null) !== current[key];
}

/**
 * Smallest set of changed ends to drop so a start/end pair is valid again.
 * When either end can be dropped on its own, both changed ends are dropped
 * so a guess does not keep one of them.
 */
function spanKeysToRestore(
  current: TaskDateFields,
  patch: Partial<TaskDateFields>,
  startKey: keyof TaskDateFields,
  endKey: keyof TaskDateFields,
): Array<keyof TaskDateFields> {
  const start = pickDate(patch, current, startKey);
  const end = pickDate(patch, current, endKey);
  if (!(start && end && end < start)) return [];

  const startChanged = dateChanged(patch, current, startKey);
  const endChanged = dateChanged(patch, current, endKey);
  if (startChanged && !endChanged) return [startKey];
  if (endChanged && !startChanged) return [endKey];
  if (!startChanged && !endChanged) return [];

  const startFix = pickDate(
    { ...patch, [startKey]: current[startKey] },
    current,
    startKey,
  );
  const endFix = pickDate(
    { ...patch, [endKey]: current[endKey] },
    current,
    endKey,
  );
  const droppingStartFixes = !(startFix && end && end < startFix);
  const droppingEndFixes = !(start && endFix && endFix < start);
  if (droppingStartFixes && !droppingEndFixes) return [startKey];
  if (droppingEndFixes && !droppingStartFixes) return [endKey];
  return [startKey, endKey];
}

function pushRestore(
  restored: RestoredField[],
  seen: Set<string>,
  key: keyof TaskDateFields,
  reason: string,
) {
  if (seen.has(key)) return;
  seen.add(key);
  restored.push({ key, label: DATE_FIELD_LABEL[key], reason });
}

/**
 * Drop only the date edits that break a rule. Other keys in `patch` stay,
 * including a date whose pair is still valid.
 */
export function restoreBrokenDateChanges(
  current: TaskDateFields,
  patch: Partial<TaskDateFields>,
): { patch: Partial<TaskDateFields>; restored: RestoredField[] } {
  const next: Partial<TaskDateFields> = { ...patch };
  const restored: RestoredField[] = [];
  const seen = new Set<string>();
  const implausible =
    "Please enter a valid date between the years 2000 and 2100.";

  for (const key of Object.keys(DATE_FIELD_LABEL) as Array<keyof TaskDateFields>) {
    const value = next[key];
    if (value && !isPlausibleLocalDate(value)) {
      delete next[key];
      pushRestore(restored, seen, key, implausible);
    }
  }

  const spans: Array<{
    start: keyof TaskDateFields;
    end: keyof TaskDateFields;
    reason: string;
  }> = [
    {
      start: "initialStartDate",
      end: "initialDueDate",
      reason: "Initial due date cannot be before the initial start date.",
    },
    {
      start: "updatedStartDate",
      end: "updatedDueDate",
      reason: "Updated due date cannot be before the updated start date.",
    },
  ];

  for (const span of spans) {
    for (const key of spanKeysToRestore(current, next, span.start, span.end)) {
      delete next[key];
      pushRestore(restored, seen, key, span.reason);
    }
  }

  for (let guard = 0; guard < 4; guard += 1) {
    const start = pickDate(next, current, "actualStartDate");
    const finish = pickDate(next, current, "actualCompletionDate");
    const actualError = actualDateRangeError(start, finish);
    if (!actualError) break;
    let keys: Array<keyof TaskDateFields> = [];
    if (isFutureLocalDate(start) && next.actualStartDate !== undefined) {
      keys = ["actualStartDate"];
    } else if (
      isFutureLocalDate(finish) &&
      next.actualCompletionDate !== undefined
    ) {
      keys = ["actualCompletionDate"];
    } else if (finish && !start) {
      const startChanged = next.actualStartDate !== undefined;
      const finishChanged = next.actualCompletionDate !== undefined;
      if (startChanged && !finishChanged) keys = ["actualStartDate"];
      else if (finishChanged && !startChanged) keys = ["actualCompletionDate"];
      else if (!actualDateRangeError(current.actualStartDate, finish)) {
        keys = ["actualStartDate"];
      } else if (!actualDateRangeError(start, current.actualCompletionDate)) {
        keys = ["actualCompletionDate"];
      } else {
        keys = ["actualStartDate", "actualCompletionDate"];
      }
    } else {
      keys = spanKeysToRestore(
        current,
        next,
        "actualStartDate",
        "actualCompletionDate",
      );
    }
    if (keys.length === 0) break;
    for (const key of keys) {
      delete next[key];
      pushRestore(restored, seen, key, actualError);
    }
  }

  return { patch: next, restored };
}

/** One sentence per rule, then a note when other edits are still saved. */
export function restoredFieldsMessage(
  items: Array<Pick<RestoredField, "label" | "reason">>,
  keptOtherChanges: boolean,
): string {
  if (items.length === 0) return "";
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const labels = groups.get(item.reason) ?? [];
    labels.push(item.label);
    groups.set(item.reason, labels);
  }
  const sentences: string[] = [];
  for (const [reason, labels] of groups) {
    const names =
      labels.length === 1
        ? labels[0]!
        : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
    const verb = labels.length === 1 ? "was" : "were";
    sentences.push(`${names} ${verb} restored to the previous value. ${reason}`);
  }
  if (keptOtherChanges) sentences.push("Your other changes were saved.");
  return sentences.join(" ");
}

/** Effective due date for overdue checks — prefer updated, else initial. */
export function getEffectiveDueDate(task: {
  updatedDueDate: string | null;
  initialDueDate: string | null;
}): string | null {
  return task.updatedDueDate ?? task.initialDueDate;
}

/** Effective start date for schedule maths — prefer updated, else initial. */
export function getEffectiveStartDate(task: {
  updatedStartDate: string | null;
  initialStartDate: string | null;
}): string | null {
  return task.updatedStartDate ?? task.initialStartDate;
}

type SyncableTask = Pick<
  Task,
  "status" | "progress" | "actualStartDate" | "actualCompletionDate"
>;

/**
 * Build a patch that keeps status, progress, and actual dates consistent.
 * Backward moves clear actual completion (and start when returning to To Do).
 */
export function buildProgressStatusPatch(
  current: SyncableTask,
  patch: Partial<SyncableTask>,
): Partial<SyncableTask> {
  const today = toLocalDateString();
  const next: Partial<SyncableTask> = { ...patch };

  const applyForStatus = (status: TaskStatus, progress: number) => {
    next.status = status;
    next.progress = progress;

    if (status === "todo") {
      next.actualStartDate = null;
      next.actualCompletionDate = null;
      return;
    }

    if (status === "in_progress") {
      next.actualStartDate = current.actualStartDate ?? today;
      next.actualCompletionDate = null;
      return;
    }

    // done — keep an explicit finish/start from the patch (e.g. user-typed actual finish)
    next.actualStartDate =
      patch.actualStartDate !== undefined
        ? (patch.actualStartDate ?? current.actualStartDate ?? today)
        : (current.actualStartDate ?? today);
    next.actualCompletionDate =
      patch.actualCompletionDate !== undefined
        ? (patch.actualCompletionDate ?? today)
        : (current.actualCompletionDate ?? today);
  };

  if (patch.progress !== undefined && patch.status === undefined) {
    const progress = clampProgress(patch.progress);
    applyForStatus(statusFromProgress(progress), progress);
  } else if (patch.status !== undefined) {
    const progress =
      patch.progress !== undefined
        ? clampProgress(patch.progress)
        : progressFromStatusChange(patch.status, current.progress);
    applyForStatus(patch.status, progress);
  } else if (patch.progress !== undefined) {
    next.progress = clampProgress(patch.progress);
  }

  return next;
}
