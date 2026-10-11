/**
 * Schedule S-Curve and task burn-down. Task weights only — issues never enter.
 */

import {
  compareLocalDates,
  localDateToUtcNoon,
  plannedWorkingDuration,
  utcNoonToLocalDateString,
  type HolidaySet,
  type LocalDateString,
} from "@/src/lib/analytics/working-days";
import {
  getEffectiveDueDate,
  getEffectiveStartDate,
  isPlausibleLocalDate,
} from "@/src/lib/task-defaults";
import {
  computeProjectScheduleHealth,
  computeTargetProgressPercent,
  resolveHolidaySet,
  round1,
  type ScheduleTaskInput,
} from "@/src/lib/analytics/weighted-progress";

export type ProgressEventPoint = {
  taskId: string;
  progress: number;
  occurredOn: string;
  source: "recorded" | "backfill";
};

export type SchedulePoint = {
  date: LocalDateString;
  target: number;
  /** Null after today — the actual line stops at T_now. */
  actual: number | null;
  remainingDays: number | null;
  idealRemainingDays: number;
};

export type ScheduleSeries = {
  points: SchedulePoint[];
  usesBackfill: boolean;
  earliest: LocalDateString | null;
  latest: LocalDateString | null;
};

function addDays(value: LocalDateString, days: number): LocalDateString {
  const noon = localDateToUtcNoon(value);
  if (!noon) return value;
  noon.setUTCDate(noon.getUTCDate() + days);
  return utcNoonToLocalDateString(noon);
}

