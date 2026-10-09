/**
 * Issue Intelligence aggregates (dev_req §3.7). Never writes task weights.
 */

import { computeIssueFixFlag } from "@/src/lib/analytics/issue-schedule";
import {
  compareLocalDates,
  localDateToUtcNoon,
  plannedWorkingDuration,
  type LocalDateString,
} from "@/src/lib/analytics/working-days";
import { includeToday, sampleDates } from "@/src/lib/analytics/schedule-series";
import {
  computeTargetProgressPercent,
  computeTaskPunctualityScore,
  resolveHolidaySet,
  round1,
  STATUS_FLAGS,
  type StatusFlagId,
} from "@/src/lib/analytics/weighted-progress";
import { clampProgress } from "@/src/lib/task-defaults";
import type {
  IssueActivityType,
  IssueCategory,
  IssueSeverity,
  IssueStatus,
} from "@/src/lib/types";
import {
  ISSUE_CATEGORY_LABEL,
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUS_LABEL,
} from "@/src/lib/issue-labels";

const ACTIVE: ReadonlySet<IssueStatus> = new Set([
  "open",
  "in_progress",
  "blocked",
]);
const CLOSED_OUT: ReadonlySet<IssueStatus> = new Set(["resolved", "closed"]);

export type IssueIntelIssue = {
  id: string;
  issueNumber: number;
  displayId: string;
  status: IssueStatus;
  severity: IssueSeverity;
  category: IssueCategory;
  progress: number;
  picName: string;
  updatedStartDate: string | null;
  updatedDueDate: string | null;
  actualStartDate: string | null;
  actualResolutionDate: string | null;
  raisedAt: string;
  updatedAt: string;
  /** Set on portfolio roll-ups so a stream row says which project it came from. */
  projectName?: string;
};

export type IssueIntelActivity = {
  id: string;
  issueId: string;
  eventType: IssueActivityType;
  summary: string;
  createdAt: string;
  createdByName: string;
  payload?: { from?: unknown; to?: unknown };
};

export type CountSlice = { key: string; label: string; count: number };

export type IssueIntelligence = {
  totalNonCancelled: number;
  cancelled: number;
  statusCounts: CountSlice[];
  criticalActive: number;
  overdue: number;
  meanProgress: number;
  meanIssuePs: number | null;
  closureRate: number;
  lastActivity: {
    at: string;
    actor: string;
    displayId: string;
    summary: string;
    eventType: IssueActivityType;
    issueId: string;
  } | null;
  realisation: Array<{ date: string; target: number; actual: number | null }>;
  burnDown: Array<{ date: string; remaining: number; ideal: number | null }>;
  severityStack: CountSlice[];
  categoryStack: CountSlice[];
  flagHistogram: CountSlice[];
  picLoad: CountSlice[];
  stream: Array<{
    id: string;
    at: string;
    actor: string;
    displayId: string;
    issueId: string;
    eventType: IssueActivityType;
    summary: string;
    projectName?: string;
  }>;
  empty: boolean;
};

function dayOf(iso: string): LocalDateString {
  return iso.slice(0, 10);
}

/** Activities grouped by issue and sorted oldest first, built once per run. */
type ActivityIndex = ReadonlyMap<string, ReadonlyArray<IssueIntelActivity>>;

