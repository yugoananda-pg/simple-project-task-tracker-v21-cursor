"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronRight } from "lucide-react";

import TaskNameTip from "@/src/components/ui/TaskNameTip";
import { differenceInCalendarDays, startOfDay } from "date-fns";

import {
  getTaskPicKeys,
  listTaskPics,
  picLabel,
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
import ExpandViewButton from "@/src/components/ui/ExpandViewButton";
import SegmentedControl from "@/src/components/ui/SegmentedControl";
import { useStoredChoice } from "@/src/lib/ui/use-stored-choice";

export type ProjectGanttViewProps = {
  tasks: Task[];
  milestones?: Milestone[];
  metricsById?: ReadonlyMap<string, TaskScheduleMetrics>;
  onTaskClick: (task: Task) => void;
  readOnly?: boolean;
  /** Expanded view: the page hides the project header so the chart can be taller. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
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

/**
 * Row sizes. The three bars (Initial, Updated, Actual) are centred in the row,
 * `step` pixels apart. Comfortable shows the full task label; Compact fits
 * roughly a third more rows on screen.
 */
export type GanttDensity = "comfortable" | "compact";
type DensitySpec = {
  row: number;
  group: number;
  bar: number;
  step: number;
  /** Top of the Initial bar. Updated and Actual follow at `step` intervals. */
  top: number;
  node: string;
  check: string;
};
const DENSITY: Record<GanttDensity, DensitySpec> = {
  comfortable: { row: 60, group: 30, bar: 8, step: 15, top: 11, node: "size-3.5", check: "size-2.5" },
  compact: { row: 44, group: 26, bar: 6, step: 11, top: 8, node: "size-3", check: "size-2" },
};
const DENSITY_OPTIONS: ReadonlyArray<{ id: GanttDensity; label: string; title: string }> = [
  { id: "comfortable", label: "Comfortable", title: "Taller rows with the full task label" },
  { id: "compact", label: "Compact", title: "Shorter rows so more tasks fit on screen" },
];
const DENSITY_IDS: ReadonlyArray<GanttDensity> = ["comfortable", "compact"];
/** Horizontal offset (px) when a milestone lands on Today so both lines stay readable. */
const MILESTONE_TODAY_OFFSET_PX = 4;
/** Only the Task column stays frozen while the chart scrolls sideways. */
const TASK_PANE_WIDTH_CLASS = "w-[17rem] sm:w-[20rem]";
const PROGRESS_PANE_WIDTH_CLASS = "w-[6.75rem]";

const BUCKET_RANK: Record<TaskBucket, number> = {
  initiating: 0,
  planning: 1,
  executing: 2,
  monitoring: 3,
  closing: 4,
};

/** Same order as the List table: process group, then the saved row order. */
function compareListOrder(a: Task, b: Task): number {
  const bucketDelta = BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket];
  if (bucketDelta !== 0) return bucketDelta;
  if (a.listSortOrder !== b.listSortOrder) {
    return a.listSortOrder - b.listSortOrder;
  }
  return a.title.localeCompare(b.title);
}

const paneBgClass = "bg-white dark:bg-zinc-900";
const gridColBorder = "border-r border-zinc-200 dark:border-zinc-700/60";
const gridRowBorder = "border-b border-zinc-200 dark:border-zinc-800";
const processGroupHeaderClass =
  "border-y border-zinc-300 bg-zinc-200/90 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-200";

function buildGroups(tasks: Task[], mode: GanttGroupMode): GanttGroup[] {
  if (mode === "assignee") {
    const buckets = new Map<string, { label: string; tasks: Task[] }>();
    for (const task of tasks) {
      const pics = listTaskPics(task);
      const keys = getTaskPicKeys(task);
      for (const key of keys) {
        const pic = pics.find((item) => {
          if (key === "__unassigned__") return false;
          return (
            (item.userId && key === `user:${item.userId}`) ||
            key === `custom:${item.name.toLowerCase()}`
          );
        });
        const label =
          key === "__unassigned__" ? "Unassigned" : pic ? picLabel(pic) : key;
        const bucket = buckets.get(key) ?? { label, tasks: [] };
        bucket.tasks.push(task);
        buckets.set(key, bucket);
      }
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => {
        if (a === "__unassigned__") return 1;
        if (b === "__unassigned__") return -1;
        return a.localeCompare(b);
      })
      .map(([key, group]) => ({
        id: key,
        label: group.label,
        tasks: [...group.tasks].sort((a, b) => a.title.localeCompare(b.title)),
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
      tasks: [...(buckets.get(bucket) ?? [])].sort(compareListOrder),
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

function buildBarTooltip(kind: TimelineBarKind, task: Task): string {
  const name = task.title.trim();
  if (kind === "initial") {
    return [
      name,
      `Initial Start Date: ${formatAuDate(task.initialStartDate)}`,
      `Initial Due Date: ${formatAuDate(task.initialDueDate)}`,
    ].join("\n");
  }
  if (kind === "updated") {
    return [
      name,
      `Updated Start Date: ${formatAuDate(task.updatedStartDate)}`,
      `Updated Due Date: ${formatAuDate(task.updatedDueDate)}`,
    ].join("\n");
  }
  const completion =
    task.status === "done"
      ? formatAuDate(task.actualCompletionDate)
      : "In Progress";
  return [
    name,
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
      className="pointer-events-none fixed z-50 w-max max-w-[18rem] -translate-x-1/2 -translate-y-full whitespace-pre-line break-words rounded-md bg-zinc-900 px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.label}
    </div>,
    document.body,
  );
}

type TimelineBarProps = {
  task: Task;
  kind: TimelineBarKind;
  range: GanttDateRange | null;
  columns: GanttTimelineColumn[];
  columnWidths: number[];
  topPx: number;
  spec: DensitySpec;
  barClassName: string;
  onTaskClick: (task: Task) => void;
  onTipChange: (tip: FloatingTip | null) => void;
  readOnly?: boolean;
};

function TimelineBar({
  task,
  kind,
  range,
  columns,
  columnWidths,
  topPx,
  spec,
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

  const tooltip = buildBarTooltip(kind, task);
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
      aria-label={`${tooltip.replaceAll("\n", ". ")}${readOnly ? " (read-only)" : ""}`}
      className={[
        "absolute z-0 overflow-visible rounded-sm transition hover:z-[5] hover:brightness-110 focus-visible:z-[5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100",
        isActual && isSingleDay ? "min-w-0" : "min-w-[8px]",
        barClassName,
      ].join(" ")}
      style={{
        left: leftPx,
        width: widthPx,
        height: spec.bar,
        top: topPx,
      }}
    >
      {showNode ? (
        <span
          className={[
            // Done and in-progress: node sits on the bar’s right end (same X as line end).
            `absolute right-0 top-1/2 flex ${spec.node} translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-sm`,
            showCheck
              ? "border-2 border-emerald-950 bg-emerald-400 dark:border-emerald-950 dark:bg-emerald-300"
              : "border-2 border-white bg-emerald-500 dark:border-zinc-950 dark:bg-emerald-400",
          ].join(" ")}
        >
          {showCheck ? (
            <Check
              className={`${spec.check} text-emerald-950`}
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
  columns: GanttTimelineColumn[];
  columnWidths: number[];
  timelineWidth: number;
  spec: DensitySpec;
  onTaskClick: (task: Task) => void;
  onTipChange: (tip: FloatingTip | null) => void;
  readOnly?: boolean;
};

function GanttTaskRow({
  task,
  columns,
  columnWidths,
  timelineWidth,
  spec,
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
      className={`relative z-0 overflow-visible bg-white dark:bg-zinc-950 ${gridRowBorder}`}
      style={{ width: timelineWidth, height: spec.row }}
    >
      {!hasAny ? (
        <div className="absolute inset-0 flex items-center px-3">
          <span className="text-[11px] text-zinc-400">No dates set</span>
        </div>
      ) : (
        <>
          <TimelineBar
            task={task}
            kind="initial"
            range={initial}
            columns={columns}
            columnWidths={columnWidths}
            topPx={spec.top}
            spec={spec}
            barClassName="bg-zinc-600 dark:bg-zinc-500"
            onTaskClick={onTaskClick}
            onTipChange={onTipChange}
            readOnly={readOnly}
          />
          <TimelineBar
            task={task}
            kind="updated"
            range={updated}
            columns={columns}
            columnWidths={columnWidths}
            topPx={spec.top + spec.step}
            spec={spec}
            barClassName="bg-sky-500 dark:bg-sky-400"
            onTaskClick={onTaskClick}
            onTipChange={onTipChange}
            readOnly={readOnly}
          />
          <TimelineBar
            task={task}
            kind="actual"
            range={actual}
            columns={columns}
            columnWidths={columnWidths}
            topPx={spec.top + spec.step * 2}
            spec={spec}
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

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function TodayMarker({
  columns,
  columnWidths,
  bodyHeightPx,
  colocatedMilestoneNames,
  onTipChange,
}: {
  columns: GanttTimelineColumn[];
  columnWidths: number[];
  /** Height of task/group rows only — line ends at the table bottom, not empty chrome. */
  bodyHeightPx: number;
  colocatedMilestoneNames: string[];
  onTipChange: (tip: FloatingTip | null) => void;
}) {
  const today = startOfDay(new Date());
  if (columns.length === 0 || bodyHeightPx <= 0) return null;

  const rangeStart = startOfDay(columns[0]!.start);
  const rangeEnd = startOfDay(columns[columns.length - 1]!.end);
  if (today < rangeStart || today > rangeEnd) return null;

  const leftPx = getTimelineOffsetPx(today, columns, columnWidths);
  const tipLabel =
    colocatedMilestoneNames.length > 0
      ? `We're here — ${formatAuDate(today)} · Also: ${colocatedMilestoneNames.join(", ")}`
      : `We're here — ${formatAuDate(today)}`;

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
        style={{ left: leftPx, height: bodyHeightPx }}
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
  bodyHeightPx,
  today,
  onTipChange,
}: {
  milestones: Milestone[];
  columns: GanttTimelineColumn[];
  columnWidths: number[];
  bodyHeightPx: number;
  today: Date;
  onTipChange: (tip: FloatingTip | null) => void;
}) {
  if (columns.length === 0 || milestones.length === 0 || bodyHeightPx <= 0) {
    return null;
  }

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
        const sharesToday = isSameCalendarDay(anchor, today);
        const leftPx =
          getTimelineOffsetPx(anchor, columns, columnWidths) -
          (sharesToday ? MILESTONE_TODAY_OFFSET_PX : 0);
        const tipLabel = [
          milestone.name,
          achieved
            ? `Achieved ${formatAuDate(milestone.actualAchieved)}`
            : `Target ${formatAuDate(milestone.updatedTarget)}`,
          sharesToday ? "Same day as Today" : null,
        ]
          .filter(Boolean)
          .join(" — ");

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
            style={{ left: leftPx, height: bodyHeightPx }}
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

export default function ProjectGanttView({
  tasks,
  milestones = [],
  metricsById,
  onTaskClick,
  readOnly = false,
  expanded = false,
  onToggleExpanded,
}: ProjectGanttViewProps) {
  const [groupMode, setGroupMode] = useState<GanttGroupMode>("task");
  const [scaleOverride, setScaleOverride] = useState<GanttTimelineScale | null>(
    null,
  );
  const [density, setDensity] = useStoredChoice<GanttDensity>(
    "sptt.gantt.density",
    DENSITY_IDS,
    "comfortable",
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [floatingTip, setFloatingTip] = useState<FloatingTip | null>(null);
  const spec = DENSITY[density];

  // Width left for the timeline once the frozen Task and Progress columns are
  // placed. A short schedule stretches to fill it instead of leaving blank space.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const taskPaneRef = useRef<HTMLDivElement>(null);
  const progressPaneRef = useRef<HTMLDivElement>(null);
  const [availablePx, setAvailablePx] = useState(0);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const measure = () => {
      const used =
        (taskPaneRef.current?.offsetWidth ?? 0) +
        (progressPaneRef.current?.offsetWidth ?? 0);
      setAvailablePx(Math.max(0, scroller.clientWidth - used - 2));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [tasks.length]);

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
  const timelineWidth = Math.max(rawTimelineWidth, 480, availablePx);
  const widthScale =
    rawTimelineWidth > 0 ? timelineWidth / rawTimelineWidth : 1;
  const columnWidths = rawColumnWidths.map((width) => width * widthScale);
  const today = startOfDay(new Date());

  // A collapsed group keeps its header row and hides its tasks.
  const visibleTasks = (group: GanttGroup): Task[] =>
    group.label && collapsed.has(group.id) ? [] : group.tasks;
  const bodyHeightPx = groups.reduce((sum, group) => {
    return (
      sum +
      (group.label ? spec.group : 0) +
      visibleTasks(group).length * spec.row
    );
  }, 0);
  const collapsibleIds = groups.filter((g) => g.label).map((g) => g.id);
  const allCollapsed =
    collapsibleIds.length > 0 && collapsibleIds.every((id) => collapsed.has(id));
  function toggleGroup(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const colocatedMilestoneNames = milestones
    .filter((milestone) => {
      const anchor = parseTaskDate(
        milestone.actualAchieved ?? milestone.updatedTarget,
      );
      return anchor ? isSameCalendarDay(anchor, today) : false;
    })
    .map((milestone) => milestone.name);

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

  const compact = density === "compact";

  return (
    <div className="space-y-3 border-t-2 border-zinc-200 pt-3 dark:border-zinc-700">
      <FloatingTooltipPortal tip={floatingTip} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Gantt grouping"
            options={GROUP_OPTIONS}
            value={groupMode}
            onChange={setGroupMode}
          />
          <SegmentedControl
            label="Timeline scale"
            options={SCALE_OPTIONS}
            value={scale}
            onChange={setScaleOverride}
          />
          <SegmentedControl
            label="Row height"
            options={DENSITY_OPTIONS}
            value={density}
            onChange={setDensity}
          />
          {collapsibleIds.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setCollapsed(allCollapsed ? new Set() : new Set(collapsibleIds))
              }
              className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {allCollapsed ? "Expand all groups" : "Collapse all groups"}
            </button>
          ) : null}
          {onToggleExpanded ? (
            <ExpandViewButton expanded={expanded} onToggle={onToggleExpanded} />
          ) : null}
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
          {colocatedMilestoneNames.length > 0 ? (
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Milestone on Today is offset slightly so both lines stay visible.
            </span>
          ) : null}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className={`overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-700 ${paneBgClass} ${
          expanded
            ? "max-h-[calc(100dvh-14.5rem)]"
            : "max-h-[calc(100dvh-6rem)]"
        }`}
      >
        <div className="flex min-w-max">
          {/* Frozen Task column. Progress scrolls with the timeline. */}
          <div
            ref={taskPaneRef}
            className={`sticky left-0 z-40 flex shrink-0 flex-col border-r border-zinc-200 shadow-[2px_0_6px_rgba(0,0,0,0.06)] dark:border-zinc-700 dark:shadow-[2px_0_6px_rgba(0,0,0,0.35)] ${TASK_PANE_WIDTH_CLASS} ${paneBgClass}`}
          >
            <div
              className={`sticky top-0 left-0 z-50 flex h-12 items-center border-b border-r border-zinc-200 px-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400 ${paneBgClass}`}
            >
              Task
            </div>
            {groups.map((group) => (
              <div key={`task-${group.id}`}>
                {group.label ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={!collapsed.has(group.id)}
                    title={
                      collapsed.has(group.id)
                        ? `Show ${group.tasks.length} tasks`
                        : "Hide these tasks"
                    }
                    className={`flex w-full items-center gap-1.5 border-r border-zinc-300 text-left transition hover:bg-zinc-300/60 dark:border-zinc-700 dark:hover:bg-zinc-700/70 ${processGroupHeaderClass}`}
                    style={{ height: spec.group }}
                  >
                    {collapsed.has(group.id) ? (
                      <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                    ) : (
                      <ChevronDown className="size-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate leading-snug">
                      {group.label}
                    </span>
                    <span className="shrink-0 rounded-full bg-white/70 px-1.5 text-[10px] font-semibold tabular-nums dark:bg-zinc-950/50">
                      {group.tasks.length}
                    </span>
                  </button>
                ) : null}
                {visibleTasks(group).map((task) => {
                  const metrics = metricsById?.get(task.id);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onTaskClick(task)}
                      style={{ height: spec.row }}
                      className={`flex w-full flex-col justify-center border-r border-zinc-200 px-3 text-left transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/80 ${compact ? "gap-0.5" : "gap-1"} ${gridRowBorder} ${paneBgClass}`}
                    >
                      <TaskNameTip name={task.title}>
                        <span
                          className={`line-clamp-1 break-words font-semibold text-zinc-900 dark:text-zinc-50 ${compact ? "text-[13px] leading-4" : "text-sm leading-5"}`}
                        >
                          {task.title}
                        </span>
                      </TaskNameTip>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {metrics ? (
                          <StatusFlagBadge
                            flag={metrics.statusFlag}
                            className={`shrink-0 ${compact ? "py-0 text-[9px] leading-4" : ""}`}
                          />
                        ) : null}
                        <span className="min-w-0 truncate text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                          {STATUS_LABELS[task.status]} ·{" "}
                          <PicLabel
                            task={task}
                            className="inline-flex"
                            showCustomTag={false}
                            visibleNames={1}
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
            ref={progressPaneRef}
            className={`flex shrink-0 flex-col ${PROGRESS_PANE_WIDTH_CLASS}`}
          >
            <div
              className={`sticky top-0 z-20 flex h-12 items-center justify-center border-b border-zinc-200 px-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400 sm:text-xs ${paneBgClass}`}
            >
              Progress
            </div>
            {groups.map((group) => (
              <div key={`progress-${group.id}`}>
                {group.label ? (
                  <div
                    className={processGroupHeaderClass}
                    style={{ height: spec.group }}
                    aria-hidden
                  />
                ) : null}
                {visibleTasks(group).map((task) => {
                  const metrics = metricsById?.get(task.id);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onTaskClick(task)}
                      style={{ height: spec.row }}
                      className={`flex w-full flex-col items-stretch justify-center px-1.5 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/80 ${gridRowBorder} ${paneBgClass}`}
                      aria-label={`Progress for ${task.title}`}
                    >
                      {metrics ? (
                        <ProgressPairBadges
                          actual={metrics.pActual}
                          target={metrics.pTarget}
                          layout="stack"
                          size={compact ? "sm" : "md"}
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

            {/* Today / milestone lines: height = table body so they end on the last row */}
            <TodayMarker
              columns={columns}
              columnWidths={columnWidths}
              bodyHeightPx={bodyHeightPx}
              colocatedMilestoneNames={colocatedMilestoneNames}
              onTipChange={setFloatingTip}
            />
            <MilestoneMarkers
              milestones={milestones}
              columns={columns}
              columnWidths={columnWidths}
              bodyHeightPx={bodyHeightPx}
              today={today}
              onTipChange={setFloatingTip}
            />

            <div className="relative z-0 overflow-visible">
              {groups.map((group) => (
                <div key={group.id} className="relative z-0 overflow-visible">
                  {group.label ? (
                    <div
                      className={processGroupHeaderClass}
                      style={{
                        height: spec.group,
                        width: timelineWidth,
                      }}
                    />
                  ) : null}
                  {visibleTasks(group).map((task) => (
                    <GanttTaskRow
                      key={task.id}
                      task={task}
                      columns={columns}
                      columnWidths={columnWidths}
                      timelineWidth={timelineWidth}
                      spec={spec}
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
