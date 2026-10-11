/**
 * Relative weights, target progress (capped at 100%), Punctuality Score, and 11 Status Flags
 * (Wave 4A-3). All percentages use a 0–100 scale unless noted.
 */

import {
  compareLocalDates,
  elapsedWorkingDays,
  plannedWorkingDuration,
  toHolidaySet,
  workingDaysAfter,
  type HolidaySet,
  type LocalDateString,
} from "@/src/lib/analytics/working-days";
import {
  getEffectiveDueDate,
  getEffectiveStartDate,
  toLocalDateString,
} from "@/src/lib/task-defaults";
import type { Task } from "@/src/lib/types";

export type StatusFlagId =
  | "SF-01"
  | "SF-02"
  | "SF-03"
  | "SF-04"
  | "SF-05"
  | "SF-06"
  | "SF-07"
  | "SF-08"
  | "SF-09"
  | "SF-10"
  | "SF-11";

export type StatusFlagDefinition = {
  id: StatusFlagId;
  label: string;
  /** One sentence for readers: what the flag says about the schedule. */
  meaning: string;
  badgeClassName: string;
};

export const STATUS_FLAGS: Record<StatusFlagId, StatusFlagDefinition> = {
  "SF-01": {
    id: "SF-01",
    label: "Due to Commence",
    meaning:
      "Work has not started and the planned start date is still ahead.",
    badgeClassName:
      "border border-sky-600/35 bg-sky-100 text-sky-950 dark:border-sky-400/40 dark:bg-sky-950/60 dark:text-sky-100",
  },
  "SF-02": {
    id: "SF-02",
    label: "Delayed Commencement",
    meaning:
      "The planned start has passed with no progress yet, but the schedule is still recoverable (PS ≥ 0.85).",
    badgeClassName:
      "border border-amber-600/40 bg-amber-100 text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/55 dark:text-amber-100",
  },
  "SF-03": {
    id: "SF-03",
    label: "Critically Overdue Start",
    meaning:
      "The planned start has passed with no progress and the score has fallen below 0.850.",
    badgeClassName:
      "border border-rose-600/40 bg-rose-100 text-rose-950 dark:border-rose-400/45 dark:bg-rose-950/55 dark:text-rose-100",
  },
  "SF-04": {
    id: "SF-04",
    label: "On Track",
    meaning:
      "Actual progress is within 5% of target (0.95 ≤ PS < 1.05).",
    badgeClassName:
      "border border-emerald-600/40 bg-emerald-100 text-emerald-950 dark:border-emerald-400/40 dark:bg-emerald-950/55 dark:text-emerald-100",
  },
  "SF-05": {
    id: "SF-05",
    label: "Slipping",
    meaning:
      "Actual progress is slightly behind target (0.85 ≤ PS < 0.95).",
    badgeClassName:
      "border border-amber-600/40 bg-amber-100 text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/55 dark:text-amber-100",
  },
  "SF-06": {
    id: "SF-06",
    label: "Critically Delayed",
    meaning:
      "Actual progress is well behind target (PS < 0.85).",
    badgeClassName:
      "border border-rose-600/40 bg-rose-100 text-rose-950 dark:border-rose-400/45 dark:bg-rose-950/55 dark:text-rose-100",
  },
  "SF-07": {
    id: "SF-07",
    label: "Ahead of Schedule",
    meaning:
      "Actual progress is ahead of target (PS ≥ 1.05).",
    badgeClassName:
      "border border-teal-600/40 bg-teal-100 text-teal-950 dark:border-teal-400/40 dark:bg-teal-950/55 dark:text-teal-100",
  },
  "SF-08": {
    id: "SF-08",
    label: "Completed Ahead of Schedule",
    meaning:
      "Finished sooner than planned (PS ≥ 1.05).",
    badgeClassName:
      "border border-indigo-600/40 bg-indigo-100 text-indigo-950 dark:border-indigo-400/40 dark:bg-indigo-950/55 dark:text-indigo-100",
  },
  "SF-09": {
    id: "SF-09",
    label: "Completed On Time",
    meaning:
      "Finished on the planned schedule (0.95 ≤ PS < 1.05).",
    badgeClassName:
      "border border-zinc-500/45 bg-zinc-200 text-zinc-900 dark:border-zinc-400/40 dark:bg-zinc-800 dark:text-zinc-100",
  },
  "SF-10": {
    id: "SF-10",
    label: "Completed Late",
    meaning:
      "Finished a little late (0.85 ≤ PS < 0.95).",
    badgeClassName:
      "border border-amber-700/50 bg-amber-200 text-amber-950 dark:border-amber-300/50 dark:bg-amber-950/70 dark:text-amber-50",
  },
  "SF-11": {
    id: "SF-11",
    label: "Completed Severely Late",
    meaning:
      "Finished well after the plan (PS < 0.85).",
    badgeClassName:
      "border border-rose-700/55 bg-rose-200 text-rose-950 dark:border-rose-300/55 dark:bg-rose-950/70 dark:text-rose-50",
  },
};

