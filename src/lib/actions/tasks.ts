"use server";

import { revalidatePath } from "next/cache";

import {
  actionFailure,
  actionSuccess,
  ActionError,
  type ActionResult,
} from "@/src/lib/actions/errors";
import { assertActualDateNotFuture } from "@/src/lib/actions/date-validation";
import { auditCreate, auditUpdate } from "@/src/lib/audit";
import { syncProjectProgressClock } from "@/src/lib/actions/project-lifecycle";
import { mapTask } from "@/src/lib/mappers";
import { prisma } from "@/src/lib/prisma";
import {
  canDeleteTask,
  canMutateTask,
  requireActiveApprovedAssignee,
  requireAdminProject,
  requireReadableProject,
  requireApprovedSessionUser,
} from "@/src/lib/rbac";
import {
  addDaysToLocalDateString,
  clampProgress,
  defaultProgressForStatus,
  localDateStringToDbDate,
  progressFromStatusChange,
  statusFromProgress,
  toLocalDateString,
} from "@/src/lib/task-defaults";
import type { Task, TaskStatus } from "@/src/lib/types";
import type { Prisma } from "@prisma/client";

const TASK_INCLUDE = {
  subtasks: { orderBy: { sortOrder: "asc" as const } },
  comments: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.TaskInclude;

async function loadActorNamesById(
  actorIds: Iterable<string>,
): Promise<Map<string, string>> {
  const ids = [...new Set(actorIds)].filter(Boolean);
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user.name]));
}

async function mapTaskWithAuditNames(
  task: Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>,
): Promise<Task> {
  const names = await loadActorNamesById([task.createdBy, task.updatedBy]);
  return mapTask(task, names);
}

async function mapTasksWithAuditNames(
  tasks: Array<Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>>,
): Promise<Task[]> {
  const names = await loadActorNamesById(
    tasks.flatMap((task) => [task.createdBy, task.updatedBy]),
  );
  return tasks.map((task) => mapTask(task, names));
}

function validateTaskTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new ActionError("Please enter a task title.", "VALIDATION");
  }
  if (trimmed.length > 200) {
    throw new ActionError("Task title must be 200 characters or fewer.", "VALIDATION");
  }
  return trimmed;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const datePart = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    throw new ActionError("Please enter a valid date.", "VALIDATION");
  }
  return localDateStringToDbDate(datePart);
}

function parseLocalDateString(value: string): Date {
  const parsed = parseOptionalDate(value);
  if (!parsed) {
    throw new ActionError("Please enter a valid date.", "VALIDATION");
  }
  return parsed;
}

function todayDbDate(): Date {
  return localDateStringToDbDate(toLocalDateString());
}

async function requireWritableTask(taskId: string) {
  const user = await requireApprovedSessionUser();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        include: {
          members: { select: { userId: true } },
        },
      },
      ...TASK_INCLUDE,
    },
  });

  if (!task) {
    throw new ActionError("Task not found.", "NOT_FOUND");
  }

  if (!canMutateTask(user, task.project, task)) {
    throw new ActionError(
      "You do not have permission to change this task.",
      "FORBIDDEN",
    );
  }

  return { user, task };
}

function applyStatusSideEffects(
  status: TaskStatus,
  current: {
    progress: number;
    actualStartDate: Date | null;
    actualCompletionDate: Date | null;
  },
  explicitProgress?: number,
): {
  actualStartDate: Date | null;
  actualCompletionDate: Date | null;
  progress: number;
} {
  const today = todayDbDate();

  const progress =
    explicitProgress !== undefined
      ? clampProgress(explicitProgress)
      : progressFromStatusChange(status, current.progress);

  if (status === "todo") {
    return {
      progress,
      actualStartDate: null,
      actualCompletionDate: null,
    };
  }

  if (status === "in_progress") {
    return {
      progress,
      actualStartDate: current.actualStartDate ?? today,
      actualCompletionDate: null,
    };
  }

  // done
  return {
    progress,
    actualStartDate: current.actualStartDate ?? today,
    actualCompletionDate: today,
  };
}

