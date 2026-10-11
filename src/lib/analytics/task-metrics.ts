import { differenceInCalendarDays, startOfDay } from "date-fns";

import {
  getTaskPicDisplayName,
  getTaskPicKeys,
  hasAssignedPic,
  isCustomPic,
  listTaskPics,
  picLabel,
} from "@/src/lib/assignee-display";
import { isTaskOverdue, parseTaskDate } from "@/src/lib/gantt/date-utils";
import type { Task, TaskBucket, TaskStatus } from "@/src/lib/types";

export type StatusCount = {
  status: TaskStatus;
  label: string;
  count: number;
  colour: string;
};

export type WorkloadRow = {
  assigneeKey: string;
  assigneeLabel: string;
  isCustomPic: boolean;
  open: number;
  completed: number;
  total: number;
};

export type ProcessGroupRow = {
  bucket: TaskBucket;
  label: string;
  total: number;
  completed: number;
  completionPercent: number;
};

export type OverdueTaskRow = {
  task: Task;
  assigneeLabel: string;
  isCustomPic: boolean;
  daysOverdue: number;
  dueDateLabel: string;
};

export type ProjectAnalyticsSnapshot = {
  totalTasks: number;
  completedCount: number;
  completionPercent: number;
  overdueCount: number;
  activeAssigneeCount: number;
  statusCounts: StatusCount[];
  workloadRows: WorkloadRow[];
  processGroupRows: ProcessGroupRow[];
  overdueTasks: OverdueTaskRow[];
};

const STATUS_META: Record<
  TaskStatus,
  { label: string; colour: string }
> = {
  todo: { label: "To Do", colour: "#f59e0b" },
  in_progress: { label: "Doing", colour: "#0ea5e9" },
  done: { label: "Done", colour: "#10b981" },
};

const PROCESS_GROUP_LABELS: Record<TaskBucket, string> = {
  initiating: "Initiating",
  planning: "Planning",
  executing: "Executing",
  monitoring: "Monitoring",
  closing: "Closing",
};

const PROCESS_GROUP_ORDER: TaskBucket[] = [
  "initiating",
  "planning",
  "executing",
  "monitoring",
  "closing",
];

export function daysOverdue(task: Task): number {
  if (task.status === "done") return 0;
  const due = parseTaskDate(
    task.updatedDueDate ?? task.initialDueDate,
  );
  if (!due) return 0;
  return Math.max(
    differenceInCalendarDays(startOfDay(new Date()), due),
    0,
  );
}

export function computeProjectAnalytics(tasks: Task[]): ProjectAnalyticsSnapshot {
  const totalTasks = tasks.length;
  const completedCount = tasks.filter((task) => task.status === "done").length;
  const completionPercent =
    totalTasks === 0 ? 0 : Math.round((completedCount / totalTasks) * 100);

  const overdueTasks = tasks
    .filter((task) => isTaskOverdue(task))
    .map((task) => ({
      task,
      assigneeLabel: getTaskPicDisplayName(task),
      isCustomPic: isCustomPic(task),
      daysOverdue: daysOverdue(task),
      dueDateLabel:
        (task.updatedDueDate ?? task.initialDueDate)?.slice(0, 10) ?? "—",
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const activeAssigneeKeys = new Set(
    tasks
      .filter((task) => task.status !== "done" && hasAssignedPic(task))
      .flatMap((task) => getTaskPicKeys(task)),
  );

  const statusCounts = (Object.keys(STATUS_META) as TaskStatus[]).map(
    (status) => ({
      status,
      label: STATUS_META[status].label,
      count: tasks.filter((task) => task.status === status).length,
      colour: STATUS_META[status].colour,
    }),
  );

  const workloadMap = new Map<string, WorkloadRow>();
  for (const task of tasks) {
    const pics = listTaskPics(task);
    const keys = getTaskPicKeys(task);
    for (const key of keys) {
      const pic = pics.find((item) => {
        if (key.startsWith("user:")) return `user:${item.userId}` === key;
        if (key.startsWith("custom:")) return `custom:${item.name.toLowerCase()}` === key;
        return false;
      });
      const existing = workloadMap.get(key) ?? {
        assigneeKey: key,
        assigneeLabel: pic ? picLabel(pic) : getTaskPicDisplayName(task),
        isCustomPic: pic ? !pic.userId : isCustomPic(task),
        open: 0,
        completed: 0,
        total: 0,
      };

      existing.total += 1;
      if (task.status === "done") {
        existing.completed += 1;
      } else {
        existing.open += 1;
      }
      workloadMap.set(key, existing);
    }
  }

  const workloadRows = [...workloadMap.values()].sort((a, b) => {
    if (a.assigneeKey === "__unassigned__") return 1;
    if (b.assigneeKey === "__unassigned__") return -1;
    return b.total - a.total;
  });

  const processGroupRows = PROCESS_GROUP_ORDER.map((bucket) => {
    const groupTasks = tasks.filter((task) => task.bucket === bucket);
    const total = groupTasks.length;
    const completed = groupTasks.filter((task) => task.status === "done").length;
    const completionPercent =
      total === 0 ? 0 : Math.round((completed / total) * 100);

    return {
      bucket,
      label: PROCESS_GROUP_LABELS[bucket],
      total,
      completed,
      completionPercent,
    };
  });

  return {
    totalTasks,
    completedCount,
    completionPercent,
    overdueCount: overdueTasks.length,
    activeAssigneeCount: activeAssigneeKeys.size,
    statusCounts,
    workloadRows,
    processGroupRows,
    overdueTasks,
  };
}
