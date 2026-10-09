"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import KanbanBoard from "@/src/components/kanban/KanbanBoard";
import TaskDetailDrawer from "@/src/components/kanban/TaskDetailDrawer";
import type { ProjectAnalyticsBundle } from "@/src/lib/actions/analytics";
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
  reorderTasksInList,
  toggleSubtask,
  updateTaskFields,
  updateTaskStatus,
} from "@/src/lib/actions/tasks";
import { computeProjectScheduleHealth } from "@/src/lib/analytics/weighted-progress";
import { canDeleteTaskUi } from "@/src/lib/permissions";
import type { ProjectMemberUser } from "@/src/lib/actions/projects";
import type { ProjectAccessLevel } from "@/src/lib/rbac";
import {
  actualDateRangeError,
  buildProgressStatusPatch,
} from "@/src/lib/task-defaults";
import type { Issue, Milestone, Project, Task, TaskBucket, TaskStatus } from "@/src/lib/types";
import {
  projectsHomeHrefFromScope,
  readPortfolioScopeClient,
} from "@/src/lib/project-list-scope";
import { Loader2, X } from "lucide-react";

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
  /** Owning PM, shown under the title. */
  ownerName?: string | null;
  /** Set when the viewer may open that PM’s portfolio. */
  ownerPortfolioHref?: string | null;
  customAssigneeNames?: string[];
  analytics?: ProjectAnalyticsBundle | null;
  /** Per-project Analytics capability. The tab stays hidden without it. */
  canViewProjectAnalytics?: boolean;
  loadError?: string | null;
};

type ViewMode = "list" | "kanban" | "gantt" | "analytics" | "issues";

const VIEW_OPTIONS: ReadonlyArray<{ id: ViewMode; label: string }> = [
  { id: "list", label: "List View" },
  { id: "kanban", label: "Kanban Board" },
  { id: "gantt", label: "Gantt Chart" },
  { id: "issues", label: "Issue Log" },
  { id: "analytics", label: "Analytics" },
];

/**
 * The Analytics pane carries Recharts and the series maths. It loads on first
 * use (or when the tab is hovered), and it is mounted only while visible, so
 * List, Kanban, Gantt, and Issue Log edits never pay for it.
 */
const loadAnalyticsView = () =>
  import("@/src/components/analytics/ProjectAnalyticsView");

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading analytics">
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div
            key={key}
            className="sptt-card h-28 animate-pulse bg-zinc-100 dark:bg-zinc-900/60"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((key) => (
          <div
            key={key}
            className="sptt-card h-80 animate-pulse bg-zinc-100 dark:bg-zinc-900/60"
          />
        ))}
      </div>
    </div>
  );
}

