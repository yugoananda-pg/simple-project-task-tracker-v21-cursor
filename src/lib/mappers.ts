import { resolveActorDisplayName } from "@/src/lib/audit-display";
import type {
  ApprovalStatus,
  GlobalRole,
  Project,
  Subtask,
  Task,
  TaskComment,
  User,
} from "@/src/lib/types";
import type {
  Project as PrismaProject,
  Subtask as PrismaSubtask,
  Task as PrismaTask,
  TaskComment as PrismaTaskComment,
  User as PrismaUser,
} from "@prisma/client";

function toIso(value: Date): string {
  return value.toISOString();
}

function toDateString(value: Date | null): string | null {
  if (!value) return null;
  // Prisma `@db.Date` values are calendar days — read UTC parts to avoid WIB shift.
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mapUser(user: PrismaUser): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    globalRole: user.globalRole as GlobalRole,
    approvalStatus: user.approvalStatus as ApprovalStatus,
    createdAt: toIso(user.createdAt),
    updatedAt: toIso(user.updatedAt),
  };
}

export function mapProject(
  project: PrismaProject & { members?: Array<{ userId: string }> },
): Project {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    ownerId: project.ownerId,
    permittedUserIds: project.members?.map((member) => member.userId) ?? [],
    lifecycleStatus: project.lifecycleStatus,
    progressReached100At: project.progressReached100At
      ? toIso(project.progressReached100At)
      : null,
    completedAt: project.completedAt ? toIso(project.completedAt) : null,
    completedBy: project.completedBy,
    completionMethod: project.completionMethod,
    completedPurgeDueAt: project.completedPurgeDueAt
      ? toIso(project.completedPurgeDueAt)
      : null,
    deletedAt: project.deletedAt ? toIso(project.deletedAt) : null,
    deletedBy: project.deletedBy,
    purgeDueAt: project.purgeDueAt ? toIso(project.purgeDueAt) : null,
    createdAt: toIso(project.createdAt),
    updatedAt: toIso(project.updatedAt),
  };
}

export function mapSubtask(subtask: PrismaSubtask): Subtask {
  return {
    id: subtask.id,
    taskId: subtask.taskId,
    title: subtask.title,
    isCompleted: subtask.isCompleted,
    sortOrder: subtask.sortOrder,
    createdAt: toIso(subtask.createdAt),
    updatedAt: toIso(subtask.updatedAt),
  };
}

export function mapComment(comment: PrismaTaskComment): TaskComment {
  return {
    id: comment.id,
    taskId: comment.taskId,
    userId: comment.userId,
    content: comment.content,
    createdAt: toIso(comment.createdAt),
  };
}

export function mapTask(
  task: PrismaTask & {
    subtasks?: PrismaSubtask[];
    comments?: PrismaTaskComment[];
  },
  actorNamesById?: ReadonlyMap<string, string>,
): Task {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    bucket: task.bucket,
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeName,
    initialStartDate: toDateString(task.initialStartDate),
    initialDueDate: toDateString(task.initialDueDate),
    updatedStartDate: toDateString(task.updatedStartDate),
    updatedDueDate: toDateString(task.updatedDueDate),
    actualStartDate: toDateString(task.actualStartDate),
    actualCompletionDate: toDateString(task.actualCompletionDate),
    progress: task.progress,
    sortOrder: task.sortOrder,
    createdAt: toIso(task.createdAt),
    createdBy: task.createdBy,
    createdByName: resolveActorDisplayName(
      task.createdBy,
      actorNamesById?.get(task.createdBy),
    ),
    updatedAt: toIso(task.updatedAt),
    updatedBy: task.updatedBy,
    updatedByName: resolveActorDisplayName(
      task.updatedBy,
      actorNamesById?.get(task.updatedBy),
    ),
    subtasks: task.subtasks?.map(mapSubtask),
    comments: task.comments?.map(mapComment),
  };
}
