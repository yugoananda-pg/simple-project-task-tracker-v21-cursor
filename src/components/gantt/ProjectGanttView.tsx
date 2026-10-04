"use client";

import { useEffect, useMemo, useState, type FocusEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { differenceInCalendarDays, startOfDay } from "date-fns";

import {
  getTaskPicDisplayName,
  getTaskPicKey,
} from "@/src/lib/assignee-display";
import {
  buildTimelineColumns,
  chooseTimelineScale,
  computeTimelineBounds,
  formatAuDate,
  formatAuDateRange,
  getActualDateRange,
  getBarPositionPx,
  getTimelineOffsetPx,
  isTaskOverdue,
  normaliseDateRange,
  parseTaskDate,
  type GanttDateRange,
  type GanttTimelineColumn,
  type GanttTimelineScale,
} from "@/src/lib/gantt/date-utils";
import type { Milestone, Task, TaskBucket, TaskStatus } from "@/src/lib/types";
import type { TaskScheduleMetrics } from "@/src/lib/analytics/weighted-progress";
import PicLabel from "@/src/components/tasks/PicLabel";
import ProgressPairBadges from "@/src/components/schedule/ProgressPairBadges";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";

export type ProjectGanttViewProps = {
  tasks: Task[];
  milestones?: Milestone[];
  projectName?: string;
  metricsById?: ReadonlyMap<string, TaskScheduleMetrics>;
  onTaskClick: (task: Task) => void;
  readOnly?: boolean;
};

/** Task list groups by process group; Assignee / PIC groups by PIC. */
export type GanttGroupMode = "task" | "assignee";

type GanttGroup = {
  id: string;
  label: string | null;
  tasks: Task[];
};

type TimelineBarKind = "initial" | "updated" | "actual";

type FloatingTip = {
  label: string;
  x: number;
  y: number;
};

const GROUP_OPTIONS: ReadonlyArray<{ id: GanttGroupMode; label: string }> = [
  { id: "task", label: "Task list" },
  { id: "assignee", label: "Assignee / PIC" },
];

const SCALE_OPTIONS: ReadonlyArray<{ id: GanttTimelineScale; label: string }> = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "Doing",
  done: "Done",
};

const PROCESS_GROUP_LABELS: Record<TaskBucket, string> = {
  initiating: "Initiating",
  planning: "Planning",
  executing: "Executing",
  monitoring: "Monitoring",
  closing: "Closing",
};

const WEEK_COLUMN_WIDTH = 72;
const MONTH_COLUMN_WIDTH = 88;
const HEADER_HEIGHT_PX = 48;
/** Must match left label + progress + right track: Tailwind `h-24`. */
const GROUP_HEADER_HEIGHT_PX = 36;
const BAR_HEIGHT = 7;
/** Sticky left rail: Task title pane + Progress column. */
const TASK_PANE_WIDTH_CLASS = "w-[17rem] sm:w-[20rem]";
const PROGRESS_PANE_WIDTH_CLASS = "w-[6.75rem]";
const LEFT_RAIL_WIDTH_CLASS = "w-[23.75rem] sm:w-[26.75rem]";

const paneBgClass = "bg-white dark:bg-zinc-900";
const gridColBorder = "border-r border-zinc-200 dark:border-zinc-700/60";
const gridRowBorder = "border-b border-zinc-200 dark:border-zinc-800";
const processGroupHeaderClass =
  "border-y border-zinc-300 bg-zinc-200/90 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-200";

function assigneeGroupLabel(tasks: Task[]): string {
  if (tasks.length === 0) return "Unassigned";
  return getTaskPicDisplayName(tasks[0]!);
}