function spanDays(start: LocalDateString, end: LocalDateString): number {
  const a = localDateToUtcNoon(start);
  const b = localDateToUtcNoon(end);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function sampleDates(
  start: LocalDateString,
  end: LocalDateString,
): LocalDateString[] {
  const span = spanDays(start, end);
  const step = span > 180 ? 14 : span > 60 ? 7 : 1;
  const dates: LocalDateString[] = [];
  let cursor = start;
  while (compareLocalDates(cursor, end) < 0) {
    dates.push(cursor);
    cursor = addDays(cursor, step);
  }
  dates.push(end);
  return dates;
}

/** Put milestone days on the series so a weekly sample still has a point to mark. */
export function includeMarkerDates(
  dates: readonly LocalDateString[],
  markers: readonly LocalDateString[],
  start: LocalDateString,
  end: LocalDateString,
): LocalDateString[] {
  const extra = markers.filter(
    (date) =>
      isPlausibleLocalDate(date) &&
      compareLocalDates(date, start) >= 0 &&
      compareLocalDates(date, end) <= 0 &&
      !dates.includes(date),
  );
  if (extra.length === 0) return [...dates];
  return [...dates, ...extra].sort(compareLocalDates);
}

/** Keep today on the series so a fortnightly sample still reports the current day. */
export function includeToday(
  dates: readonly LocalDateString[],
  today: LocalDateString,
  start: LocalDateString,
  end: LocalDateString,
): LocalDateString[] {
  if (
    compareLocalDates(today, start) < 0 ||
    compareLocalDates(today, end) > 0 ||
    dates.includes(today)
  ) {
    return [...dates];
  }
  return [...dates, today].sort(compareLocalDates);
}

function dateKey(value: string): LocalDateString {
  return value.slice(0, 10);
}

/** Latest recorded progress on or before `day`. Missing history is 0. */
export function progressOnDay(
  events: ReadonlyArray<ProgressEventPoint>,
  day: LocalDateString,
): number {
  let progress = 0;
  for (const event of events) {
    if (compareLocalDates(dateKey(event.occurredOn), day) <= 0) {
      progress = event.progress;
    }
  }
  return Math.max(0, Math.min(100, progress));
}

export function buildScheduleSeries(input: {
  tasks: ReadonlyArray<ScheduleTaskInput>;
  events: ReadonlyArray<ProgressEventPoint>;
  holidayKeys?: Iterable<string>;
  today: LocalDateString;
  /** Days that must appear on the axis, such as milestone dates. */
  markerDates?: readonly LocalDateString[];
}): ScheduleSeries {
  const holidays = resolveHolidaySet(input.holidayKeys ?? []);
  const health = computeProjectScheduleHealth(
    input.tasks,
    holidays,
    input.today,
  );
  const byTask = new Map<string, ProgressEventPoint[]>();
  for (const event of input.events) {
    const list = byTask.get(event.taskId) ?? [];
    list.push(event);
    byTask.set(event.taskId, list);
  }
  for (const list of byTask.values()) {
    list.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  }

  let earliest: LocalDateString | null = null;
  let latest: LocalDateString | null = null;
  for (const task of input.tasks) {
    const start = getEffectiveStartDate(task);
    const due = getEffectiveDueDate(task);
    const finish = task.actualCompletionDate ?? due;
    for (const value of [start, due, finish]) {
      if (!value || !isPlausibleLocalDate(value)) continue;
      if (!earliest || compareLocalDates(value, earliest) < 0) earliest = value;
      if (!latest || compareLocalDates(value, latest) > 0) latest = value;
    }
  }
  for (const value of input.markerDates ?? []) {
    if (!isPlausibleLocalDate(value)) continue;
    if (!earliest || compareLocalDates(value, earliest) < 0) earliest = value;
    if (!latest || compareLocalDates(value, latest) > 0) latest = value;
  }
  if (earliest && (!latest || compareLocalDates(input.today, latest) > 0)) {
    latest = input.today;
  }
  if (latest && (!earliest || compareLocalDates(input.today, earliest) < 0)) {
    earliest = earliest && compareLocalDates(earliest, input.today) < 0
      ? earliest
      : input.today;
  }

  if (!earliest || !latest || input.tasks.length === 0) {
    return { points: [], usesBackfill: false, earliest, latest };
  }
  if (compareLocalDates(latest, earliest) < 0) latest = earliest;

  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const totalDays = health.tasks.reduce((sum, row) => sum + row.dPlanned, 0);
  const dates = includeMarkerDates(
    includeToday(
      sampleDates(earliest, latest),
      input.today,
      earliest,
      latest,
    ),
    input.markerDates ?? [],
    earliest,
    latest,
  );
  const span = Math.max(1, spanDays(earliest, latest));

  const points = dates.map((date) => {
    const future = compareLocalDates(date, input.today) > 0;
    const asOf = future ? input.today : date;
    let target = 0;
    let actual = 0;
    let remaining = 0;
    for (const row of health.tasks) {
      const task = taskById.get(row.taskId);
      if (!task) continue;
      const start = getEffectiveStartDate(task);
      const due = getEffectiveDueDate(task);
      const planned = computeTargetProgressPercent(
        start,
        due,
        future ? date : asOf,
        holidays,
      );
      target += row.weight * planned.pTarget;
      if (!future) {
        const events = byTask.get(row.taskId) ?? [];
        const pActual = progressOnDay(events, asOf);
        actual += row.weight * pActual;
        remaining += row.dPlanned * (1 - pActual / 100);
      }
    }
    const elapsed = spanDays(earliest!, date);
    const ideal = totalDays * (1 - Math.min(1, Math.max(0, elapsed / span)));
    return {
      date,
      target: round1(target),
      actual: future ? null : round1(actual),
      remainingDays: future ? null : round1(remaining),
      idealRemainingDays: round1(ideal),
    };
  });

  return {
    points,
    usesBackfill: input.events.some((event) => event.source === "backfill"),
    earliest,
    latest,
  };
}

export function milestoneVarianceDays(
  target: LocalDateString,
  achieved: LocalDateString | null,
  holidays: HolidaySet,
): number | null {
  if (!achieved) return null;
  const late = compareLocalDates(achieved, target) > 0;
  const span = plannedWorkingDuration(
    late ? target : achieved,
    late ? achieved : target,
    holidays,
  );
  if (span <= 1 && achieved === target) return 0;
  return late ? span - 1 : -(span - 1);
}

/** Plain-language reading of a milestone variance. Positive is late. */
export function milestoneVarianceLabel(variance: number | null): string {
  if (variance == null) return "—";
  if (variance === 0) return "On the target day";
  const days = Math.abs(variance);
  const unit = `working day${days === 1 ? "" : "s"}`;
  return variance > 0 ? `${days} ${unit} late` : `${days} ${unit} early`;
}