export type ScheduleTaskInput = {
  id: string;
  progress: number;
  initialStartDate: string | null;
  initialDueDate: string | null;
  updatedStartDate: string | null;
  updatedDueDate: string | null;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
};

export type TaskScheduleMetrics = {
  taskId: string;
  dPlanned: number;
  weight: number;
  weightPercent: number;
  pActual: number;
  pTarget: number;
  ps: number;
  statusFlag: StatusFlagId;
};

export type ProjectScheduleHealth = {
  tasks: TaskScheduleMetrics[];
  byId: ReadonlyMap<string, TaskScheduleMetrics>;
  pActualProject: number;
  pTargetProject: number;
  projectPs: number;
  delta: number;
  statusFlag: StatusFlagId;
  earliestStart: LocalDateString | null;
};

/** Round to one decimal place (UI reporting standard). */
export function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export function formatPercent1(value: number): string {
  return `${round1(value).toFixed(1)}%`;
}

/**
 * Punctuality Score (PS) as a plain score with two decimals, for example
 * 0.89. PS is stored on a 0 to 100 scale (89.3), where 1.00 means actual
 * progress equals target. It is a score, not a percentage of anything.
 */
export function formatScore2(ps: number): string {
  if (!Number.isFinite(ps)) return "0.00";
  return (ps / 100).toFixed(2);
}

export function resolveHolidaySet(
  holidays: Iterable<LocalDateString | Date> | HolidaySet = [],
): HolidaySet {
  if (holidays instanceof Set) return holidays;
  return toHolidaySet(holidays);
}

export function resolveStatusFlag(input: {
  pActual: number;
  ps: number;
  startDate: LocalDateString | null;
  asOf: LocalDateString;
}): StatusFlagId {
  const pActual = input.pActual;
  const ps = input.ps;
  const beforeStart =
    input.startDate != null &&
    compareLocalDates(input.asOf, input.startDate) < 0;

  if (pActual >= 100) {
    if (ps >= 105) return "SF-08";
    if (ps >= 95) return "SF-09";
    if (ps >= 85) return "SF-10";
    return "SF-11";
  }

  if (pActual <= 0) {
    if (beforeStart) return "SF-01";
    if (ps >= 85) return "SF-02";
    return "SF-03";
  }

  if (ps >= 105) return "SF-07";
  if (ps >= 95) return "SF-04";
  if (ps >= 85) return "SF-05";
  return "SF-06";
}

