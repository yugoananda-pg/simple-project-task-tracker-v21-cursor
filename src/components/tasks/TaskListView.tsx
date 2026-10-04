"use client";

import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import {
  formatPercent1,
  type TaskScheduleMetrics,
} from "@/src/lib/analytics/weighted-progress";
import { getEffectiveDueDate } from "@/src/lib/task-defaults";
import type { Task, TaskPriority, TaskStatus } from "@/src/lib/types";

export type TaskListViewProps = {
  tasks: Task[];
  metricsById?: ReadonlyMap<string, TaskScheduleMetrics>;
  onTaskClick: (task: Task) => void;
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void;
  canChangeStatus?: (task: Task) => boolean;
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "Doing",
  done: "Done",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100",
  in_progress:
    "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-100",
  done: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: "Urgent",
  important: "Important",
  medium: "Medium",
  low: "Low",
};

function formatAuDate(value: string | null): string {
  if (!value) return "No due date";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export default function TaskListView({
  tasks,
  metricsById,
  onTaskClick,
  onStatusChange,
  canChangeStatus,
}: TaskListViewProps) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
        <p className="text-base font-medium text-zinc-900 dark:text-zinc-50">
          No tasks yet
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Add a task to start tracking this project.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-950">
      {tasks.map((task) => {
        const metrics = metricsById?.get(task.id);
        return (
          <li key={task.id}>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => onTaskClick(task)}
                className="min-w-0 flex-1 text-left transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {task.title}
                  </h3>
                  {metrics ? (
                    <StatusFlagBadge flag={metrics.statusFlag} />
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Due {formatAuDate(getEffectiveDueDate(task))} ·{" "}
                  {PRIORITY_LABELS[task.priority]} · {task.progress}%
                  {metrics ? (
                    <>
                      {" "}
                      · {metrics.dPlanned} working day
                      {metrics.dPlanned === 1 ? "" : "s"} · Weight{" "}
                      {formatPercent1(metrics.weightPercent)} · Target{" "}
                      {formatPercent1(metrics.pTarget)} · PS{" "}
                      {formatPercent1(metrics.ps)}
                    </>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Created by {task.createdByName} ·{" "}
                  {task.createdAt.slice(0, 19).replace("T", " ")}
                  {" · "}
                  Updated by {task.updatedByName} ·{" "}
                  {task.updatedAt.slice(0, 19).replace("T", " ")}
                </p>
              </button>

              <label className="sr-only" htmlFor={`status-${task.id}`}>
                Status for {task.title}
              </label>
              <select
                id={`status-${task.id}`}
                value={task.status}
                disabled={
                  !onStatusChange ||
                  (canChangeStatus ? !canChangeStatus(task) : false)
                }
                onChange={(event) =>
                  onStatusChange?.(task.id, event.target.value as TaskStatus)
                }
                className={[
                  "w-full rounded-lg border px-3 py-2 text-xs font-semibold sm:w-auto",
                  STATUS_STYLES[task.status],
                ].join(" ")}
              >
                {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
