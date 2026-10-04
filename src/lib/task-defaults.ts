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

    // done
    next.actualStartDate = current.actualStartDate ?? today;
    next.actualCompletionDate = today;
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
