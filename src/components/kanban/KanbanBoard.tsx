"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  DragDropContext,
  type DropResult,
} from "@hello-pangea/dnd";
import type { Task, TaskStatus } from "@/src/lib/types";
import type { TaskScheduleMetrics } from "@/src/lib/analytics/weighted-progress";
import { defaultProgressForStatus } from "@/src/lib/task-defaults";
import KanbanColumn from "./KanbanColumn";

export type KanbanBoardProps = {
  tasks: Task[];
  metricsById?: ReadonlyMap<string, TaskScheduleMetrics>;
  onStatusChange?: (
    taskId: string,
    newStatus: TaskStatus,
  ) => Promise<boolean> | boolean | void;
  onReorder?: (input: {
    taskId: string;
    sourceStatus: TaskStatus;
    destinationStatus: TaskStatus;
    sourceIndex: number;
    destinationIndex: number;
  }) => void;
  onTaskClick?: (task: Task) => void;
  onAddTask?: (status: TaskStatus) => void;
  readOnly?: boolean;
};

const COLUMNS: ReadonlyArray<{ id: TaskStatus; title: string }> = [
  { id: "todo", title: "To Do" },
  { id: "in_progress", title: "Doing" },
  { id: "done", title: "Done" },
];

const VALID_STATUSES = new Set<TaskStatus>(["todo", "in_progress", "done"]);

function isTaskStatus(value: string): value is TaskStatus {
  return VALID_STATUSES.has(value as TaskStatus);
}

function subscribeNever() {
  return () => {};
}

function sortColumnTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Interactive Kanban board (F-201).
 * Client-only gate via useSyncExternalStore avoids SSR/hydration mismatches.
 */
export default function KanbanBoard({
  tasks,
  metricsById,
  onStatusChange,
  onReorder,
  onTaskClick,
  onAddTask,
  readOnly = false,
}: KanbanBoardProps) {
  const isReady = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };

    for (const task of tasks) {
      grouped[task.status].push(task);
    }

    return {
      todo: sortColumnTasks(grouped.todo),
      in_progress: sortColumnTasks(grouped.in_progress),
      done: sortColumnTasks(grouped.done),
    };
  }, [tasks]);

  async function handleDragEnd(result: DropResult) {
    if (readOnly) return;

    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (!isTaskStatus(destination.droppableId)) return;
    if (!isTaskStatus(source.droppableId)) return;

    const destinationStatus = destination.droppableId;
    const sourceStatus = source.droppableId;

    if (
      destinationStatus === sourceStatus &&
      destination.index === source.index
    ) {
      return;
    }

    if (onReorder) {
      onReorder({
        taskId: draggableId,
        sourceStatus,
        destinationStatus,
        sourceIndex: source.index,
        destinationIndex: destination.index,
      });
      return;
    }

    if (onStatusChange && destinationStatus !== sourceStatus) {
      await onStatusChange(draggableId, destinationStatus);
    }
  }

  if (!isReady) {
    return (
      <div
        className="grid gap-3 md:grid-cols-3"
        aria-busy="true"
        aria-label="Loading Kanban board"
      >
        {COLUMNS.map((column) => (
          <div
            key={column.id}
            className="min-h-[28rem] animate-pulse rounded-xl border border-zinc-200 bg-zinc-100/80 dark:border-zinc-700 dark:bg-zinc-900/80"
          />
        ))}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div
        className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0"
        role="region"
        aria-label="Kanban board"
      >
        {COLUMNS.map((column) => (
          <KanbanColumn
            key={column.id}
            id={column.id}
            title={column.title}
            tasks={tasksByStatus[column.id]}
            metricsById={metricsById}
            onTaskClick={onTaskClick}
            onAddTask={
              onAddTask
                ? () => onAddTask(column.id)
                : undefined
            }
            addTaskHint={`Create in ${column.title} (${defaultProgressForStatus(column.id)}%)`}
            readOnly={readOnly}
          />
        ))}
      </div>
    </DragDropContext>
  );
}
