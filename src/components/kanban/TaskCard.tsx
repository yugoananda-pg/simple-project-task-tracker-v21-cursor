"use client";

import { Draggable } from "@hello-pangea/dnd";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import ProgressPairBadges from "@/src/components/schedule/ProgressPairBadges";
import PicLabel from "@/src/components/tasks/PicLabel";
import type { TaskScheduleMetrics } from "@/src/lib/analytics/weighted-progress";
import {
  getTaskPicInitial,
  hasAssignedPic,
  isCustomPic,
} from "@/src/lib/assignee-display";
import { getEffectiveDueDate } from "@/src/lib/task-defaults";
import type { Task } from "@/src/lib/types";

export type TaskCardProps = {
  task: Task;
  index: number;
  metrics?: TaskScheduleMetrics;
  onClick?: (task: Task) => void;
  isDragDisabled?: boolean;
};

/** Format an ISO date (or YYYY-MM-DD) as DD/MM/YYYY (Australian English). */
function formatAuDate(value: string): string {
  const datePart = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function hasPic(task: Task): boolean {
  return hasAssignedPic(task);
}

export default function TaskCard({
  task,
  index,
  metrics,
  onClick,
  isDragDisabled = false,
}: TaskCardProps) {
  return (
    <Draggable
      draggableId={task.id}
      index={index}
      isDragDisabled={isDragDisabled}
    >
      {(provided, snapshot) => (
        <article
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...(isDragDisabled ? {} : provided.dragHandleProps)}
          role="button"
          tabIndex={0}
          onClick={() => onClick?.(task)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onClick?.(task);
            }
          }}
          className={[
            "group cursor-grab rounded-lg border bg-white p-3 shadow-sm transition",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900",
            "active:cursor-grabbing",
            snapshot.isDragging
              ? "border-zinc-300 shadow-md ring-2 ring-zinc-900/10"
              : "border-zinc-200 hover:border-zinc-300 hover:shadow-md",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug tracking-tight text-zinc-900">
              {task.title}
            </h3>
          </div>

          {metrics ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <StatusFlagBadge flag={metrics.statusFlag} />
            </div>
          ) : null}
          {metrics ? (
            <div className="mt-2">
              <ProgressPairBadges
                actual={metrics.pActual}
                target={metrics.pTarget}
              />
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {hasPic(task) ? (
                <span
                  className={[
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    isCustomPic(task)
                      ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                      : "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200",
                  ].join(" ")}
                  title={isCustomPic(task) ? "Unregistered PIC" : undefined}
                >
                  {getTaskPicInitial(task)}
                </span>
              ) : null}
              <PicLabel
                task={task}
                className="min-w-0 text-xs text-zinc-500"
                showCustomTag={false}
              />
            </span>
            <span className="shrink-0 tabular-nums">
              {getEffectiveDueDate(task)
                ? formatAuDate(getEffectiveDueDate(task)!)
                : "No due date"}
            </span>
          </div>
        </article>
      )}
    </Draggable>
  );
}