export async function listTasksByProject(
  projectId: string,
): Promise<ActionResult<Task[]>> {
  try {
    await requireReadableProject(projectId);
    const tasks = await prisma.task.findMany({
      where: { projectId },
      include: TASK_INCLUDE,
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    });
    return actionSuccess(await mapTasksWithAuditNames(tasks));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function createTask(input: {
  projectId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
}): Promise<ActionResult<Task>> {
  try {
    const { user } = await requireAdminProject(input.projectId);
    const title = validateTaskTitle(input.title);
    const description = (input.description ?? "").trim();
    const status: TaskStatus = input.status ?? "todo";

    const initialStart = toLocalDateString();
    const initialDue = addDaysToLocalDateString(initialStart, 7);
    const initialStartDate = parseLocalDateString(initialStart);
    const initialDueDate = parseLocalDateString(initialDue);
    const progress = defaultProgressForStatus(status);
    const createStamps = auditCreate(user.id);
    const touch = auditUpdate(user.id);

    const task = await prisma.$transaction(async (tx) => {
      const minSort = await tx.task.aggregate({
        where: { projectId: input.projectId, status },
        _min: { sortOrder: true },
      });
      const sortOrder =
        minSort._min.sortOrder == null ? 0 : minSort._min.sortOrder - 1;

      const created = await tx.task.create({
        data: {
          projectId: input.projectId,
          title,
          description,
          status,
          progress,
          sortOrder,
          initialStartDate,
          initialDueDate,
          updatedStartDate: initialStartDate,
          updatedDueDate: initialDueDate,
          ...createStamps,
          ...(status === "in_progress"
            ? { actualStartDate: initialStartDate }
            : {}),
          ...(status === "done"
            ? {
                // Actuals are historical — never invent a future completion from planned due.
                actualStartDate: initialStartDate,
                actualCompletionDate: initialStartDate,
              }
            : {}),
        },
        include: TASK_INCLUDE,
      });
      await tx.project.update({
        where: { id: input.projectId },
        data: touch,
      });
      return created;
    });

    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath("/");
    await syncProjectProgressClock(input.projectId);
    return actionSuccess(await mapTaskWithAuditNames(task));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateTaskFields(
  taskId: string,
  patch: Partial<Task>,
): Promise<ActionResult<Task>> {
  try {
    const { user, task } = await requireWritableTask(taskId);

    const data: Prisma.TaskUpdateInput = {
      ...auditUpdate(user.id),
    };
    if (patch.title !== undefined) data.title = validateTaskTitle(patch.title);
    if (patch.description !== undefined) data.description = patch.description.trim();

    if (patch.progress !== undefined && patch.status === undefined) {
      const progress = clampProgress(patch.progress);
      const status = statusFromProgress(progress);
      data.progress = progress;
      data.status = status;
      Object.assign(
        data,
        applyStatusSideEffects(
          status,
          {
            progress: task.progress,
            actualStartDate: task.actualStartDate,
            actualCompletionDate: task.actualCompletionDate,
          },
          progress,
        ),
      );
    } else if (patch.status !== undefined) {
      data.status = patch.status;
      Object.assign(
        data,
        applyStatusSideEffects(
          patch.status,
          {
            progress: task.progress,
            actualStartDate: task.actualStartDate,
            actualCompletionDate: task.actualCompletionDate,
          },
          patch.progress,
        ),
      );
    } else if (patch.progress !== undefined) {
      data.progress = clampProgress(patch.progress);
    }

    const nextStatus =
      typeof data.status === "string" ? (data.status as TaskStatus) : undefined;
    if (nextStatus !== undefined && nextStatus !== task.status) {
      if (patch.sortOrder !== undefined) {
        data.sortOrder = patch.sortOrder;
      } else {
        const aggregate = await prisma.task.aggregate({
          where: {
            projectId: task.projectId,
            status: nextStatus,
            id: { not: taskId },
          },
          _min: { sortOrder: true },
        });
        data.sortOrder =
          aggregate._min.sortOrder == null
            ? 0
            : aggregate._min.sortOrder - 1;
      }
    } else if (patch.sortOrder !== undefined) {
      data.sortOrder = patch.sortOrder;
    }

    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.bucket !== undefined) data.bucket = patch.bucket;
    if (patch.assigneeId !== undefined || patch.assigneeName !== undefined) {
      if (patch.assigneeId) {
        const assigneeUser = await requireActiveApprovedAssignee(
          patch.assigneeId,
        );
        const isProjectMember = await prisma.projectMember.findFirst({
          where: {
            projectId: task.projectId,
            userId: patch.assigneeId,
          },
          select: { id: true },
        });
        const isOwner = task.project.ownerId === patch.assigneeId;
        const isSuperPm = assigneeUser.globalRole === "super_pm";
        if (!isProjectMember && !isOwner && !isSuperPm) {
          throw new ActionError(
            "Assignee must be on the project roster, the owning PM, or a Super PM.",
            "VALIDATION",
          );
        }
        data.assignee = { connect: { id: patch.assigneeId } };
        data.assigneeName =
          patch.assigneeName?.trim() || assigneeUser.name;
      } else {
        data.assignee = { disconnect: true };
        const customName = patch.assigneeName?.trim() ?? "";
        if (customName.length > 120) {
          throw new ActionError(
            "PIC name must be 120 characters or fewer.",
            "VALIDATION",
          );
        }
        data.assigneeName = customName;
      }
    }
    if (patch.initialStartDate !== undefined) {
      data.initialStartDate = parseOptionalDate(patch.initialStartDate);
    }
    if (patch.initialDueDate !== undefined) {
      data.initialDueDate = parseOptionalDate(patch.initialDueDate);
    }
    if (patch.updatedStartDate !== undefined) {
      data.updatedStartDate = parseOptionalDate(patch.updatedStartDate);
    }
    if (patch.updatedDueDate !== undefined) {
      data.updatedDueDate = parseOptionalDate(patch.updatedDueDate);
    }
    if (patch.actualStartDate !== undefined) {
      assertActualDateNotFuture(patch.actualStartDate, "Actual start date");
      data.actualStartDate = parseOptionalDate(patch.actualStartDate);
    }
    if (patch.actualCompletionDate !== undefined) {
      assertActualDateNotFuture(
        patch.actualCompletionDate,
        "Actual completion date",
      );
      data.actualCompletionDate = parseOptionalDate(patch.actualCompletionDate);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextTask = await tx.task.update({
        where: { id: taskId },
        data,
        include: TASK_INCLUDE,
      });
      await tx.project.update({
        where: { id: task.projectId },
        data: auditUpdate(user.id),
      });
      return nextTask;
    });

    revalidatePath(`/projects/${task.projectId}`);
    revalidatePath("/");
    await syncProjectProgressClock(task.projectId);
    return actionSuccess(await mapTaskWithAuditNames(updated));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<ActionResult<Task>> {
  return updateTaskFields(taskId, { status });
}

/** Persist Kanban column order after a vertical or cross-column drag. */
export async function reorderTasks(input: {
  projectId: string;
  orderedTaskIds: string[];
  status: TaskStatus;
}): Promise<ActionResult<{ ok: true }>> {
  try {
    const { user } = await requireAdminProject(input.projectId);

    if (input.orderedTaskIds.length === 0) {
      return actionSuccess({ ok: true });
    }

    const existing = await prisma.task.findMany({
      where: {
        id: { in: input.orderedTaskIds },
        projectId: input.projectId,
      },
      select: {
        id: true,
        status: true,
        progress: true,
        actualStartDate: true,
        actualCompletionDate: true,
      },
    });

    if (existing.length !== input.orderedTaskIds.length) {
      throw new ActionError("One or more tasks could not be reordered.", "VALIDATION");
    }

    const byId = new Map(existing.map((task) => [task.id, task]));
    const touch = auditUpdate(user.id);

    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < input.orderedTaskIds.length; index += 1) {
        const taskId = input.orderedTaskIds[index]!;
        const current = byId.get(taskId)!;
        const statusChanged = current.status !== input.status;
        const effects = statusChanged
          ? applyStatusSideEffects(input.status, {
              progress: current.progress,
              actualStartDate: current.actualStartDate,
              actualCompletionDate: current.actualCompletionDate,
            })
          : null;

        await tx.task.update({
          where: { id: taskId },
          data: {
            status: input.status,
            sortOrder: index,
            ...touch,
            ...(effects ?? {}),
            progress: statusChanged
              ? progressFromStatusChange(input.status, current.progress)
              : current.progress,
          },
        });
      }

      await tx.project.update({
        where: { id: input.projectId },
        data: touch,
      });
    });

    revalidatePath(`/projects/${input.projectId}`);
    return actionSuccess({ ok: true });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function toggleSubtask(
  taskId: string,
  subtaskId: string,
  isCompleted: boolean,
): Promise<ActionResult<Task>> {
  try {
    const { user, task } = await requireWritableTask(taskId);
    const subtask = task.subtasks.find((item) => item.id === subtaskId);
    if (!subtask) {
      throw new ActionError("Checklist item not found.", "NOT_FOUND");
    }

    const touch = auditUpdate(user.id);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.subtask.update({
        where: { id: subtaskId },
        data: { isCompleted, ...touch },
      });
      const nextTask = await tx.task.update({
        where: { id: taskId },
        data: touch,
        include: TASK_INCLUDE,
      });
      await tx.project.update({
        where: { id: task.projectId },
        data: touch,
      });
      return nextTask;
    });

    revalidatePath(`/projects/${task.projectId}`);
    return actionSuccess(await mapTaskWithAuditNames(updated));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function addSubtask(
  taskId: string,
  title: string,
): Promise<ActionResult<Task>> {
  try {
    const { user, task } = await requireWritableTask(taskId);
    const trimmed = title.trim();
    if (!trimmed) {
      throw new ActionError("Please enter a checklist item name first.", "VALIDATION");
    }

    const sortOrder = task.subtasks.length;
    const touch = auditUpdate(user.id);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.subtask.create({
        data: {
          taskId,
          title: trimmed,
          sortOrder,
          ...auditCreate(user.id),
        },
      });
      const nextTask = await tx.task.update({
        where: { id: taskId },
        data: touch,
        include: TASK_INCLUDE,
      });
      await tx.project.update({
        where: { id: task.projectId },
        data: touch,
      });
      return nextTask;
    });

    revalidatePath(`/projects/${task.projectId}`);
    return actionSuccess(await mapTaskWithAuditNames(updated));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteTask(
  taskId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireApprovedSessionUser();
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          include: {
            members: { select: { userId: true } },
          },
        },
      },
    });

    if (!task) {
      throw new ActionError("Task not found.", "NOT_FOUND");
    }

    if (!canDeleteTask(user, task.project, task)) {
      throw new ActionError("You do not have permission to delete this task.", "FORBIDDEN");
    }

    await prisma.$transaction(async (tx) => {
      await tx.task.delete({ where: { id: taskId } });
      await tx.project.update({
        where: { id: task.projectId },
        data: auditUpdate(user.id),
      });
    });

    revalidatePath(`/projects/${task.projectId}`);
    revalidatePath("/");
    await syncProjectProgressClock(task.projectId);
    return actionSuccess({ id: taskId });
  } catch (error) {
    return actionFailure(error);
  }
}
