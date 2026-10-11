"use client";

import { Draggable } from "@hello-pangea/dnd";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import ProgressPairBadges from "@/src/components/schedule/ProgressPairBadges";
import PicLabel, { PicAvatars } from "@/src/components/tasks/PicLabel";
import type { TaskScheduleMetrics } from "@/src/lib/analytics/weighted-progress";
import { hasAssignedPic } from "@/src/lib/assignee-display";
import { getEffectiveDueDate } from "@/src/lib/task-defaults";
import type { Task } from "@/src/lib/types";

export type KanbanDensity = "compact" | "comfortable";

export type TaskCardProps = {
  task: Task;
  index: number;
  metrics?: TaskScheduleMetrics;
  onClick?: (task: Task) => void;
  isDragDisabled?: boolean;
  density?: KanbanDensity;
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
  density = "comfortable",
}: TaskCardProps) {
  const compact = density === "compact";
  const due = getEffectiveDueDate(task);
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
            "group cursor-grab rounded-lg border bg-white shadow-sm transition",
            compact ? "p-2.5" : "p-3",
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
            <h3
              className={[
                "min-w-0 flex-1 font-semibold tracking-tight text-zinc-900",
                compact
                  ? "line-clamp-2 text-[13px] leading-snug"
                  : "text-sm leading-snug",
              ].join(" ")}
              title={task.title}
            >
              {task.title}
            </h3>
          </div>

          {metrics ? (
            <div
              className={[
                "flex flex-wrap items-center",
                compact ? "mt-1.5 gap-1" : "mt-2.5 gap-1.5",
              ].join(" ")}
            >
              <StatusFlagBadge flag={metrics.statusFlag} />
              {compact ? (
                <ProgressPairBadges
                  actual={metrics.pActual}
                  target={metrics.pTarget}
                  className="gap-1"
                />
              ) : null}
            </div>
          ) : null}
          {metrics && !compact ? (
            <div className="mt-2">
              <ProgressPairBadges
                actual={metrics.pActual}
                target={metrics.pTarget}
              />
            </div>
          ) : null}

          <div
            className={[
              "flex items-center justify-between gap-2 text-xs text-zinc-500",
              compact
                ? "mt-1.5"
                : "mt-3 border-t border-zinc-100 pt-2",
            ].join(" ")}
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {hasPic(task) ? <PicAvatars task={task} compact={compact} /> : null}
              {compact && hasPic(task) ? null : (
                <PicLabel
                  task={task}
                  className="min-w-0 text-xs text-zinc-500"
                  showCustomTag={false}
                  visibleNames={2}
                />
              )}
            </span>
            <span className="shrink-0 tabular-nums">
              {due ? formatAuDate(due) : "No due date"}
            </span>
          </div>
        </article>
      )}
    </Draggable>
  );
}
