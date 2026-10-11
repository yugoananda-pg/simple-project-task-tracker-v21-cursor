"use client";

import { useEffect, useRef, useState } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { ArrowUp, Plus } from "lucide-react";
import type { Task, TaskStatus } from "@/src/lib/types";
import type { TaskScheduleMetrics } from "@/src/lib/analytics/weighted-progress";
import TaskCard, { type KanbanDensity } from "./TaskCard";

export type KanbanColumnProps = {
  id: TaskStatus;
  title: string;
  tasks: Task[];
  metricsById?: ReadonlyMap<string, TaskScheduleMetrics>;
  onTaskClick?: (task: Task) => void;
  onAddTask?: () => void;
  addTaskHint?: string;
  readOnly?: boolean;
  density?: KanbanDensity;
  expanded?: boolean;
};

export default function KanbanColumn({
  id,
  title,
  tasks,
  metricsById,
  onTaskClick,
  onAddTask,
  addTaskHint,
  readOnly = false,
  density = "compact",
  expanded = false,
}: KanbanColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    function handleScroll() {
      setShowScrollTop((node?.scrollTop ?? 0) > 160);
    }

    handleScroll();
    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => node.removeEventListener("scroll", handleScroll);
  }, [tasks.length]);

  return (
    <section
      className={`relative flex min-h-[24rem] w-full min-w-[16.5rem] flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/40 ${
        expanded
          ? "h-[calc(100dvh-15rem)]"
          : "h-[calc(100dvh-9rem)]"
      }`}
    >
      <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/95 px-3 py-2 backdrop-blur sm:px-4 dark:border-zinc-700 dark:bg-zinc-900/95">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          <span
            className="inline-flex min-w-6 items-center justify-center rounded-full bg-zinc-200/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            aria-label={`${tasks.length} tasks`}
          >
            {tasks.length}
          </span>
        </div>
        {onAddTask && !readOnly ? (
          <button
            type="button"
            onClick={onAddTask}
            title={addTaskHint}
            aria-label={`Add task to ${title}`}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            <Plus className="size-3.5" aria-hidden />
            Add
          </button>
        ) : null}
      </header>

      <Droppable droppableId={id}>
        {(provided, snapshot) => (
          <div
            ref={(node) => {
              provided.innerRef(node);
              scrollRef.current = node;
            }}
            {...provided.droppableProps}
            className={[
              density === "compact"
                ? "relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2"
                : "relative flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5 sm:p-3",
              "transition-colors",
              snapshot.isDraggingOver ? "bg-sky-50/70 dark:bg-sky-950/30" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {tasks.length === 0 ? (
              <div
                className={[
                  "flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-8 text-center text-xs",
                  snapshot.isDraggingOver
                    ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
                    : "border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500",
                ].join(" ")}
              >
                {snapshot.isDraggingOver
                  ? "Drop task here"
                  : "No tasks in this column"}
              </div>
            ) : (
              tasks.map((task, index) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  metrics={metricsById?.get(task.id)}
                  onClick={onTaskClick}
                  isDragDisabled={readOnly}
                  density={density}
                />
              ))
            )}
            {provided.placeholder}

            {showScrollTop ? (
              <button
                type="button"
                onClick={() =>
                  scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                }
                className="sticky bottom-2 z-10 ml-auto inline-flex size-9 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                aria-label={`Scroll ${title} column to top`}
                title="Scroll to top"
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        )}
      </Droppable>
    </section>
  );
}
