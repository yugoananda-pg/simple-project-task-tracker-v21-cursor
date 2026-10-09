/**
 * Portfolio roll-ups (FR-PORT). Pure functions, no I/O.
 *
 * Every figure is the same maths the project hub uses, applied to the pooled
 * set of tasks. A portfolio score therefore weights each task by its planned
 * working days, whichever project it sits in.
 */

import type { Insight } from "@/src/lib/analytics/insights";
import type {
  IssueIntelIssue,
  IssueIntelligence,
} from "@/src/lib/analytics/issue-intelligence";
import {
  milestoneVarianceDays,
  type ProgressEventPoint,
} from "@/src/lib/analytics/schedule-series";
import {
  compareLocalDates,
  localDateToUtcNoon,
  type HolidaySet,
  type LocalDateString,
} from "@/src/lib/analytics/working-days";
import {
  computeProjectScheduleHealth,
  formatPercent1,
  resolveHolidaySet,
  STATUS_FLAGS,
  type ScheduleTaskInput,
  type StatusFlagId,
} from "@/src/lib/analytics/weighted-progress";
import { formatAuDate } from "@/src/lib/gantt/date-utils";
import { isPlausibleLocalDate } from "@/src/lib/task-defaults";
import { getEffectiveDueDate, getEffectiveStartDate } from "@/src/lib/task-defaults";
import type { TaskBucket, TaskStatus } from "@/src/lib/types";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type PortfolioProjectMeta = {
  id: string;
  name: string;
  customProjectId: string;
  lifecycleStatus: "ACTIVE" | "COMPLETED";
  ownerId: string;
  ownerName: string;
};

export type PortfolioTask = ScheduleTaskInput & {
  projectId: string;
  title: string;
  status: TaskStatus;
  bucket: TaskBucket;
  assigneeId: string | null;
  assigneeName: string;
};

export type PortfolioMilestone = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  initialTarget: string;
  updatedTarget: string;
  actualAchieved: string | null;
};

export type PortfolioIssue = IssueIntelIssue & { projectId: string };

// ---------------------------------------------------------------------------
// Progress history
// ---------------------------------------------------------------------------

/**
 * Keep the last recorded progress per task per day. The S-curve reads progress
 * "on or before a day", so earlier writes on the same day never change a figure
 * and only add weight to the page.
 */
export function compactProgressEvents(
  events: ReadonlyArray<ProgressEventPoint>,
): ProgressEventPoint[] {
  const ordered = [...events].sort((a, b) =>
    a.occurredOn.localeCompare(b.occurredOn),
  );
  const lastOfDay = new Map<string, ProgressEventPoint>();
  for (const event of ordered) {
    lastOfDay.set(`${event.taskId}|${event.occurredOn.slice(0, 10)}`, event);
  }
  return [...lastOfDay.values()].sort((a, b) =>
    a.occurredOn.localeCompare(b.occurredOn),
  );
}

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/**
 * Whole days since the epoch for a local date. Null when the date is unusable,
 * which includes years outside 2000 to 2100 so one bad row cannot stretch an axis.
 */
export function dayNumber(value: LocalDateString | null | undefined): number | null {
  if (!value || !isPlausibleLocalDate(value)) return null;
  const noon = localDateToUtcNoon(value);
  if (!noon) return null;
  return Math.floor(noon.getTime() / DAY_MS);
}

function earliest(values: ReadonlyArray<string | null>): string | null {
  let best: string | null = null;
  for (const value of values) {
    if (!value || dayNumber(value) == null) continue;
    if (!best || compareLocalDates(value, best) < 0) best = value;
  }
  return best;
}

