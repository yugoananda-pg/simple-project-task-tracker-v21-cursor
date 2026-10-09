/**
 * Schedule composition beside the S-curve: status counts, planned effort
 * by process group, and tasks past their due date. Tasks only.
 */

import { differenceInCalendarDays } from "date-fns";

import { getTaskPicDisplayName } from "@/src/lib/assignee-display";
import { plannedWorkingDuration, type HolidaySet } from "@/src/lib/analytics/working-days";
import { resolveHolidaySet } from "@/src/lib/analytics/weighted-progress";
import { parseTaskDate } from "@/src/lib/gantt/date-utils";
import { getEffectiveDueDate, getEffectiveStartDate } from "@/src/lib/task-defaults";
import type { TaskBucket, TaskStatus } from "@/src/lib/types";

export type CompositionTask = {
  id: string;
  title: string;
  status: TaskStatus;
  bucket: TaskBucket;
  assigneeId: string | null;
  assigneeName: string;
  initialStartDate: string | null;
  initialDueDate: string | null;
  updatedStartDate: string | null;
  updatedDueDate: string | null;
  /** Set on portfolio roll-ups so an overdue row says which project it belongs to. */
  projectName?: string;
};

export type StatusSlice = {
  status: TaskStatus;
  label: string;
  count: number;
  colour: string;
};

export type EffortSlice = {
  bucket: TaskBucket;
  label: string;
  plannedDays: number;
};

export type OverdueRow = {
  id: string;
  title: string;
  pic: string;
  daysLate: number;
  projectName?: string;
};

export type ScheduleComposition = {
  statusCounts: StatusSlice[];
  effortByGroup: EffortSlice[];
  overdue: OverdueRow[];
  plannedDays: number;
};

const STATUS_META: Record<TaskStatus, { label: string; colour: string }> = {
  todo: { label: "To Do", colour: "#f59e0b" },
  in_progress: { label: "Doing", colour: "#0ea5e9" },
  done: { label: "Done", colour: "#10b981" },
};

const GROUP_LABEL: Record<TaskBucket, string> = {
  initiating: "Initiating",
  planning: "Planning",
  executing: "Executing",
  monitoring: "Monitoring",
  closing: "Closing",
};

const GROUP_ORDER: TaskBucket[] = [
  "initiating",
  "planning",
  "executing",
  "monitoring",
  "closing",
];

export function calendarDaysLate(due: string, today: string): number {
  const dueDate = parseTaskDate(due);
  const todayDate = parseTaskDate(today);
  if (!dueDate || !todayDate) return 0;
  return Math.max(differenceInCalendarDays(todayDate, dueDate), 0);
}

export function buildScheduleComposition(input: {
  tasks: readonly CompositionTask[];
  holidayKeys: readonly string[];
  today: string;
  holidays?: HolidaySet;
}): ScheduleComposition {
  const holidays = input.holidays ?? resolveHolidaySet(input.holidayKeys);

  const statusCounts = (Object.keys(STATUS_META) as TaskStatus[]).map(
    (status) => ({
      status,
      label: STATUS_META[status].label,
      count: input.tasks.filter((task) => task.status === status).length,
      colour: STATUS_META[status].colour,
    }),
  );

  const effortByGroup = GROUP_ORDER.map((bucket) => {
    const plannedDays = input.tasks
      .filter((task) => task.bucket === bucket)
      .reduce((sum, task) => {
        return (
          sum +
          plannedWorkingDuration(
            getEffectiveStartDate(task),
            getEffectiveDueDate(task),
            holidays,
          )
        );
      }, 0);
    return { bucket, label: GROUP_LABEL[bucket], plannedDays };
  });

  const overdue = input.tasks
    .flatMap((task) => {
      if (task.status === "done") return [];
      const due = getEffectiveDueDate(task);
      if (!due || due >= input.today) return [];
      const daysLate = calendarDaysLate(due, input.today);
      if (daysLate <= 0) return [];
      return [
        {
          id: task.id,
          title: task.title,
          pic: getTaskPicDisplayName(task),
          daysLate,
          projectName: task.projectName,
        },
      ];
    })
    .sort((a, b) => b.daysLate - a.daysLate || a.title.localeCompare(b.title));

  return {
    statusCounts,
    effortByGroup,
    overdue,
    plannedDays: effortByGroup.reduce((sum, row) => sum + row.plannedDays, 0),
  };
}