const ProjectAnalyticsView = dynamic(loadAnalyticsView, {
  ssr: false,
  loading: AnalyticsSkeleton,
});

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
  ownerName = null,
  ownerPortfolioHref = null,
  customAssigneeNames = [],
  analytics = null,
  canViewProjectAnalytics = false,
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
  const viewOptions = useMemo(
    () =>
      VIEW_OPTIONS.filter(
        (option) => canViewProjectAnalytics || option.id !== "analytics",
      ),
    [canViewProjectAnalytics],
  );
  const [focusIssueId, setFocusIssueId] = useState<string | null>(null);
  const openIssueLog = useCallback(() => setViewMode("issues"), []);
  const openIssueFromAnalytics = useCallback((issueId: string) => {
    setFocusIssueId(issueId);
    setViewMode("issues");
  }, []);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [actionError, setActionError] = useState<string | null>(loadError);
  const actionErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [isCreatingTask, startCreateTransition] = useTransition();
  /** Soft-nav home keeps last Portfolio scope; brand / Projects use bare `/`. */
  const [projectsHomeHref, setProjectsHomeHref] = useState("/");
  /** Confirm: actual finish while task is not yet Done / 100%. */
  const [pendingActualFinish, setPendingActualFinish] = useState<{
    taskId: string;
    date: string;
  } | null>(null);
  const [dateResetToken, setDateResetToken] = useState(0);
  /** Serialize task writes so sequential date blurs cannot race and revert each other. */
  const taskMutationQueueRef = useRef(Promise.resolve());
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    setProjectsHomeHref(projectsHomeHrefFromScope(readPortfolioScopeClient()));
  }, []);

  useEffect(() => {
    return () => {
      if (actionErrorTimerRef.current) {
        clearTimeout(actionErrorTimerRef.current);
      }
    };
  }, []);

  function clearActionError() {
    if (actionErrorTimerRef.current) {
      clearTimeout(actionErrorTimerRef.current);
      actionErrorTimerRef.current = null;
    }
    setActionError(null);
  }

  function reportActionError(message: string) {
    if (actionErrorTimerRef.current) {
      clearTimeout(actionErrorTimerRef.current);
    }
    setActionError(message);
    showToast(message, "error");
    // Banner auto-clears; toast also auto-dismisses with its own close control.
    actionErrorTimerRef.current = setTimeout(() => {
      setActionError(null);
      actionErrorTimerRef.current = null;
    }, 7000);
  }

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
    // Capture before setState — React may defer the updater, so reading
    // `snapshot` only inside the updater can leave it null on failure.
    const snapshot = optimisticPatch ? tasksRef.current : null;

    if (optimisticPatch) {
      tasksRef.current = tasksRef.current.map((task) =>
        task.id === optimisticPatch.taskId
          ? { ...task, ...optimisticPatch.patch }
          : task,
      );
      setTasks(tasksRef.current);
    }

    taskMutationQueueRef.current = taskMutationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const result = await action();
          if (!result.success) {
            if (optimisticPatch && snapshot) {
              tasksRef.current = snapshot;
              setTasks(snapshot);
            }
            reportActionError(
              result.error ?? "Something went wrong. Please try again.",
            );
            return;
          }
          syncTask(result.data);
          clearActionError();
        } catch {
          if (optimisticPatch && snapshot) {
            tasksRef.current = snapshot;
            setTasks(snapshot);
          }
          reportActionError("Something went wrong. Please try again.");
        }
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
    clearActionError();

    return new Promise((resolve) => {
      taskMutationQueueRef.current = taskMutationQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const result = await updateTaskStatus(taskId, newStatus);
          if (!result.success) {
            setTasks(snapshot);
            reportActionError(
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
      clearActionError();

      void reorderTasks({
        projectId,
        status: input.destinationStatus,
        orderedTaskIds: reordered.map((task) => task.id),
      }).then((result) => {
        if (!result.success) {
          setTasks(snapshot);
          reportActionError(result.error ?? "Unable to reorder tasks.");
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
    clearActionError();

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
        reportActionError(message ?? "Unable to move and reorder tasks.");
      }
    });
  }

  function applyTaskChange(taskId: string, patch: Partial<Task>) {
    const current = tasksRef.current.find((task) => task.id === taskId);
    if (!current) return;

    if (
      patch.actualStartDate !== undefined ||
      patch.actualCompletionDate !== undefined
    ) {
      const nextStart =
        patch.actualStartDate !== undefined
          ? patch.actualStartDate
          : current.actualStartDate;
      const nextFinish =
        patch.actualCompletionDate !== undefined
          ? patch.actualCompletionDate
          : current.actualCompletionDate;
      const rangeError = actualDateRangeError(nextStart, nextFinish);
      if (rangeError) {
        reportActionError(rangeError);
        setDateResetToken((n) => n + 1);
        return;
      }
    }

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

    runTaskMutation(() => updateTaskFields(taskId, optimistic), {
      taskId,
      patch: optimistic,
    });
  }

  function handleTaskChange(taskId: string, patch: Partial<Task>) {
    const target = tasks.find((task) => task.id === taskId);
    if (!target || !canEditTask(target)) return;
    const current = tasksRef.current.find((task) => task.id === taskId);
    if (!current) return;

    const finishOnly =
      patch.actualCompletionDate != null &&
      patch.status === undefined &&
      patch.progress === undefined &&
      (current.status !== "done" || current.progress < 100);

    if (finishOnly) {
      const nextStart =
        patch.actualStartDate !== undefined
          ? patch.actualStartDate
          : current.actualStartDate;
      const rangeError = actualDateRangeError(
        nextStart ?? null,
        patch.actualCompletionDate ?? null,
      );
      if (rangeError) {
        reportActionError(rangeError);
        setDateResetToken((n) => n + 1);
        return;
      }
      setPendingActualFinish({
        taskId,
        date: patch.actualCompletionDate!,
      });
      return;
    }

    applyTaskChange(taskId, patch);
  }

  function confirmActualFinishToDone() {
    if (!pendingActualFinish) return;
    const { taskId, date } = pendingActualFinish;
    setPendingActualFinish(null);
    applyTaskChange(taskId, {
      actualCompletionDate: date,
      status: "done",
      progress: 100,
    });
  }

  function cancelActualFinishToDone() {
    setPendingActualFinish(null);
    setDateResetToken((n) => n + 1);
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
        reportActionError(result.error ?? "Unable to create task.");
        return;
      }
      syncTask(result.data);
      setSelectedTaskId(result.data.id);
      setDrawerOpen(true);
      clearActionError();
    });
  }

  async function handleCreateTaskInList(input: {
    bucket: TaskBucket;
    listIndex: number;
    title: string;
    initialStartDate: string;
    initialDueDate: string;
  }): Promise<{ success: boolean; data?: Task; error?: string }> {
    if (!canWriteTasks) {
      return { success: false, error: "You do not have permission to add tasks." };
    }

    const result = await createTask({
      projectId,
      title: input.title,
      status: "todo",
      bucket: input.bucket,
      listIndex: input.listIndex,
      initialStartDate: input.initialStartDate,
      initialDueDate: input.initialDueDate,
    });
    if (!result.success) {
      reportActionError(result.error ?? "Unable to create task.");
      return { success: false, error: result.error };
    }
    syncTask(result.data);
    clearActionError();
    return { success: true, data: result.data };
  }

  function handleReorderInList(
    groups: Array<{ bucket: TaskBucket; orderedTaskIds: string[] }>,
  ) {
    if (!canWriteTasks) return;
    const snapshot = tasks;
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const touched = new Set<string>();
    const next: Task[] = [];

    for (const group of groups) {
      group.orderedTaskIds.forEach((taskId, index) => {
        const current = byId.get(taskId);
        if (!current) return;
        touched.add(taskId);
        next.push({
          ...current,
          bucket: group.bucket,
          listSortOrder: index,
        });
      });
    }

    for (const task of tasks) {
      if (!touched.has(task.id)) next.push(task);
    }

    setTasks(next);
    clearActionError();

    void reorderTasksInList({ projectId, groups }).then((result) => {
      if (!result.success) {
        setTasks(snapshot);
        reportActionError(result.error ?? "Unable to reorder the task list.");
      }
    });
  }

  async function handleDeleteTask(taskId: string) {
    const target =
      tasks.find((task) => task.id === taskId) ??
      (selectedTask?.id === taskId ? selectedTask : null);
    if (!canDeleteTaskUi(canManageProject, currentUserId, target) || isDeletingTask) {
      return;
    }

    setIsDeletingTask(true);
    clearActionError();

    const result = await deleteTask(taskId);
    if (!result.success) {
      setIsDeletingTask(false);
      reportActionError(result.error ?? "Unable to delete this task.");
      return;
    }

    setTasks((current) => current.filter((task) => task.id !== taskId));
    setIsDeletingTask(false);
    if (selectedTaskId === taskId) {
      closeDrawer();
    }
    showToast("Task deleted successfully.");
  }

  async function handleDeleteProject() {
    if (!canManageProject || isDeletingProject) return;

    setIsDeletingProject(true);
    clearActionError();

    const result = await deleteProject(projectId);
    if (!result.success) {
      setIsDeletingProject(false);
      reportActionError(result.error ?? "Unable to delete this project.");
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
      <section className="mx-auto w-full px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href={projectsHomeHref}
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
    <section className="mx-auto w-full px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={projectsHomeHref}
        suppressHydrationWarning
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
          {(project.customProjectId ?? "").trim() ? (
            <p
              className="mt-1.5 font-mono text-xs font-medium tracking-wide text-slate-600 dark:text-slate-300 sm:text-sm"
              title="Custom Project ID"
            >
              {(project.customProjectId ?? "").trim()}
            </p>
          ) : null}
          {project.description ? (
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-zinc-400 md:text-base">
              {project.description}
            </p>
          ) : (
            <p className="mt-2 text-sm italic text-zinc-400">No description</p>
          )}
          {ownerName ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Project Manager:{" "}
              {ownerPortfolioHref ? (
                <Link
                  href={ownerPortfolioHref}
                  className="font-medium text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
                >
                  {ownerName}
                </Link>
              ) : (
                <span className="font-medium text-zinc-700 dark:text-zinc-200">
                  {ownerName}
                </span>
              )}
            </p>
          ) : null}
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
              {viewMode === "issues"
                ? "Issues"
                : viewMode === "analytics"
                  ? "Analytics"
                  : "Tasks"}
            </h2>
            <p className="whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
              {viewMode === "issues" || viewMode === "analytics"
                ? null
                : tasks.length === 1
                  ? "1 task"
                  : `${tasks.length} tasks`}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Project view switcher"
            className="inline-flex flex-wrap gap-0.5 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-800 dark:bg-zinc-900/70"
          >
            {viewOptions.map((option) => {
              const isActive = viewMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onPointerEnter={
                    option.id === "analytics"
                      ? () => void loadAnalyticsView()
                      : undefined
                  }
                  onFocus={
                    option.id === "analytics"
                      ? () => void loadAnalyticsView()
                      : undefined
                  }
                  onClick={() => {
                    setViewMode(option.id);
                    // Avoid a stale task drawer overlay when switching to Issue Log / Analytics.
                    if (option.id === "issues" || option.id === "analytics") {
                      setDrawerOpen(false);
                      setSelectedTaskId(null);
                    }
                  }}
                  className={[
                    "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-[color,background-color,box-shadow] duration-150",
                    isActive
                      ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-white/10"
                      : "text-zinc-600 hover:bg-white/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {actionError ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200"
          >
            <p className="min-w-0 flex-1">{actionError}</p>
            <button
              type="button"
              onClick={clearActionError}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-red-700 opacity-80 transition hover:bg-red-100 hover:opacity-100 dark:text-red-200 dark:hover:bg-red-900/50"
              aria-label="Dismiss error"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}

        {isReadOnly && viewMode !== "analytics" ? (
          <ReadOnlyAccessNotice includeAnalytics={canViewProjectAnalytics} />
        ) : null}

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
              projectPs={scheduleHealth.projectPs}
              holidayDateKeys={holidayDateKeys}
              readOnly={!canWriteTasks}
              canEditTask={canEditTask}
              canDeleteTask={(task) =>
                canDeleteTaskUi(canManageProject, currentUserId, task)
              }
              onTaskChange={handleTaskChange}
              onStatusChange={handleStatusChange}
              onReorderInList={canWriteTasks ? handleReorderInList : undefined}
              onCreateTask={canWriteTasks ? handleCreateTaskInList : undefined}
              onDeleteTask={canWriteTasks ? handleDeleteTask : undefined}
              onOpenDetails={openTask}
              onValidationError={reportActionError}
              dateResetToken={dateResetToken}
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
            aria-hidden={viewMode !== "issues"}
            className={viewMode === "issues" ? "block" : "hidden"}
          >
            <ProjectIssueLogView
              projectId={projectId}
              initialIssues={initialIssues}
              memberUsers={memberUsers}
              customAssigneeNames={customAssigneeNames}
              milestones={milestones}
              holidayDateKeys={holidayDateKeys}
              canRaise={
                allowRaiseIssues && project.lifecycleStatus === "ACTIVE"
              }
              canManage={
                canManageProject && project.lifecycleStatus === "ACTIVE"
              }
              currentUserId={currentUserId}
              focusIssueId={focusIssueId}
            />
          </div>

          <div
            role="tabpanel"
            aria-hidden={viewMode !== "analytics"}
            className={viewMode === "analytics" ? "block" : "hidden"}
          >
            {canViewProjectAnalytics && viewMode === "analytics" ? (
              <ProjectAnalyticsView
                projectId={projectId}
                tasks={tasks}
                issues={initialIssues}
                milestones={milestones}
                holidayDateKeys={holidayDateKeys}
                events={analytics?.events ?? []}
                activities={analytics?.activities ?? []}
                noteHtml={analytics?.noteHtml ?? ""}
                noteUpdatedAt={analytics?.noteUpdatedAt ?? null}
                noteUpdatedByName={analytics?.noteUpdatedByName ?? null}
                canEditNote={canManageProject}
                chartsVisible
                onOpenIssueLog={openIssueLog}
                onOpenIssue={openIssueFromAnalytics}
              />
            ) : null}
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
        customAssigneeNames={customAssigneeNames}
        dateResetToken={dateResetToken}
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
        open={pendingActualFinish != null}
        title="Mark task as Done?"
        message="Entering an actual finish date will set Status to Done and Actual progress to 100%. Project and task punctuality scores will recalculate. Continue?"
        confirmLabel="Mark as Done"
        cancelLabel="Cancel"
        tone="primary"
        onCancel={cancelActualFinishToDone}
        onConfirm={confirmActualFinishToDone}
      />

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