function buildGroups(tasks: Task[], mode: GanttGroupMode): GanttGroup[] {
  if (mode === "assignee") {
    const buckets = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = getTaskPicKey(task);
      const list = buckets.get(key) ?? [];
      list.push(task);
      buckets.set(key, list);
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => {
        if (a === "__unassigned__") return 1;
        if (b === "__unassigned__") return -1;
        return a.localeCompare(b);
      })
      .map(([key, groupTasks]) => ({
        id: key,
        label:
          key === "__unassigned__"
            ? "Unassigned"
            : assigneeGroupLabel(groupTasks),
        tasks: [...groupTasks].sort((a, b) => a.title.localeCompare(b.title)),
      }));
  }

  // Task list → group by process group (bucket).
  const buckets = new Map<TaskBucket, Task[]>();
  for (const task of tasks) {
    const list = buckets.get(task.bucket) ?? [];
    list.push(task);
    buckets.set(task.bucket, list);
  }

  const order: TaskBucket[] = [
    "initiating",
    "planning",
    "executing",
    "monitoring",
    "closing",
  ];

  return order
    .filter((bucket) => buckets.has(bucket))
    .map((bucket) => ({
      id: bucket,
      label: PROCESS_GROUP_LABELS[bucket],
      tasks: [...(buckets.get(bucket) ?? [])].sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
    }));
}

function collectTimelineDates(
  tasks: Task[],
  milestones: Milestone[] = [],
): Date[] {
  const dates: Date[] = [];
  const today = startOfDay(new Date());

  for (const task of tasks) {
    for (const range of [
      normaliseDateRange(task.initialStartDate, task.initialDueDate),
      normaliseDateRange(task.updatedStartDate, task.updatedDueDate),
      getActualDateRange(task, today),
    ]) {
      if (range && !range.invalid) {
        dates.push(range.start, range.end);
      }
    }
  }

  for (const milestone of milestones) {
    const anchor = parseTaskDate(
      milestone.actualAchieved ?? milestone.updatedTarget,
    );
    if (anchor) dates.push(anchor);
  }

  dates.push(today);
  return dates;
}

function buildBarTooltip(
  kind: TimelineBarKind,
  projectName: string,
  task: Task,
): string {
  if (kind === "initial") {
    return [
      projectName,
      `Initial Start Date: ${formatAuDate(task.initialStartDate)}`,
      `Initial Due Date: ${formatAuDate(task.initialDueDate)}`,
    ].join("\n");
  }
  if (kind === "updated") {
    return [
      projectName,
      `Updated Start Date: ${formatAuDate(task.updatedStartDate)}`,
      `Updated Due Date: ${formatAuDate(task.updatedDueDate)}`,
    ].join("\n");
  }
  const completion =
    task.status === "done"
      ? formatAuDate(task.actualCompletionDate)
      : "In Progress";
  return [
    projectName,
    `Actual Start Date: ${formatAuDate(task.actualStartDate)}`,
    `Actual Completion Date: ${completion}`,
  ].join("\n");
}

function FloatingTooltipPortal({ tip }: { tip: FloatingTip | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !tip) return null;

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 w-max max-w-[18rem] -translate-x-1/2 -translate-y-full whitespace-pre-line rounded-md bg-zinc-900 px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.label}
    </div>,
    document.body,
  );
}

type TimelineBarProps = {
  task: Task;
  projectName: string;
  kind: TimelineBarKind;
  range: GanttDateRange | null;
  columns: GanttTimelineColumn[];
  columnWidths: number[];
  topClassName: string;
  barClassName: string;
  onTaskClick: (task: Task) => void;
  onTipChange: (tip: FloatingTip | null) => void;
  readOnly?: boolean;
};