function indexActivities(
  activities: ReadonlyArray<IssueIntelActivity>,
): ActivityIndex {
  const byIssue = new Map<string, IssueIntelActivity[]>();
  for (const row of activities) {
    const list = byIssue.get(row.issueId) ?? [];
    list.push(row);
    byIssue.set(row.issueId, list);
  }
  for (const list of byIssue.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return byIssue;
}

function statusFromActivity(
  issue: IssueIntelIssue,
  activities: ActivityIndex,
  day: LocalDateString,
  today: LocalDateString,
): IssueStatus {
  if (compareLocalDates(day, today) >= 0) return issue.status;
  let status: IssueStatus = "open";
  const relevant = (activities.get(issue.id) ?? [])
    .filter((row) =>
      row.eventType === "STATUS_CHANGED" ||
      row.eventType === "CLOSED" ||
      row.eventType === "CANCELLED",
    );
  let saw = false;
  for (const row of relevant) {
    if (compareLocalDates(dayOf(row.createdAt), day) > 0) break;
    const next = row.payload?.to;
    if (typeof next === "string") {
      status = next as IssueStatus;
      saw = true;
    }
  }
  if (!saw && compareLocalDates(day, dayOf(issue.updatedAt)) >= 0) {
    return issue.status;
  }
  return status;
}

function progressFromActivity(
  issue: IssueIntelIssue,
  activities: ActivityIndex,
  day: LocalDateString,
  today: LocalDateString,
): number {
  if (compareLocalDates(day, today) >= 0) return clampProgress(issue.progress);
  const own = activities.get(issue.id) ?? [];
  const changes = own.filter((row) => row.eventType === "PROGRESS_CHANGED");
  if (
    changes.length === 0 &&
    compareLocalDates(day, dayOf(issue.raisedAt)) >= 0
  ) {
    return clampProgress(issue.progress);
  }
  let progress = 0;
  const relevant = own.filter(
    (row) =>
      row.eventType === "PROGRESS_CHANGED" || row.eventType === "RAISED",
  );
  for (const row of relevant) {
    if (compareLocalDates(dayOf(row.createdAt), day) > 0) break;
    if (row.eventType === "RAISED") progress = 0;
    if (
      row.eventType === "PROGRESS_CHANGED" &&
      typeof row.payload?.to === "number"
    ) {
      progress = clampProgress(row.payload.to);
    }
  }
  return progress;
}

function countBy(
  rows: Array<{ key: string; label: string }>,
): CountSlice[] {
  const map = new Map<string, CountSlice>();
  for (const row of rows) {
    const current = map.get(row.key);
    if (current) current.count += 1;
    else map.set(row.key, { key: row.key, label: row.label, count: 1 });
  }
  return [...map.values()];
}

export function buildIssueIntelligence(input: {
  issues: ReadonlyArray<IssueIntelIssue>;
  activities: ReadonlyArray<IssueIntelActivity>;
  holidayKeys?: Iterable<string>;
  today: LocalDateString;
}): IssueIntelligence {
  const holidays = resolveHolidaySet(input.holidayKeys ?? []);
  const activityIndex = indexActivities(input.activities);
  const issuesById = new Map(input.issues.map((issue) => [issue.id, issue]));
  const issues = input.issues;
  const cancelled = issues.filter((issue) => issue.status === "cancelled");
  const live = issues.filter((issue) => issue.status !== "cancelled");
  const active = live.filter((issue) => ACTIVE.has(issue.status));
  const resolved = live.filter((issue) => CLOSED_OUT.has(issue.status));
  const m = live.length;

  const meanProgress =
    active.length === 0
      ? 0
      : active.reduce((sum, issue) => sum + clampProgress(issue.progress), 0) /
        active.length;

  let meanIssuePs: number | null = null;
  if (active.length > 0) {
    const scores = active.map((issue) => {
      const { dPlanned, pTarget } = computeTargetProgressPercent(
        issue.updatedStartDate,
        issue.updatedDueDate,
        input.today,
        holidays,
      );
      return computeTaskPunctualityScore({
        pActual: clampProgress(issue.progress),
        pTarget,
        startDate: issue.updatedStartDate,
        dueDate: issue.updatedDueDate,
        actualStartDate: issue.actualStartDate,
        actualCompletionDate: issue.actualResolutionDate,
        asOf: input.today,
        holidays,
        dPlanned,
      });
    });
    meanIssuePs = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  const statusOrder: IssueStatus[] = [
    "open",
    "in_progress",
    "blocked",
    "resolved",
    "closed",
  ];
  const statusCounts = statusOrder.map((status) => ({
    key: status,
    label: ISSUE_STATUS_LABEL[status],
    count: issues.filter((issue) => issue.status === status).length,
  }));

  const criticalActive = active.filter(
    (issue) => issue.severity === "critical",
  ).length;
  const overdue = active.filter(
    (issue) =>
      issue.updatedDueDate != null &&
      compareLocalDates(issue.updatedDueDate, input.today) < 0,
  ).length;

  const weights = new Map<string, number>();
  const durationSum = live.reduce(
    (sum, issue) =>
      sum +
      (issue.updatedStartDate && issue.updatedDueDate
        ? plannedWorkingDuration(
            issue.updatedStartDate,
            issue.updatedDueDate,
            holidays,
          )
        : 0),
    0,
  );
  for (const issue of live) {
    const duration =
      issue.updatedStartDate && issue.updatedDueDate
        ? plannedWorkingDuration(
            issue.updatedStartDate,
            issue.updatedDueDate,
            holidays,
          )
        : 0;
    weights.set(
      issue.id,
      m === 0
        ? 0
        : durationSum === 0
          ? 1 / m
          : duration / durationSum,
    );
  }

  let earliest: LocalDateString | null = null;
  let latest: LocalDateString | null = null;
  for (const issue of live) {
    for (const value of [
      dayOf(issue.raisedAt),
      issue.updatedStartDate,
      issue.updatedDueDate,
    ]) {
      if (!value) continue;
      if (!earliest || compareLocalDates(value, earliest) < 0) earliest = value;
      if (!latest || compareLocalDates(value, latest) > 0) latest = value;
    }
  }
  if (earliest && (!latest || compareLocalDates(input.today, latest) > 0)) {
    latest = input.today;
  }
  if (!earliest) earliest = input.today;
  if (!latest || compareLocalDates(latest, earliest) < 0) latest = earliest;

  const dates =
    m === 0
      ? []
      : includeToday(sampleDates(earliest, latest), input.today, earliest, latest);
  const realisation = dates.map((date) => {
    const future = compareLocalDates(date, input.today) > 0;
    let target = 0;
    let actual = 0;
    for (const issue of live) {
      const weight = weights.get(issue.id) ?? 0;
      const planned = computeTargetProgressPercent(
        issue.updatedStartDate,
        issue.updatedDueDate,
        date,
        holidays,
      );
      target += weight * planned.pTarget;
      if (!future) {
        actual +=
          weight *
          progressFromActivity(issue, activityIndex, date, input.today);
      }
    }
    return {
      date,
      target: round1(target),
      actual: future ? null : round1(actual),
    };
  });

  const idealEnd = live.reduce<LocalDateString | null>((max, issue) => {
    if (!issue.updatedDueDate) return max;
    if (!max || compareLocalDates(issue.updatedDueDate, max) > 0) {
      return issue.updatedDueDate;
    }
    return max;
  }, null);
  const idealStart = live.reduce<LocalDateString | null>((min, issue) => {
    const raised = dayOf(issue.raisedAt);
    if (!min || compareLocalDates(raised, min) < 0) return raised;
    return min;
  }, null);

  const burnDown = dates.map((date) => {
    const remaining = live.filter((issue) =>
      ACTIVE.has(statusFromActivity(issue, activityIndex, date, input.today)),
    ).length;
    let ideal: number | null = null;
    if (idealStart && idealEnd && compareLocalDates(idealEnd, idealStart) > 0) {
      const start = localDateToUtcNoon(idealStart)!.getTime();
      const end = localDateToUtcNoon(idealEnd)!.getTime();
      const at = localDateToUtcNoon(date)!.getTime();
      const ratio = Math.min(1, Math.max(0, (at - start) / (end - start)));
      ideal = round1(m * (1 - ratio));
    }
    return { date, remaining, ideal };
  });

  const flagHistogram = countBy(
    live.map((issue) => {
      const flag: StatusFlagId = computeIssueFixFlag(issue, [
        ...(input.holidayKeys ?? []),
      ], input.today);
      return { key: flag, label: STATUS_FLAGS[flag].label };
    }),
  ).sort((a, b) => a.key.localeCompare(b.key));

  const picLoad = countBy(
    active.map((issue) => {
      const name = issue.picName.trim();
      return name
        ? { key: name.toLowerCase(), label: name }
        : { key: "__unassigned__", label: "Unassigned" };
    }),
  ).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // Portfolio history rows carry no summary. Only rows with text read as a stream line.
  const stream = input.activities
    .filter((row) => row.summary.trim() !== "")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map((row) => {
      const issue = issuesById.get(row.issueId);
      return {
        id: row.id,
        at: row.createdAt,
        actor: row.createdByName || "Unknown",
        displayId: issue?.displayId ?? "ISS-—",
        issueId: row.issueId,
        eventType: row.eventType,
        summary: row.summary,
        projectName: issue?.projectName,
      };
    });

  const last = stream[0] ?? null;

  return {
    totalNonCancelled: m,
    cancelled: cancelled.length,
    statusCounts,
    criticalActive,
    overdue,
    meanProgress: round1(meanProgress),
    meanIssuePs: meanIssuePs == null ? null : round1(meanIssuePs),
    closureRate: m === 0 ? 0 : round1((resolved.length / m) * 100),
    lastActivity: last
      ? {
          at: last.at,
          actor: last.actor,
          displayId: last.displayId,
          summary: last.summary,
          eventType: last.eventType,
          issueId: last.issueId,
        }
      : null,
    realisation,
    burnDown,
    severityStack: (["critical", "high", "medium", "low"] as const).map(
      (severity) => ({
        key: severity,
        label: ISSUE_SEVERITY_LABEL[severity],
        count: live.filter((issue) => issue.severity === severity).length,
      }),
    ),
    categoryStack: countBy(
      live.map((issue) => ({
        key: issue.category,
        label: ISSUE_CATEGORY_LABEL[issue.category],
      })),
    ),
    flagHistogram,
    picLoad,
    stream,
    empty: issues.length === 0,
  };
}

export function issuePsLabel(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}