function latest(values: ReadonlyArray<string | null>): string | null {
  let best: string | null = null;
  for (const value of values) {
    if (!value || dayNumber(value) == null) continue;
    if (!best || compareLocalDates(value, best) > 0) best = value;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Macro bars
// ---------------------------------------------------------------------------

export type MacroSpan = { start: LocalDateString; end: LocalDateString };

export type MacroActual = {
  start: LocalDateString;
  /** End of the solid part: the latest actual finish, else the start. */
  solidEnd: LocalDateString;
  /** True when work has started, is unfinished, and the bar runs on to today. */
  toToday: boolean;
};

export type MilestoneState = "early" | "ontime" | "late" | "overdue" | "upcoming";

export type MacroMilestone = {
  id: string;
  name: string;
  description: string;
  target: LocalDateString;
  achieved: LocalDateString | null;
  varianceDays: number | null;
  state: MilestoneState;
};

export type MacroRow = {
  projectId: string;
  name: string;
  customProjectId: string;
  ownerId: string;
  ownerName: string;
  lifecycleStatus: "ACTIVE" | "COMPLETED";
  taskCount: number;
  initial: MacroSpan | null;
  updated: MacroSpan | null;
  actual: MacroActual | null;
  milestones: MacroMilestone[];
  ps: number;
  pActual: number;
  pTarget: number;
  delta: number;
  statusFlag: StatusFlagId;
  /** Emerald at 95% punctuality or better, amber below that. */
  tone: "on" | "late";
  overdueTasks: number;
  activeIssues: number;
  criticalIssues: number;
};

function spanOf(
  starts: ReadonlyArray<string | null>,
  ends: ReadonlyArray<string | null>,
): MacroSpan | null {
  const start = earliest(starts);
  const end = latest(ends);
  if (!start || !end) return null;
  return { start, end: compareLocalDates(end, start) < 0 ? start : end };
}

function actualSpan(
  tasks: ReadonlyArray<PortfolioTask>,
  lifecycleStatus: "ACTIVE" | "COMPLETED",
  today: LocalDateString,
): MacroActual | null {
  const finishes = tasks.map((task) => task.actualCompletionDate);
  const start =
    earliest(tasks.map((task) => task.actualStartDate)) ?? earliest(finishes);
  if (!start) return null;
  const lastFinish = latest(finishes);
  const solidEnd =
    lastFinish && compareLocalDates(lastFinish, start) >= 0 ? lastFinish : start;
  const allDone =
    tasks.length > 0 && tasks.every((task) => task.progress >= 100);
  const ongoing = lifecycleStatus === "ACTIVE" && !allDone;
  return {
    start,
    solidEnd,
    toToday: ongoing && compareLocalDates(today, solidEnd) > 0,
  };
}

const ACTIVE_ISSUE: ReadonlySet<string> = new Set([
  "open",
  "in_progress",
  "blocked",
]);

export function classifyMilestone(
  target: LocalDateString,
  achieved: LocalDateString | null,
  holidays: HolidaySet,
  today: LocalDateString,
): { state: MilestoneState; varianceDays: number | null } {
  if (achieved) {
    const variance = milestoneVarianceDays(target, achieved, holidays);
    if (variance == null || variance === 0) {
      return { state: "ontime", varianceDays: variance ?? 0 };
    }
    return { state: variance > 0 ? "late" : "early", varianceDays: variance };
  }
  return {
    state: compareLocalDates(today, target) > 0 ? "overdue" : "upcoming",
    varianceDays: null,
  };
}

export function buildMacroRows(input: {
  projects: ReadonlyArray<PortfolioProjectMeta>;
  tasks: ReadonlyArray<PortfolioTask>;
  milestones: ReadonlyArray<PortfolioMilestone>;
  issues: ReadonlyArray<PortfolioIssue>;
  holidayKeys: Iterable<string> | HolidaySet;
  today: LocalDateString;
}): MacroRow[] {
  const holidays = resolveHolidaySet(input.holidayKeys);
  const tasksBy = groupBy(input.tasks, (task) => task.projectId);
  const milestonesBy = groupBy(input.milestones, (row) => row.projectId);
  const issuesBy = groupBy(input.issues, (row) => row.projectId);

  const rows = input.projects.map((project): MacroRow => {
    const tasks = tasksBy.get(project.id) ?? [];
    const health = computeProjectScheduleHealth(tasks, holidays, input.today);
    const issues = issuesBy.get(project.id) ?? [];
    const active = issues.filter((issue) => ACTIVE_ISSUE.has(issue.status));
    const overdueTasks = tasks.filter((task) => {
      if (task.status === "done") return false;
      const due = getEffectiveDueDate(task);
      return due != null && compareLocalDates(due, input.today) < 0;
    }).length;
    return {
      projectId: project.id,
      name: project.name,
      customProjectId: project.customProjectId,
      ownerId: project.ownerId,
      ownerName: project.ownerName,
      lifecycleStatus: project.lifecycleStatus,
      taskCount: tasks.length,
      initial: spanOf(
        tasks.map((task) => task.initialStartDate),
        tasks.map((task) => task.initialDueDate),
      ),
      updated: spanOf(
        tasks.map((task) => getEffectiveStartDate(task)),
        tasks.map((task) => getEffectiveDueDate(task)),
      ),
      actual: actualSpan(tasks, project.lifecycleStatus, input.today),
      milestones: (milestonesBy.get(project.id) ?? [])
        .map((milestone): MacroMilestone => {
          const verdict = classifyMilestone(
            milestone.updatedTarget,
            milestone.actualAchieved,
            holidays,
            input.today,
          );
          return {
            id: milestone.id,
            name: milestone.name,
            description: milestone.description,
            target: milestone.updatedTarget,
            achieved: milestone.actualAchieved,
            varianceDays: verdict.varianceDays,
            state: verdict.state,
          };
        })
        .sort((a, b) => a.target.localeCompare(b.target)),
      ps: health.projectPs,
      pActual: health.pActualProject,
      pTarget: health.pTargetProject,
      delta: health.delta,
      statusFlag: health.statusFlag,
      tone: health.projectPs >= 95 ? "on" : "late",
      overdueTasks,
      activeIssues: active.length,
      criticalIssues: active.filter((issue) => issue.severity === "critical")
        .length,
    };
  });

  return rows.sort((a, b) => {
    const left = rowStart(a);
    const right = rowStart(b);
    if (left && right) {
      const order = compareLocalDates(left, right);
      if (order !== 0) return order;
    } else if (left || right) {
      return left ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function rowStart(row: MacroRow): string | null {
  return earliest([row.updated?.start ?? null, row.initial?.start ?? null, row.actual?.start ?? null]);
}

function groupBy<T>(
  rows: ReadonlyArray<T>,
  key: (row: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Axis
// ---------------------------------------------------------------------------

export type MacroTick = { key: string; label: string; pct: number };

export type MacroAxis = {
  startDay: number;
  endDay: number;
  ticks: MacroTick[];
  todayPct: number | null;
  /** Percent across the axis for a local date, clamped to 0..100. */
  pct: (date: LocalDateString) => number;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function monthStartDay(year: number, month: number): number {
  return Math.floor(Date.UTC(year, month, 1, 12) / DAY_MS);
}

export function buildMacroAxis(
  rows: ReadonlyArray<MacroRow>,
  today: LocalDateString,
): MacroAxis | null {
  const days: number[] = [];
  const push = (value: string | null | undefined) => {
    const day = dayNumber(value);
    if (day != null) days.push(day);
  };
  for (const row of rows) {
    for (const span of [row.initial, row.updated]) {
      if (!span) continue;
      push(span.start);
      push(span.end);
    }
    if (row.actual) {
      push(row.actual.start);
      push(row.actual.solidEnd);
    }
    for (const milestone of row.milestones) {
      push(milestone.target);
      push(milestone.achieved);
    }
  }
  if (days.length === 0) return null;
  push(today);

  const low = Math.min(...days);
  const high = Math.max(...days);
  const pad = Math.max(7, Math.ceil((high - low) * 0.03));
  const first = new Date((low - pad) * DAY_MS + DAY_MS / 2);
  const last = new Date((high + pad) * DAY_MS + DAY_MS / 2);
  let year = first.getUTCFullYear();
  let month = first.getUTCMonth();
  const startDay = monthStartDay(year, month);
  const endMonthIndex = last.getUTCFullYear() * 12 + last.getUTCMonth() + 1;
  const endDay = monthStartDay(Math.floor(endMonthIndex / 12), endMonthIndex % 12);
  const total = Math.max(1, endDay - startDay);

  const months = endMonthIndex - (year * 12 + month);
  const step = months <= 14 ? 1 : months <= 36 ? 3 : 6;
  const ticks: MacroTick[] = [];
  let cursor = year * 12 + month;
  let index = 0;
  while (cursor < endMonthIndex) {
    year = Math.floor(cursor / 12);
    month = cursor % 12;
    const day = monthStartDay(year, month);
    ticks.push({
      key: `${year}-${month}`,
      label: index === 0 || month === 0 ? `${MONTHS[month]} ${year}` : MONTHS[month],
      pct: ((day - startDay) / total) * 100,
    });
    cursor += step;
    index += 1;
  }

  const pct = (date: LocalDateString) => {
    const day = dayNumber(date);
    if (day == null) return 0;
    return Math.min(100, Math.max(0, ((day - startDay) / total) * 100));
  };
  const todayDay = dayNumber(today);
  return {
    startDay,
    endDay,
    ticks,
    todayPct:
      todayDay != null && todayDay >= startDay && todayDay <= endDay
        ? ((todayDay - startDay) / total) * 100
        : null,
    pct,
  };
}

// ---------------------------------------------------------------------------
// PM comparison
// ---------------------------------------------------------------------------

export type PmComparisonRow = {
  pmId: string;
  pmName: string;
  projectCount: number;
  taskCount: number;
  ps: number;
  pActual: number;
  pTarget: number;
  delta: number;
  statusFlag: StatusFlagId;
  overdueTasks: number;
  activeIssues: number;
  criticalIssues: number;
};

export function buildPmComparison(input: {
  rows: ReadonlyArray<MacroRow>;
  tasks: ReadonlyArray<PortfolioTask>;
  holidayKeys: Iterable<string> | HolidaySet;
  today: LocalDateString;
}): PmComparisonRow[] {
  const holidays = resolveHolidaySet(input.holidayKeys);
  const tasksBy = groupBy(input.tasks, (task) => task.projectId);
  const byPm = groupBy(input.rows, (row) => row.ownerId);
  const out: PmComparisonRow[] = [];
  for (const [pmId, rows] of byPm) {
    const tasks = rows.flatMap((row) => tasksBy.get(row.projectId) ?? []);
    const health = computeProjectScheduleHealth(tasks, holidays, input.today);
    out.push({
      pmId,
      pmName: rows[0].ownerName,
      projectCount: rows.length,
      taskCount: tasks.length,
      ps: health.projectPs,
      pActual: health.pActualProject,
      pTarget: health.pTargetProject,
      delta: health.delta,
      statusFlag: health.statusFlag,
      overdueTasks: rows.reduce((sum, row) => sum + row.overdueTasks, 0),
      activeIssues: rows.reduce((sum, row) => sum + row.activeIssues, 0),
      criticalIssues: rows.reduce((sum, row) => sum + row.criticalIssues, 0),
    });
  }
  // Lowest punctuality first so the PM who needs attention leads the table.
  return out.sort((a, b) => a.ps - b.ps || a.pmName.localeCompare(b.pmName));
}

// ---------------------------------------------------------------------------
// Takeaways
// ---------------------------------------------------------------------------

function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function buildPortfolioInsights(input: {
  scope: "pm" | "all";
  scopeLabel: string;
  rows: ReadonlyArray<MacroRow>;
  pmRows: ReadonlyArray<PmComparisonRow>;
  taskCount: number;
  ps: number;
  delta: number;
  pActual: number;
  pTarget: number;
  statusFlag: StatusFlagId;
  issues: IssueIntelligence;
  today: LocalDateString;
}): Insight[] {
  const insights: Insight[] = [];
  if (input.rows.length === 0) {
    return [
      {
        id: "no-projects",
        tone: "neutral",
        text: "No projects are in this scope, so there is nothing to report yet.",
      },
    ];
  }

  const flag = STATUS_FLAGS[input.statusFlag].label;
  if (input.taskCount === 0) {
    insights.push({
      id: "no-tasks",
      tone: "neutral",
      text: `${input.scopeLabel} has ${input.rows.length} ${plural(input.rows.length, "project")} and no tasks, so the schedule score is not yet meaningful.`,
    });
  } else {
    insights.push({
      id: "ps",
      tone: input.ps >= 95 ? "good" : input.ps >= 85 ? "watch" : "urgent",
      text: `Portfolio punctuality is ${formatPercent1(input.ps)} (${flag}) across ${input.rows.length} ${plural(input.rows.length, "project")} and ${input.taskCount} ${plural(input.taskCount, "task")}. Actual progress is ${formatPercent1(input.pActual)} against a target of ${formatPercent1(input.pTarget)} (difference ${formatPercent1(input.delta)}).`,
    });

    const behind = input.rows
      .filter((row) => row.taskCount > 0 && row.ps < 95)
      .sort((a, b) => a.ps - b.ps)
      .slice(0, 3);
    if (behind.length > 0) {
      insights.push({
        id: "behind",
        tone: behind[0].ps < 85 ? "urgent" : "watch",
        text: `Lowest punctuality: ${listNames(
          behind.map((row) => `${row.name} (${formatPercent1(row.ps)})`),
        )}.`,
      });
    } else {
      insights.push({
        id: "all-on-track",
        tone: "good",
        text: "Every project with tasks is at 95.0% punctuality or better.",
      });
    }
  }

  const overdueTotal = input.rows.reduce((sum, row) => sum + row.overdueTasks, 0);
  if (overdueTotal > 0) {
    const worst = [...input.rows].sort(
      (a, b) => b.overdueTasks - a.overdueTasks,
    )[0];
    insights.push({
      id: "overdue-tasks",
      tone: "watch",
      text: `${overdueTotal} ${plural(overdueTotal, "task is", "tasks are")} past the due date. ${worst.name} has the most (${worst.overdueTasks}).`,
    });
  }

  const milestones = input.rows.flatMap((row) =>
    row.milestones.map((milestone) => ({ ...milestone, project: row.name })),
  );
  const overdueMilestones = milestones.filter((m) => m.state === "overdue");
  if (overdueMilestones.length > 0) {
    insights.push({
      id: "milestones-overdue",
      tone: "urgent",
      text: `${overdueMilestones.length} ${plural(overdueMilestones.length, "milestone is", "milestones are")} past target and not yet achieved.`,
    });
  }
  const next = milestones
    .filter((m) => m.state === "upcoming")
    .sort((a, b) => a.target.localeCompare(b.target))[0];
  if (next) {
    insights.push({
      id: "milestone-next",
      tone: "neutral",
      text: `Next milestone: ${next.name} (${next.project}) on ${formatAuDate(next.target)}.`,
    });
  }

  if (input.issues.criticalActive > 0 || input.issues.overdue > 0) {
    const parts: string[] = [];
    if (input.issues.criticalActive > 0) {
      parts.push(
        `${input.issues.criticalActive} critical ${plural(input.issues.criticalActive, "issue is", "issues are")} still active`,
      );
    }
    if (input.issues.overdue > 0) {
      parts.push(
        `${input.issues.overdue} active ${plural(input.issues.overdue, "issue is", "issues are")} past the updated due date`,
      );
    }
    insights.push({
      id: "issues",
      tone: input.issues.criticalActive > 0 ? "urgent" : "watch",
      text: `${parts.join("; ")}.`,
    });
  } else if (!input.issues.empty) {
    insights.push({
      id: "issues-calm",
      tone: "good",
      text: `No critical or overdue issues. Closure rate is ${formatPercent1(input.issues.closureRate)} across ${input.issues.totalNonCancelled} non-cancelled ${plural(input.issues.totalNonCancelled, "issue")}.`,
    });
  }

  if (input.scope === "all" && input.pmRows.length >= 2) {
    const lowest = input.pmRows[0];
    const highest = input.pmRows[input.pmRows.length - 1];
    insights.push({
      id: "pm-spread",
      tone: "neutral",
      text: `Punctuality by PM runs from ${formatPercent1(lowest.ps)} (${lowest.pmName}) to ${formatPercent1(highest.ps)} (${highest.pmName}).`,
    });
  }

  return insights.slice(0, 6);
}
