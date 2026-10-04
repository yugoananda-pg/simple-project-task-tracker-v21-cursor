"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import KanbanBoard from "@/src/components/kanban/KanbanBoard";
import TaskDetailDrawer from "@/src/components/kanban/TaskDetailDrawer";
import ProjectAnalyticsView from "@/src/components/analytics/ProjectAnalyticsView";
import ProjectGanttView from "@/src/components/gantt/ProjectGanttView";
import ProjectIssueLogView from "@/src/components/issues/ProjectIssueLogView";
import ProjectMilestonesPanel from "@/src/components/milestones/ProjectMilestonesPanel";
import EditProjectModal from "@/src/components/projects/EditProjectModal";
import ReadOnlyAccessNotice from "@/src/components/projects/ReadOnlyAccessNotice";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import ProgressPairBadges from "@/src/components/schedule/ProgressPairBadges";
import TaskListView from "@/src/components/tasks/TaskListView";
import ConfirmDialog from "@/src/components/ui/ConfirmDialog";
import { useToast } from "@/src/components/providers/ToastProvider";
import type { ActionResult } from "@/src/lib/actions/errors";
import { deleteProject } from "@/src/lib/actions/projects";
import {
  markProjectCompleted,
  reopenProject,
} from "@/src/lib/actions/project-lifecycle";
import { listHolidayDateKeys } from "@/src/lib/actions/holidays";
import {
  addSubtask,
  createTask,
  deleteTask,
  reorderTasks,
  toggleSubtask,
  updateTaskFields,
  updateTaskStatus,
} from "@/src/lib/actions/tasks";
import { computeProjectScheduleHealth } from "@/src/lib/analytics/weighted-progress";
import { canDeleteTaskUi } from "@/src/lib/permissions";
import type { ProjectMemberUser } from "@/src/lib/actions/projects";
import type { ProjectAccessLevel } from "@/src/lib/rbac";
import { buildProgressStatusPatch } from "@/src/lib/task-defaults";
import type { Issue, Milestone, Project, Task, TaskStatus } from "@/src/lib/types";
import { Loader2 } from "lucide-react";

export type ProjectDetailViewProps = {
  projectId: string;
  initialProject: Project | null;
  initialTasks: Task[];
  initialIssues?: Issue[];
  initialMilestones?: Milestone[];
  holidayDateKeys?: string[];
  access: ProjectAccessLevel;
  canWriteTasks: boolean;
  canRaiseIssues?: boolean;
  canManageProject: boolean;
  currentUserId: string | null;
  canReassignOwner?: boolean;
  memberUsers: ProjectMemberUser[];
  loadError?: string | null;
};

type ViewMode = "list" | "kanban" | "gantt" | "analytics" | "issues";

const VIEW_OPTIONS: ReadonlyArray<{ id: ViewMode; label: string }> = [
  { id: "list", label: "List View" },
  { id: "kanban", label: "Kanban Board" },
  { id: "gantt", label: "Gantt Chart" },
  { id: "analytics", label: "Analytics" },
  { id: "issues", label: "Issue Log" },
];

/** Place a task above every card currently in the destination column. */
function sortOrderAtTopOfColumn(
  tasks: Task[],
  status: TaskStatus,
  excludeTaskId?: string,
): number {
  let min: number | null = null;
  for (const task of tasks) {
    if (task.status !== status) continue;
    if (excludeTaskId && task.id === excludeTaskId) continue;
    if (min == null || task.sortOrder < min) min = task.sortOrder;
  }
  return min == null ? 0 : min - 1;
}

/**
 * When RSC revalidation arrives mid-edit, keep the newer per-task snapshot
 * so in-flight optimistic date edits are not clobbered by a stale payload.
 */
function mergeTasksPreferNewer(local: Task[], server: Task[]): Task[] {
  const localById = new Map(local.map((task) => [task.id, task]));
  const seen = new Set<string>();
  const merged: Task[] = [];

  for (const serverTask of server) {
    seen.add(serverTask.id);
    const localTask = localById.get(serverTask.id);
    if (!localTask) {
      merged.push(serverTask);
      continue;
    }
    merged.push(
      Date.parse(localTask.updatedAt) > Date.parse(serverTask.updatedAt)
        ? localTask
        : serverTask,
    );
  }

  for (const localTask of local) {
    if (!seen.has(localTask.id)) {
      merged.push(localTask);
    }
  }

  return merged;
}