function TimelineBar({
  task,
  projectName,
  kind,
  range,
  columns,
  columnWidths,
  topClassName,
  barClassName,
  onTaskClick,
  onTipChange,
  readOnly = false,
}: TimelineBarProps) {
  if (!range || range.invalid) return null;

  const isActual = kind === "actual";
  const { leftPx, widthPx, isSingleDay } = getBarPositionPx(
    range.start,
    range.end,
    columns,
    columnWidths,
    {
      inclusiveEnd: !range.endExclusive,
      exactDayWidth: isActual,
    },
  );

  const tooltip = buildBarTooltip(kind, projectName, task);
  const showNode = isActual;
  const showCheck = showNode && task.status === "done";

  function showTip(
    event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>,
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    onTipChange({
      label: tooltip,
      // Tip above the bar end (where the Actual node sits).
      x: rect.right,
      y: rect.top - 6,
    });
  }

  return (
    <button
      type="button"
      onClick={() => onTaskClick(task)}
      onMouseEnter={showTip}
      onMouseMove={showTip}
      onMouseLeave={() => onTipChange(null)}
      onFocus={showTip}
      onBlur={() => onTipChange(null)}
      aria-label={`${task.title}. ${tooltip.replaceAll("\n", ". ")}${readOnly ? " (read-only)" : ""}`}
      className={[
        "absolute z-0 overflow-visible rounded-sm transition hover:z-[5] hover:brightness-110 focus-visible:z-[5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100",
        isActual && isSingleDay ? "min-w-0" : "min-w-[8px]",
        topClassName,
        barClassName,
      ].join(" ")}
      style={{
        left: leftPx,
        width: widthPx,
        height: BAR_HEIGHT,
      }}
    >
      {showNode ? (
        <span
          className={[
            // Done and in-progress: node sits on the bar’s right end (same X as line end).
            "absolute right-0 top-1/2 flex size-3.5 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-sm",
            showCheck
              ? "border-2 border-emerald-950 bg-emerald-400 dark:border-emerald-950 dark:bg-emerald-300"
              : "border-2 border-white bg-emerald-500 dark:border-zinc-950 dark:bg-emerald-400",
          ].join(" ")}
        >
          {showCheck ? (
            <Check
              className="size-2.5 text-emerald-950"
              strokeWidth={3.5}
              aria-hidden
            />
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

type GanttTaskRowProps = {
  task: Task;
  projectName: string;
  columns: GanttTimelineColumn[];
  columnWidths: number[];
  timelineWidth: number;
  onTaskClick: (task: Task) => void;
  onTipChange: (tip: FloatingTip | null) => void;
  readOnly?: boolean;
};

function GanttTaskRow({
  task,
  projectName,
  columns,
  columnWidths,
  timelineWidth,
  onTaskClick,
  onTipChange,
  readOnly = false,
}: GanttTaskRowProps) {
  const today = startOfDay(new Date());
  const initial = normaliseDateRange(task.initialStartDate, task.initialDueDate);
  const updated = normaliseDateRange(task.updatedStartDate, task.updatedDueDate);
  const actual = getActualDateRange(task, today);
  const hasAny =
    (initial && !initial.invalid) ||
    (updated && !updated.invalid) ||
    (actual && !actual.invalid);

  return (
    <div
      className={`relative z-0 h-24 overflow-visible bg-white dark:bg-zinc-950 ${gridRowBorder}`}
      style={{ width: timelineWidth }}
    >
      {!hasAny ? (
        <div className="absolute inset-0 flex h-24 items-center px-3">
          <span className="text-[11px] text-zinc-400">No dates set</span>
        </div>
      ) : (
        <>
          <TimelineBar
            task={task}
            projectName={projectName}
            kind="initial"
            range={initial}
            columns={columns}
            columnWidths={columnWidths}
            topClassName="top-[24px]"
            barClassName="bg-zinc-600 dark:bg-zinc-500"
            onTaskClick={onTaskClick}
            onTipChange={onTipChange}
            readOnly={readOnly}
          />
          <TimelineBar
            task={task}
            projectName={projectName}
            kind="updated"
            range={updated}
            columns={columns}
            columnWidths={columnWidths}
            topClassName="top-[44px]"
            barClassName="bg-sky-500 dark:bg-sky-400"
            onTaskClick={onTaskClick}
            onTipChange={onTipChange}
            readOnly={readOnly}
          />
          <TimelineBar
            task={task}
            projectName={projectName}
            kind="actual"
            range={actual}
            columns={columns}
            columnWidths={columnWidths}
            topClassName="top-[64px]"
            barClassName="bg-emerald-500 dark:bg-emerald-400"
            onTaskClick={onTaskClick}
            onTipChange={onTipChange}
            readOnly={readOnly}
          />
        </>
      )}
    </div>
  );
}

function TodayMarker({
  columns,
  columnWidths,
  viewportHeight,
  onTipChange,
}: {
  columns: GanttTimelineColumn[];
  columnWidths: number[];
  /** Visible body height inside the scrollport (below sticky header). */
  viewportHeight: number | string;
  onTipChange: (tip: FloatingTip | null) => void;
}) {
  const today = startOfDay(new Date());
  if (columns.length === 0) return null;

  const rangeStart = startOfDay(columns[0]!.start);
  const rangeEnd = startOfDay(columns[columns.length - 1]!.end);
  if (today < rangeStart || today > rangeEnd) return null;

  const leftPx = getTimelineOffsetPx(today, columns, columnWidths);
  const tipLabel = `We're here — ${formatAuDate(today)}`;

  function showTip(event: MouseEvent<HTMLDivElement>) {
    onTipChange({
      label: tipLabel,
      x: event.clientX,
      y: event.clientY - 8,
    });
  }

  return (
    // Sticky rail: stays pinned under the date header while rows scroll vertically.
    // Horizontal scroll still moves it with the timeline (leftPx is in timeline space).
    <div
      className="pointer-events-none sticky z-20"
      style={{ top: HEADER_HEIGHT_PX, height: 0 }}
    >
      <div
        className="group pointer-events-auto absolute w-4 -ml-2 cursor-default overflow-visible"
        style={{ left: leftPx, height: viewportHeight }}
        onMouseEnter={showTip}
        onMouseMove={showTip}
        onMouseLeave={() => onTipChange(null)}
        aria-label={tipLabel}
      >
        <div className="pointer-events-none absolute left-1/2 top-0 z-40 h-full w-px -translate-x-1/2 bg-red-500" />
      </div>
    </div>
  );
}

function MilestoneMarkers({
  milestones,
  columns,
  columnWidths,
  viewportHeight,
  onTipChange,
}: {
  milestones: Milestone[];
  columns: GanttTimelineColumn[];
  columnWidths: number[];
  viewportHeight: number | string;
  onTipChange: (tip: FloatingTip | null) => void;
}) {
  if (columns.length === 0 || milestones.length === 0) return null;

  const rangeStart = startOfDay(columns[0]!.start);
  const rangeEnd = startOfDay(columns[columns.length - 1]!.end);

  return (
    <div
      className="pointer-events-none sticky z-[15]"
      style={{ top: HEADER_HEIGHT_PX, height: 0 }}
    >
      {milestones.map((milestone) => {
        const achieved = Boolean(milestone.actualAchieved);
        const anchor = parseTaskDate(
          milestone.actualAchieved ?? milestone.updatedTarget,
        );
        if (!anchor || anchor < rangeStart || anchor > rangeEnd) return null;
        const leftPx = getTimelineOffsetPx(anchor, columns, columnWidths);
        const tipLabel = [
          milestone.name,
          achieved
            ? `Achieved ${formatAuDate(milestone.actualAchieved)}`
            : `Target ${formatAuDate(milestone.updatedTarget)}`,
        ].join(" — ");

        function showTip(event: MouseEvent<HTMLDivElement>) {
          onTipChange({
            label: tipLabel,
            x: event.clientX,
            y: event.clientY - 8,
          });
        }

        return (
          <div
            key={milestone.id}
            className="group pointer-events-auto absolute w-4 -ml-2 cursor-default overflow-visible"
            style={{ left: leftPx, height: viewportHeight }}
            onMouseEnter={showTip}
            onMouseMove={showTip}
            onMouseLeave={() => onTipChange(null)}
            aria-label={tipLabel}
          >
            <div
              className={[
                "pointer-events-none absolute left-1/2 top-0 z-30 h-full w-px -translate-x-1/2 border-l border-dashed",
                achieved
                  ? "border-emerald-600 dark:border-emerald-400"
                  : "border-amber-600 dark:border-amber-400",
              ].join(" ")}
            />
          </div>
        );
      })}
    </div>
  );
}

function ToolbarTabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-900"
    >
      {options.map((option) => {
        const isActive = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.id)}
            className={[
              "rounded-md px-3 py-1.5 text-xs font-semibold transition",
              isActive
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ProjectGanttView({
  tasks,
  milestones = [],
  projectName = "Project",
  metricsById,
  onTaskClick,
  readOnly = false,
}: ProjectGanttViewProps) {
  const [groupMode, setGroupMode] = useState<GanttGroupMode>("task");
  const [scaleOverride, setScaleOverride] = useState<GanttTimelineScale | null>(
    null,
  );
  const [floatingTip, setFloatingTip] = useState<FloatingTip | null>(null);

  const groups = useMemo(() => buildGroups(tasks, groupMode), [tasks, groupMode]);
  const timelineDates = useMemo(
    () => collectTimelineDates(tasks, milestones),
    [tasks, milestones],
  );
  const paddedBounds = useMemo(
    () => computeTimelineBounds(timelineDates, 7),
    [timelineDates],
  );
  const autoScale = useMemo(
    () => chooseTimelineScale(paddedBounds.start, paddedBounds.end),
    [paddedBounds],
  );
  const scale = scaleOverride ?? autoScale;
  const columns = useMemo(
    () => buildTimelineColumns(paddedBounds.start, paddedBounds.end, scale),
    [paddedBounds, scale],
  );

  const timelineMinDate = columns[0]?.start ?? paddedBounds.start;
  const timelineMaxDate = columns[columns.length - 1]?.end ?? paddedBounds.end;

  // Day-proportional column widths. Scale up together if under the minimum so
  // bar %/px math and header columns always share the same total width.
  const pxPerDay =
    scale === "week" ? WEEK_COLUMN_WIDTH / 7 : MONTH_COLUMN_WIDTH / 30;
  const rawColumnWidths = columns.map((column) => {
    const days =
      differenceInCalendarDays(
        startOfDay(column.end),
        startOfDay(column.start),
      ) + 1;
    return Math.max(days * pxPerDay, pxPerDay * 4);
  });
  const rawTimelineWidth = rawColumnWidths.reduce((sum, width) => sum + width, 0);
  const timelineWidth = Math.max(rawTimelineWidth, 480);
  const widthScale =
    rawTimelineWidth > 0 ? timelineWidth / rawTimelineWidth : 1;
  const columnWidths = rawColumnWidths.map((width) => width * widthScale);
  // Visible strip under the sticky header inside max-h-[calc(100vh-280px)].
  const todayViewportHeight = `calc(100vh - 280px - ${HEADER_HEIGHT_PX}px)`;

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
        <p className="text-base font-medium text-zinc-900 dark:text-zinc-50">
          No tasks to chart yet
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {readOnly
            ? "This project has no dated tasks for the Gantt view."
            : "Add tasks with dates to see the timeline."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t-2 border-zinc-200 pt-4 dark:border-zinc-700">
      <FloatingTooltipPortal tip={floatingTip} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarTabs
            label="Gantt grouping"
            options={GROUP_OPTIONS}
            value={groupMode}
            onChange={setGroupMode}
          />
          <ToolbarTabs
            label="Timeline scale"
            options={SCALE_OPTIONS}
            value={scale}
            onChange={setScaleOverride}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-600 dark:text-zinc-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-sm bg-zinc-600" /> Initial
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-sm bg-sky-500" /> Updated
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-sm bg-emerald-500" /> Actual
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-px bg-red-500" /> Today
          </span>
          {milestones.length > 0 ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 border-l border-dashed border-amber-600 dark:border-amber-400" />{" "}
                Milestone (pending)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 border-l border-dashed border-emerald-600 dark:border-emerald-400" />{" "}
                Milestone (achieved)
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div
        className={`max-h-[calc(100vh-280px)] overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-700 ${paneBgClass}`}
      >
        <div className="flex min-w-max">
          {/* Sticky left rail: Task + Progress — above scrolling date header */}
          <div
            className={`sticky left-0 z-40 flex shrink-0 border-r border-zinc-200 shadow-[2px_0_6px_rgba(0,0,0,0.06)] dark:border-zinc-700 dark:shadow-[2px_0_6px_rgba(0,0,0,0.35)] ${LEFT_RAIL_WIDTH_CLASS} ${paneBgClass}`}
          >
            <div className={`flex shrink-0 flex-col ${TASK_PANE_WIDTH_CLASS}`}>
              <div
                className={`sticky top-0 left-0 z-50 flex h-12 items-center border-b border-r border-zinc-200 px-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400 ${paneBgClass}`}
              >
                Task
              </div>
              {groups.map((group) => (
                <div key={`task-${group.id}`}>
                  {group.label ? (
                    <div
                      className={`flex items-center border-r border-zinc-300 dark:border-zinc-700 ${processGroupHeaderClass}`}
                      style={{ height: GROUP_HEADER_HEIGHT_PX }}
                    >
                      <span className="break-words leading-snug">
                        {group.label}
                      </span>
                    </div>
                  ) : null}
                  {group.tasks.map((task) => {
                    const metrics = metricsById?.get(task.id);
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onTaskClick(task)}
                        className={`flex h-24 w-full flex-col justify-center gap-1 border-r border-zinc-200 px-3 py-1.5 text-left transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/80 ${gridRowBorder} ${paneBgClass}`}
                      >
                        <span
                          className="line-clamp-3 break-words text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50"
                          title={task.title}
                        >
                          {task.title}
                        </span>
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          {metrics ? (
                            <StatusFlagBadge flag={metrics.statusFlag} />
                          ) : null}
                          <span className="min-w-0 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                            {STATUS_LABELS[task.status]} ·{" "}
                            <PicLabel
                              task={task}
                              className="inline-flex"
                              showCustomTag={false}
                            />
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div
              className={`flex shrink-0 flex-col ${PROGRESS_PANE_WIDTH_CLASS}`}
            >
              <div
                className={`sticky top-0 z-50 flex h-12 items-center justify-center border-b border-zinc-200 px-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400 sm:text-xs ${paneBgClass}`}
              >
                Progress
              </div>
              {groups.map((group) => (
                <div key={`progress-${group.id}`}>
                  {group.label ? (
                    <div
                      className={processGroupHeaderClass}
                      style={{ height: GROUP_HEADER_HEIGHT_PX }}
                      aria-hidden
                    />
                  ) : null}
                  {group.tasks.map((task) => {
                    const metrics = metricsById?.get(task.id);
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onTaskClick(task)}
                        className={`flex h-24 w-full flex-col items-stretch justify-center px-1.5 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/80 ${gridRowBorder} ${paneBgClass}`}
                        aria-label={`Progress for ${task.title}`}
                      >
                        {metrics ? (
                          <ProgressPairBadges
                            actual={metrics.pActual}
                            target={metrics.pTarget}
                            layout="stack"
                          />
                        ) : (
                          <span className="text-center text-[10px] text-zinc-400">
                            —
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-0 overflow-visible" style={{ width: timelineWidth }}>
            {/* Sticky top date scale — above bars, below left-rail Progress header */}
            <div
              className={`sticky top-0 z-30 flex h-12 overflow-hidden border-b border-zinc-200 dark:border-zinc-700 ${paneBgClass}`}
            >
              {columns.map((column, index) => (
                <div
                  key={column.id}
                  className={`flex h-12 shrink-0 flex-col items-center justify-center px-1 ${gridColBorder}`}
                  style={{ width: columnWidths[index] }}
                >
                  <p className="text-[11px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
                    {column.label}
                  </p>
                  {column.subLabel ? (
                    <p className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                      {column.subLabel}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Today line: sticky vertically under header; pixel-aligned in month/week columns */}
            <TodayMarker
              columns={columns}
              columnWidths={columnWidths}
              viewportHeight={todayViewportHeight}
              onTipChange={setFloatingTip}
            />
            <MilestoneMarkers
              milestones={milestones}
              columns={columns}
              columnWidths={columnWidths}
              viewportHeight={todayViewportHeight}
              onTipChange={setFloatingTip}
            />

            <div className="relative z-0 overflow-visible">
              {groups.map((group) => (
                <div key={group.id} className="relative z-0 overflow-visible">
                  {group.label ? (
                    <div
                      className={processGroupHeaderClass}
                      style={{
                        height: GROUP_HEADER_HEIGHT_PX,
                        width: timelineWidth,
                      }}
                    />
                  ) : null}
                  {group.tasks.map((task) => (
                    <GanttTaskRow
                      key={task.id}
                      task={task}
                      projectName={projectName}
                      columns={columns}
                      columnWidths={columnWidths}
                      timelineWidth={timelineWidth}
                      onTaskClick={onTaskClick}
                      onTipChange={setFloatingTip}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tasks.some((task) => isTaskOverdue(task)) ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Schedule health uses Status Flags. Effective due date is updated due,
          else initial due.
        </p>
      ) : null}

      <p className="sr-only">
        Timeline scale {scale}; range{" "}
        {formatAuDateRange({
          start: timelineMinDate,
          end: timelineMaxDate,
          missingEndpoint: false,
          wasInverted: false,
          invalid: false,
        })}
      </p>
    </div>
  );
}
