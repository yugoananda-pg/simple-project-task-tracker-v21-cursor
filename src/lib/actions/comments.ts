"use server";

import { revalidatePath } from "next/cache";

import {
  actionFailure,
  actionSuccess,
  ActionError,
  type ActionResult,
} from "@/src/lib/actions/errors";
import { auditCreate, auditUpdate } from "@/src/lib/audit";
import { prisma } from "@/src/lib/prisma";
import {
  canMutateTask,
  getProjectAccess,
  requireApprovedSessionUser,
  type SessionUser,
} from "@/src/lib/rbac";

export type TaskCommentAuthor = {
  id: string;
  name: string;
  email: string;
};

export type TaskCommentWithAuthor = {
  id: string;
  taskId: string;
  content: string;
  createdAt: string;
  author: TaskCommentAuthor;
};

const COMMENT_AUTHOR_SELECT = {
  id: true,
  name: true,
  email: true,
} as const;

function mapCommentWithAuthor(comment: {
  id: string;
  taskId: string;
  content: string;
  createdAt: Date;
  user: TaskCommentAuthor;
}): TaskCommentWithAuthor {
  return {
    id: comment.id,
    taskId: comment.taskId,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    author: comment.user,
  };
}

async function requireReadableTaskComments(taskId: string) {
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

  const access = getProjectAccess(user, task.project);
  if (access === "none") {
    throw new ActionError("You do not have access to this task.", "FORBIDDEN");
  }

  return { user, task, access };
}

function canDeleteComment(
  user: SessionUser,
  commentUserId: string,
  projectOwnerId: string,
): boolean {
  if (user.globalRole === "super_pm") return true;
  if (commentUserId === user.id) return true;
  if (projectOwnerId === user.id) return true;
  return false;
}

function validateCommentContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new ActionError("Please enter comment text first.", "VALIDATION");
  }
  if (trimmed.length > 4000) {
    throw new ActionError("Comments must be 4,000 characters or fewer.", "VALIDATION");
  }
  return trimmed;
}

export async function getTaskComments(
  taskId: string,
): Promise<ActionResult<TaskCommentWithAuthor[]>> {
  try {
    await requireReadableTaskComments(taskId);

    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      include: { user: { select: COMMENT_AUTHOR_SELECT } },
      orderBy: { createdAt: "asc" },
    });

    return actionSuccess(comments.map(mapCommentWithAuthor));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function createComment(
  taskId: string,
  content: string,
): Promise<ActionResult<TaskCommentWithAuthor>> {
  try {
    const { user, task } = await requireReadableTaskComments(taskId);
    if (!canMutateTask(user, task.project, task)) {
      throw new ActionError(
        "You do not have permission to post comments on this task.",
        "FORBIDDEN",
      );
    }

    const trimmed = validateCommentContent(content);

    const created = await prisma.$transaction(async (tx) => {
      const comment = await tx.taskComment.create({
        data: {
          taskId,
          userId: user.id,
          content: trimmed,
          ...auditCreate(user.id),
        },
        include: { user: { select: COMMENT_AUTHOR_SELECT } },
      });
      const touch = auditUpdate(user.id);
      await tx.task.update({
        where: { id: taskId },
        data: touch,
      });
      await tx.project.update({
        where: { id: task.projectId },
        data: touch,
      });
      return comment;
    });

    revalidatePath(`/projects/${task.projectId}`);
    return actionSuccess(mapCommentWithAuthor(created));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteComment(
  commentId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireApprovedSessionUser();

    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId },
      include: {
        task: {
          include: {
            project: {
              include: {
                members: { select: { userId: true } },
              },
            },
          },
        },
      },
    });

    if (!comment) {
      throw new ActionError("Comment not found.", "NOT_FOUND");
    }

    const access = getProjectAccess(user, comment.task.project);
    if (access === "none") {
      throw new ActionError("You do not have access to this comment.", "FORBIDDEN");
    }

    if (
      !canDeleteComment(user, comment.userId, comment.task.project.ownerId)
    ) {
      throw new ActionError(
        "You do not have permission to delete this comment.",
        "FORBIDDEN",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.taskComment.delete({ where: { id: commentId } });
      const touch = auditUpdate(user.id);
      await tx.task.update({
        where: { id: comment.taskId },
        data: touch,
      });
      await tx.project.update({
        where: { id: comment.task.projectId },
        data: touch,
      });
    });

    revalidatePath(`/projects/${comment.task.projectId}`);
    return actionSuccess({ id: commentId });
  } catch (error) {
    return actionFailure(error);
  }
}