function clampActual(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

/**
 * Target progress as a percentage: min(100, (E_elapsed / D_planned) × 100).
 * Capped at 100% even when today is past the due date (task and project level).
 * Missing schedule → 0.
 */
export function computeTargetProgressPercent(
  start: LocalDateString | null,
  due: LocalDateString | null,
  asOf: LocalDateString,
  holidays: HolidaySet,
): { dPlanned: number; pTarget: number } {
  if (!start || !due) {
    return { dPlanned: 0, pTarget: 0 };
  }
  const dPlanned = plannedWorkingDuration(start, due, holidays);
  if (dPlanned <= 0) {
    return { dPlanned: 0, pTarget: 0 };
  }
  const elapsed = elapsedWorkingDays(start, asOf, holidays);
  return {
    dPlanned,
    pTarget: Math.min(100, (elapsed / dPlanned) * 100),
  };
}

function dateKey(value: string | null | undefined): LocalDateString | null {
  if (!value) return null;
  const key = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function taskIsComplete(task: {
  progress: number;
  status?: string;
}): boolean {
  return clampActual(task.progress) >= 100 || task.status === "done";
}

/**
 * Completed work is judged against the planned due date.
 * An early start must not turn an on-time or early handover into a late score.
 * Stored scale: 100 means 1.00. Returns null when there is no due date to judge.
 */
export function scoreCompletedAgainstDue(input: {
  dueDate: LocalDateString | null;
  actualCompletionDate: LocalDateString | null;
  asOf: LocalDateString;
  dPlanned: number;
  holidays: HolidaySet;
}): { ps: number; statusFlag: StatusFlagId } | null {
  const due = dateKey(input.dueDate);
  if (!due) return null;
  const actualEnd = dateKey(input.actualCompletionDate) ?? dateKey(input.asOf);
  if (!actualEnd) return null;
  const planned = Math.max(1, input.dPlanned);

  if (compareLocalDates(actualEnd, due) < 0) {
    const daysAhead = workingDaysAfter(actualEnd, due, input.holidays);
    const ps = Math.max(105, 105 + (daysAhead / planned) * 100);
    return { ps, statusFlag: "SF-08" };
  }

  if (actualEnd === due) {
    return { ps: 100, statusFlag: "SF-09" };
  }

  const overdueDays = workingDaysAfter(due, actualEnd, input.holidays);
  const ps = (planned / (planned + overdueDays)) * 100;
  return { ps, statusFlag: ps >= 85 ? "SF-10" : "SF-11" };
}

export function computeTaskPunctualityScore(input: {
  pActual: number;
  pTarget: number;
  startDate: LocalDateString | null;
  dueDate: LocalDateString | null;
  actualStartDate: LocalDateString | null;
  actualCompletionDate: LocalDateString | null;
  asOf: LocalDateString;
  holidays: HolidaySet;
  dPlanned: number;
  completed?: boolean;
}): number {
  const pActual = clampActual(input.pActual);
  const beforeStart =
    input.startDate != null &&
    compareLocalDates(input.asOf, input.startDate) < 0;

  if (input.completed || pActual >= 100) {
    const judged = scoreCompletedAgainstDue({
      dueDate: input.dueDate,
      actualCompletionDate: input.actualCompletionDate,
      asOf: input.asOf,
      dPlanned: input.dPlanned,
      holidays: input.holidays,
    });
    if (judged) return judged.ps;
    // No due date: keep the schedule-span ratio so a finish can still be scored.
    const actualEnd = dateKey(input.actualCompletionDate) ?? input.asOf;
    const scheduleStart =
      input.startDate ?? dateKey(input.actualStartDate) ?? actualEnd;
    const dActual =
      scheduleStart && actualEnd
        ? plannedWorkingDuration(scheduleStart, actualEnd, input.holidays)
        : Math.max(1, input.dPlanned);
    const planned = Math.max(1, input.dPlanned || dActual);
    return (planned / Math.max(1, dActual)) * 100;
  }

  if (pActual <= 0) {
    if (beforeStart) return 100;
    return Math.max(0, (1 - input.pTarget / 100) * 100);
  }

  // In progress
  if (beforeStart) {
    return 100 + pActual;
  }
  if (input.pTarget > 0) {
    return (pActual / input.pTarget) * 100;
  }
  return 100;
}

/**
 * A finished project is the same comparison as a finished task, on the
 * project window: earliest planned start, latest planned due, latest handover.
 */
function scoreCompletedProject(
  rows: ReadonlyArray<{
    start: LocalDateString | null;
    due: LocalDateString | null;
    dPlanned: number;
    task: { actualCompletionDate: string | null };
  }>,
  asOf: LocalDateString,
  holidays: HolidaySet,
): { ps: number; statusFlag: StatusFlagId } | null {
  let plannedStart: LocalDateString | null = null;
  let plannedDue: LocalDateString | null = null;
  let handover: LocalDateString | null = null;
  let plannedDays = 0;

  for (const row of rows) {
    plannedDays += row.dPlanned;
    if (row.start && (!plannedStart || compareLocalDates(row.start, plannedStart) < 0)) {
      plannedStart = row.start;
    }
    if (row.due && (!plannedDue || compareLocalDates(row.due, plannedDue) > 0)) {
      plannedDue = row.due;
    }
    const end = dateKey(row.task.actualCompletionDate) ?? dateKey(asOf);
    if (end && (!handover || compareLocalDates(end, handover) > 0)) {
      handover = end;
    }
  }

  if (!plannedDue || !handover) return null;
  const windowDays =
    plannedStart != null
      ? plannedWorkingDuration(plannedStart, plannedDue, holidays)
      : plannedDays;

  return scoreCompletedAgainstDue({
    dueDate: plannedDue,
    actualCompletionDate: handover,
    asOf,
    dPlanned: windowDays,
    holidays,
  });
}

function projectLevelPs(pActual: number, pTarget: number): number {
  if (pTarget === 0 && pActual === 0) return 100;
  if (pTarget === 0 && pActual > 0) return 100 + pActual;
  return (pActual / pTarget) * 100;
}

export function computeProjectScheduleHealth(
  tasks: ReadonlyArray<ScheduleTaskInput | Task>,
  holidaysInput: Iterable<LocalDateString | Date> | HolidaySet = [],
  asOf: LocalDateString = toLocalDateString(),
): ProjectScheduleHealth {
  const holidays = resolveHolidaySet(holidaysInput);
  const n = tasks.length;

  const prepared = tasks.map((task) => {
    const start = getEffectiveStartDate(task);
    const due = getEffectiveDueDate(task);
    const { dPlanned, pTarget } = computeTargetProgressPercent(
      start,
      due,
      asOf,
      holidays,
    );
    const pActual = clampActual(task.progress);
    return {
      task,
      start,
      due,
      dPlanned,
      pTarget,
      pActual,
    };
  });

  const sumD = prepared.reduce((sum, row) => sum + row.dPlanned, 0);
  const useEqualWeights = n > 0 && sumD === 0;

  const metrics: TaskScheduleMetrics[] = prepared.map((row) => {
    const weight = useEqualWeights
      ? 1 / n
      : sumD > 0
        ? row.dPlanned / sumD
        : 0;
    const completed = taskIsComplete(row.task);
    const completedScore = completed
      ? scoreCompletedAgainstDue({
          dueDate: row.due,
          actualCompletionDate: row.task.actualCompletionDate,
          asOf,
          dPlanned: row.dPlanned,
          holidays,
        })
      : null;
    const ps =
      completedScore?.ps ??
      computeTaskPunctualityScore({
        pActual: row.pActual,
        pTarget: row.pTarget,
        startDate: row.start,
        dueDate: row.due,
        actualStartDate: row.task.actualStartDate,
        actualCompletionDate: row.task.actualCompletionDate,
        asOf,
        holidays,
        dPlanned: row.dPlanned,
        completed,
      });
    const statusFlag =
      completedScore?.statusFlag ??
      resolveStatusFlag({
        pActual: completed ? 100 : row.pActual,
        ps,
        startDate: row.start,
        asOf,
      });
    return {
      taskId: row.task.id,
      dPlanned: row.dPlanned,
      weight,
      weightPercent: weight * 100,
      pActual: row.pActual,
      pTarget: row.pTarget,
      ps,
      statusFlag,
    };
  });

  const pActualProject = metrics.reduce(
    (sum, row) => sum + row.pActual * row.weight,
    0,
  );
  const pTargetProject = metrics.reduce(
    (sum, row) => sum + row.pTarget * row.weight,
    0,
  );
  const everyTaskComplete = n > 0 && prepared.every((row) => taskIsComplete(row.task));
  const projectCompletion = everyTaskComplete
    ? scoreCompletedProject(prepared, asOf, holidays)
    : null;
  const projectPs =
    projectCompletion?.ps ??
    (n === 0 ? 100 : projectLevelPs(pActualProject, pTargetProject));

  let earliestStart: LocalDateString | null = null;
  for (const row of prepared) {
    if (!row.start) continue;
    if (!earliestStart || compareLocalDates(row.start, earliestStart) < 0) {
      earliestStart = row.start;
    }
  }

  const statusFlag =
    projectCompletion?.statusFlag ??
    (n === 0
      ? "SF-01"
      : resolveStatusFlag({
          pActual: pActualProject,
          ps: projectPs,
          startDate: earliestStart,
          asOf,
        }));

  const byId = new Map(metrics.map((row) => [row.taskId, row]));

  return {
    tasks: metrics,
    byId,
    pActualProject,
    pTargetProject,
    projectPs,
    delta: pActualProject - pTargetProject,
    statusFlag,
    earliestStart,
  };
}