export default function ProjectDetailView({
  projectId,
  initialProject,
  initialTasks,
  initialIssues = [],
  initialMilestones = [],
  holidayDateKeys: initialHolidayDateKeys = [],
  access,
  canWriteTasks,
  canRaiseIssues = false,
  canManageProject,
  currentUserId,
  canReassignOwner = false,
  memberUsers: initialMemberUsers,
  loadError = null,
}: ProjectDetailViewProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [tasks, setTasks] = useState(initialTasks);
  const [syncedInitialTasks, setSyncedInitialTasks] = useState(initialTasks);
  const [project, setProject] = useState(initialProject);
  const [syncedInitialProject, setSyncedInitialProject] =
    useState(initialProject);
  const [memberUsers, setMemberUsers] = useState(initialMemberUsers);
  const [milestones, setMilestones] = useState(initialMilestones);
  const [holidayDateKeys, setHolidayDateKeys] = useState(initialHolidayDateKeys);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [actionError, setActionError] = useState<string | null>(loadError);
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [isCreatingTask, startCreateTransition] = useTransition();
  /** Serialize task writes so sequential date blurs cannot race and revert each other. */
  const taskMutationQueueRef = useRef(Promise.resolve());
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Adopt server payloads without wiping newer local edits (date blur races /
  // revalidatePath returning a slightly stale RSC snapshot).
  if (initialTasks !== syncedInitialTasks) {
    setSyncedInitialTasks(initialTasks);
    setTasks((current) => mergeTasksPreferNewer(current, initialTasks));
  }
  if (initialProject !== syncedInitialProject) {
    setSyncedInitialProject(initialProject);
    setProject(initialProject);
    setMemberUsers(initialMemberUsers);
    setMilestones(initialMilestones);
  }

  // Keep working-day maths in sync after holiday CRUD in another tab/page.
  useEffect(() => {
    setHolidayDateKeys(initialHolidayDateKeys);
  }, [initialHolidayDateKeys]);

  useEffect(() => {
    let cancelled = false;

    async function refreshHolidayKeys() {
      const result = await listHolidayDateKeys();
      if (cancelled || !result.success) return;
      setHolidayDateKeys(result.data);
    }

    void refreshHolidayKeys();

    function onVisible() {
      if (document.visibilityState === "visible") {
        void refreshHolidayKeys();
      }
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [projectId]);

  const selectedTask =
    selectedTaskId != null
      ? (tasks.find((task) => task.id === selectedTaskId) ?? null)
      : null;
  const isReadOnly = access === "read" && !canWriteTasks;
  const allowRaiseIssues = canRaiseIssues;

  function canEditTask(task: Task): boolean {
    if (canWriteTasks) return true;
    if (currentUserId && task.assigneeId === currentUserId) return true;
    return false;
  }
  const canDeleteSelectedTask = canDeleteTaskUi(
    canManageProject,
    currentUserId,
    selectedTask,
  );

  const scheduleHealth = useMemo(
    () => computeProjectScheduleHealth(tasks, holidayDateKeys),
    [tasks, holidayDateKeys],
  );
  const selectedTaskMetrics =
    selectedTaskId != null
      ? scheduleHealth.byId.get(selectedTaskId)
      : undefined;

  function syncTask(updated: Task) {
    setTasks((current) => {
      const index = current.findIndex((task) => task.id === updated.id);
      if (index < 0) {
        return [updated, ...current];
      }
      const existing = current[index]!;
      // A slower in-flight response must not overwrite a newer local/server snapshot.
      if (Date.parse(existing.updatedAt) > Date.parse(updated.updatedAt)) {
        return current;
      }
      const next = [...current];
      next[index] = updated;
      return next;
    });
  }

  /** Silent optimistic mutation — queued so sequential field blurs cannot race. */
  function runTaskMutation(
    action: () => Promise<ActionResult<Task>>,
    optimisticPatch?: { taskId: string; patch: Partial<Task> },
  ) {
    let snapshot: Task[] | null = null;

    if (optimisticPatch) {
      setTasks((current) => {
        snapshot = current;
        return current.map((task) =>
          task.id === optimisticPatch.taskId
            ? { ...task, ...optimisticPatch.patch }
            : task,
        );
      });
    }

    taskMutationQueueRef.current = taskMutationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const result = await action();
        if (!result.success) {
          if (optimisticPatch && snapshot) {
            setTasks(snapshot);
          }
          setActionError(
            result.error ?? "Something went wrong. Please try again.",
          );
          return;
        }
        syncTask(result.data);
        setActionError(null);
      });
  }

  function applyLocalStatusChange(
    task: Task,
    newStatus: TaskStatus,
    options?: { pinToTop?: boolean; allTasks?: Task[] },
  ): Task {
    const patched = buildProgressStatusPatch(task, { status: newStatus });
    const sortOrder =
      options?.pinToTop &&
      options.allTasks &&
      newStatus !== task.status
        ? sortOrderAtTopOfColumn(options.allTasks, newStatus, task.id)
        : task.sortOrder;
    return { ...task, ...patched, sortOrder };
  }

  function handleStatusChange(taskId: string, newStatus: TaskStatus): Promise<boolean> {
    const target = tasks.find((task) => task.id === taskId);
    if (!target || !canEditTask(target)) return Promise.resolve(false);

    let snapshot: Task[] = tasks;
    setTasks((current) => {
      snapshot = current;
      return current.map((task) =>
        task.id === taskId
          ? applyLocalStatusChange(task, newStatus, {
              pinToTop: true,
              allTasks: current,
            })
          : task,
      );
    });
    setActionError(null);

    return new Promise((resolve) => {
      taskMutationQueueRef.current = taskMutationQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const result = await updateTaskStatus(taskId, newStatus);
          if (!result.success) {
            setTasks(snapshot);
            setActionError(
              result.error ?? "Something went wrong. Please try again.",
            );
            resolve(false);
            return;
          }
          syncTask(result.data);
          resolve(true);
        });
    });
  }

  function handleReorder(input: {
    taskId: string;
    sourceStatus: TaskStatus;
    destinationStatus: TaskStatus;
    sourceIndex: number;
    destinationIndex: number;
  }) {
    if (!canWriteTasks) return;

    const snapshot = tasks;
    const nextTasks = [...tasks];
    const columnTasks = nextTasks
      .filter((task) => task.status === input.sourceStatus)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const [moved] = columnTasks.splice(input.sourceIndex, 1);
    if (!moved) return;

    if (input.sourceStatus === input.destinationStatus) {
      columnTasks.splice(input.destinationIndex, 0, moved);
      const reordered = columnTasks.map((task, index) => ({
        ...task,
        sortOrder: index,
      }));
      const others = nextTasks.filter((task) => task.status !== input.sourceStatus);
      setTasks([...others, ...reordered]);
      setActionError(null);

      void reorderTasks({
        projectId,
        status: input.destinationStatus,
        orderedTaskIds: reordered.map((task) => task.id),
      }).then((result) => {
        if (!result.success) {
          setTasks(snapshot);
          setActionError(result.error ?? "Unable to reorder tasks.");
        }
      });
      return;
    }

    const destColumn = nextTasks
      .filter((task) => task.status === input.destinationStatus)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    // DnD keeps the drop index — do not force top-of-column.
    const movedTask = applyLocalStatusChange(moved, input.destinationStatus);
    destColumn.splice(input.destinationIndex, 0, movedTask);

    const sourceReordered = columnTasks.map((task, index) => ({
      ...task,
      sortOrder: index,
    }));
    const destReordered = destColumn.map((task, index) => ({
      ...task,
      sortOrder: index,
    }));
    const others = nextTasks.filter(
      (task) =>
        task.status !== input.sourceStatus &&
        task.status !== input.destinationStatus,
    );
    setTasks([...others, ...sourceReordered, ...destReordered]);
    setActionError(null);

    void Promise.all([
      reorderTasks({
        projectId,
        status: input.sourceStatus,
        orderedTaskIds: sourceReordered.map((task) => task.id),
      }),
      reorderTasks({
        projectId,
        status: input.destinationStatus,
        orderedTaskIds: destReordered.map((task) => task.id),
      }),
    ]).then(([sourceResult, destResult]) => {
      if (!sourceResult.success || !destResult.success) {
        setTasks(snapshot);
        const message = !sourceResult.success
          ? sourceResult.error
          : !destResult.success
            ? destResult.error
            : null;
        setActionError(message ?? "Unable to move and reorder tasks.");
      }
    });
  }

  function handleTaskChange(taskId: string, patch: Partial<Task>) {
    const target = tasks.find((task) => task.id === taskId);
    if (!target || !canEditTask(target)) return;
    const current = tasksRef.current.find((task) => task.id === taskId);
    if (!current) return;

    const synced = buildProgressStatusPatch(current, patch);
    const nextStatus = synced.status ?? current.status;
    const statusChanged = nextStatus !== current.status;
    const touchedAt = new Date().toISOString();
    const optimistic: Partial<Task> = {
      ...(statusChanged
        ? {
            ...synced,
            sortOrder: sortOrderAtTopOfColumn(
              tasksRef.current,
              nextStatus,
              taskId,
            ),
          }
        : synced),
      updatedAt: touchedAt,
    };

    // Keep the ref ahead of the next blur so chained date edits see each other.
    tasksRef.current = tasksRef.current.map((task) =>
      task.id === taskId ? { ...task, ...optimistic } : task,
    );

    runTaskMutation(() => updateTaskFields(taskId, optimistic), {
      taskId,
      patch: optimistic,
    });
  }

  function handleToggleSubtask(
    taskId: string,
    subtaskId: string,
    isCompleted: boolean,
  ) {
    const target = tasks.find((task) => task.id === taskId);
    if (!target || !canEditTask(target)) return;
    runTaskMutation(() => toggleSubtask(taskId, subtaskId, isCompleted));
  }

  function handleAddSubtask(taskId: string, title: string) {
    const target = tasks.find((task) => task.id === taskId);
    if (!target || !canEditTask(target)) return;
    runTaskMutation(() => addSubtask(taskId, title));
  }

  async function handleAddTaskInColumn(status: TaskStatus) {
    if (!canWriteTasks) return;

    startCreateTransition(async () => {
      const result = await createTask({
        projectId,
        title: "New task",
        status,
      });
      if (!result.success) {
        setActionError(result.error ?? "Unable to create task.");
        return;
      }
      syncTask(result.data);
      setSelectedTaskId(result.data.id);
      setDrawerOpen(true);
      setActionError(null);
    });
  }

  async function handleDeleteTask(taskId: string) {
    if (
      !canDeleteTaskUi(canManageProject, currentUserId, selectedTask) ||
      isDeletingTask
    ) {
      return;
    }

    setIsDeletingTask(true);
    setActionError(null);

    const result = await deleteTask(taskId);
    if (!result.success) {
      setIsDeletingTask(false);
      setActionError(result.error ?? "Unable to delete this task.");
      showToast(result.error ?? "Unable to delete this task.", "error");
      return;
    }

    setTasks((current) => current.filter((task) => task.id !== taskId));
    setIsDeletingTask(false);
    closeDrawer();
    showToast("Task deleted successfully.");
  }

  async function handleDeleteProject() {
    if (!canManageProject || isDeletingProject) return;

    setIsDeletingProject(true);
    setActionError(null);

    const result = await deleteProject(projectId);
    if (!result.success) {
      setIsDeletingProject(false);
      setActionError(result.error ?? "Unable to delete this project.");
      showToast(result.error ?? "Unable to delete this project.", "error");
      return;
    }

    showToast(
      "Project soft-deleted. A Super PM can restore it within 30 days.",
    );
    router.push("/");
    router.refresh();
  }

  async function handleCompleteProject() {
    if (!canManageProject || isCompleting) return;
    setIsCompleting(true);
    const result = await markProjectCompleted(projectId);
    if (!result.success) {
      setIsCompleting(false);
      showToast(result.error ?? "Unable to complete this project.", "error");
      return;
    }
    setProject(result.data);
    setCompleteDialogOpen(false);
    setIsCompleting(false);
    showToast("Project moved to Completed Projects.");
    router.push("/projects/completed");
    router.refresh();
  }

  async function handleReopenProject() {
    if (!canManageProject || isReopening) return;
    setIsReopening(true);
    const result = await reopenProject(projectId);
    if (!result.success) {
      setIsReopening(false);
      showToast(result.error ?? "Unable to reopen this project.", "error");
      return;
    }
    setProject(result.data);
    setReopenDialogOpen(false);
    setIsReopening(false);
    showToast("Project reopened to Active.");
    router.refresh();
  }

  function openTask(task: Task) {
    setSelectedTaskId(task.id);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    window.setTimeout(() => {
      setSelectedTaskId(null);
    }, 300);
  }

  if (!project) {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <Link
          href="/"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Back to projects
        </Link>
        <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Project not found
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This project does not exist or you do not have access to it.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Back to projects
      </Link>

      <div className="mt-4 flex items-start justify-between gap-8">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {project.name}
            </h1>
            {project.lifecycleStatus === "COMPLETED" ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                Completed
              </span>
            ) : null}
            {isReadOnly ? (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                Read-only
              </span>
            ) : null}
          </div>
          {project.description ? (
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-zinc-400 md:text-base">
              {project.description}
            </p>
          ) : (
            <p className="mt-2 text-sm italic text-zinc-400">No description</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusFlagBadge flag={scheduleHealth.statusFlag} />
            <ProgressPairBadges
              actual={scheduleHealth.pActualProject}
              target={scheduleHealth.pTargetProject}
            />
          </div>
        </div>

        {canManageProject ? (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {project.lifecycleStatus === "ACTIVE" ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  Edit project
                </button>
                {scheduleHealth.pActualProject >= 100 ? (
                  <button
                    type="button"
                    onClick={() => setCompleteDialogOpen(true)}
                    className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100"
                  >
                    Move to Completed
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setReopenDialogOpen(true)}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                Reopen project
              </button>
            )}
            <button
              type="button"
              onClick={() => setDeleteProjectDialogOpen(true)}
              disabled={isDeletingProject}
              className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70"
            >
              Delete project
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <ProjectMilestonesPanel
          key={milestones.map((row) => `${row.id}:${row.updatedAt}`).join("|")}
          projectId={projectId}
          initialMilestones={milestones}
          canManage={
            canManageProject && project.lifecycleStatus === "ACTIVE"
          }
          onChange={setMilestones}
        />
      </div>

      <div className="mt-8 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {viewMode === "issues" ? "Issues" : "Tasks"}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {viewMode === "issues"
                ? null
                : tasks.length === 1
                  ? "1 task"
                  : `${tasks.length} tasks`}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Project view switcher"
            className="inline-flex flex-wrap rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {VIEW_OPTIONS.map((option) => {
              const isActive = viewMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setViewMode(option.id);
                    // Avoid a stale task drawer overlay when switching to Issue Log / Analytics.
                    if (option.id === "issues" || option.id === "analytics") {
                      setDrawerOpen(false);
                      setSelectedTaskId(null);
                    }
                  }}
                  className={[
                    "rounded-md px-3 py-1.5 text-sm font-semibold transition",
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
        </div>

        {actionError ? (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
            {actionError}
          </div>
        ) : null}

        {isReadOnly ? <ReadOnlyAccessNotice /> : null}

        <div className="relative min-h-[28rem]">
          {isCreatingTask ? (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/55 backdrop-blur-[1px] dark:bg-zinc-950/50"
              aria-busy="true"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Creating task…
              </div>
            </div>
          ) : null}

          <div
            role="tabpanel"
            aria-hidden={viewMode !== "kanban"}
            className={viewMode === "kanban" ? "block" : "hidden"}
          >
            <KanbanBoard
              tasks={tasks}
              metricsById={scheduleHealth.byId}
              onStatusChange={handleStatusChange}
              onReorder={canWriteTasks ? handleReorder : undefined}
              onTaskClick={openTask}
              onAddTask={canWriteTasks ? handleAddTaskInColumn : undefined}
              readOnly={!canWriteTasks}
            />
          </div>

          <div
            role="tabpanel"
            aria-hidden={viewMode !== "list"}
            className={viewMode === "list" ? "block" : "hidden"}
          >
            <TaskListView
              tasks={tasks}
              metricsById={scheduleHealth.byId}
              onTaskClick={openTask}
              onStatusChange={handleStatusChange}
              canChangeStatus={canEditTask}
            />
          </div>

          <div
            role="tabpanel"
            aria-hidden={viewMode !== "gantt"}
            className={viewMode === "gantt" ? "block" : "hidden"}
          >
            <ProjectGanttView
              tasks={tasks}
              milestones={milestones}
              projectName={project.name}
              metricsById={scheduleHealth.byId}
              onTaskClick={openTask}
              readOnly={isReadOnly}
            />
          </div>

          <div
            role="tabpanel"
            aria-hidden={viewMode !== "analytics"}
            className={viewMode === "analytics" ? "block" : "hidden"}
          >
            <ProjectAnalyticsView
              tasks={tasks}
              onTaskClick={openTask}
              readOnly={isReadOnly}
              chartsVisible={viewMode === "analytics"}
            />
          </div>

          <div
            role="tabpanel"
            aria-hidden={viewMode !== "issues"}
            className={viewMode === "issues" ? "block" : "hidden"}
          >
            <ProjectIssueLogView
              projectId={projectId}
              initialIssues={initialIssues}
              memberUsers={memberUsers}
              milestones={milestones}
              holidayDateKeys={holidayDateKeys}
              canRaise={
                allowRaiseIssues && project.lifecycleStatus === "ACTIVE"
              }
              canManage={
                canManageProject && project.lifecycleStatus === "ACTIVE"
              }
              currentUserId={currentUserId}
            />
          </div>
        </div>
      </div>

      <TaskDetailDrawer
        open={drawerOpen}
        task={selectedTask}
        scheduleMetrics={selectedTaskMetrics}
        onClose={closeDrawer}
        onTaskChange={
          selectedTask && canEditTask(selectedTask)
            ? handleTaskChange
            : undefined
        }
        onToggleSubtask={
          selectedTask && canEditTask(selectedTask)
            ? handleToggleSubtask
            : undefined
        }
        onAddSubtask={
          selectedTask && canEditTask(selectedTask)
            ? handleAddSubtask
            : undefined
        }
        readOnly={!selectedTask || !canEditTask(selectedTask)}
        canDeleteTask={canDeleteSelectedTask}
        onDeleteTask={canDeleteSelectedTask ? handleDeleteTask : undefined}
        isDeletePending={isDeletingTask}
        memberUsers={memberUsers}
      />

      {project ? (
        <EditProjectModal
          open={editOpen}
          project={project}
          memberUsers={memberUsers}
          canReassignOwner={canReassignOwner}
          onClose={() => setEditOpen(false)}
          onSaved={({ project: nextProject, memberUsers: nextMembers }) => {
            setProject(nextProject);
            setMemberUsers(nextMembers);
            showToast("Project updated.");
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteProjectDialogOpen}
        title="Soft-delete this project?"
        message="The project leaves Active and Completed views. Only a Super PM can restore it. After 30 days it is permanently purged to the Purged Project Register."
        confirmLabel="Soft-delete"
        isPending={isDeletingProject}
        onCancel={() => {
          if (!isDeletingProject) setDeleteProjectDialogOpen(false);
        }}
        onConfirm={handleDeleteProject}
      />

      <ConfirmDialog
        open={completeDialogOpen}
        title="Move to Completed Projects?"
        message="The project leaves the Active landing page. A five-year retention clock starts from this labelling instant."
        confirmLabel="Move to Completed"
        isPending={isCompleting}
        onCancel={() => {
          if (!isCompleting) setCompleteDialogOpen(false);
        }}
        onConfirm={handleCompleteProject}
      />

      <ConfirmDialog
        open={reopenDialogOpen}
        title="Reopen project?"
        message="Returns the project to Active. The five-year completed purge clock is cancelled."
        confirmLabel="Reopen"
        isPending={isReopening}
        onCancel={() => {
          if (!isReopening) setReopenDialogOpen(false);
        }}
        onConfirm={handleReopenProject}
      />
    </section>
  );
}
