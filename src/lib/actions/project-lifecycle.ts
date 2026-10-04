"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, PurgeTrigger } from "@prisma/client";

import {
  actionFailure,
  actionSuccess,
  ActionError,
  type ActionResult,
} from "@/src/lib/actions/errors";
import {
  auditUpdate,
  withAuditSession,
  withSystemAuditSession,
} from "@/src/lib/audit";
import {
  SYSTEM_ACTOR_EMAIL,
  SYSTEM_ACTOR_DISPLAY_NAME,
  SYSTEM_ACTOR_ID,
  resolveActorDisplayName,
} from "@/src/lib/audit-display";
import {
  computeProjectScheduleHealth,
} from "@/src/lib/analytics/weighted-progress";
import { mapProject } from "@/src/lib/mappers";
import { prisma } from "@/src/lib/prisma";
import {
  canAccessCompletedWorkspace,
  completedProjectsVisibilityFilter,
  loadProjectWithMembers,
  requireAdminProject,
  requireApprovedSessionUser,
  type SessionUser,
} from "@/src/lib/rbac";
import { runUserRetentionPass } from "@/src/lib/actions/users";
import {
  SOFT_DELETE_RETENTION_DAYS,
  addCalendarDays,
} from "@/src/lib/retention";
import { dbDateToLocalDateString } from "@/src/lib/task-defaults";
import type { Project, PurgedProjectSummary } from "@/src/lib/types";

const COMPLETED_RETENTION_YEARS = 5;
const AUTO_COMPLETE_AFTER_DAYS = 30;

function addCalendarYears(from: Date, years: number): Date {
  const next = new Date(from.getTime());
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function requireSuperPm(user: SessionUser): void {
  if (user.globalRole !== "super_pm") {
    throw new ActionError(
      "Only a Super PM may perform this action.",
      "FORBIDDEN",
    );
  }
}

function revalidateLifecyclePaths(projectId?: string) {
  revalidatePath("/");
  revalidatePath("/projects/completed");
  revalidatePath("/settings/deleted-projects");
  revalidatePath("/settings/purged-projects");
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }
}

type ScheduleTaskRow = {
  id: string;
  progress: number;
  initialStartDate: Date | null;
  initialDueDate: Date | null;
  updatedStartDate: Date | null;
  updatedDueDate: Date | null;
  actualStartDate: Date | null;
  actualCompletionDate: Date | null;
};

function toScheduleInput(tasks: ScheduleTaskRow[]) {
  return tasks.map((task) => ({
    id: task.id,
    progress: task.progress,
    initialStartDate: task.initialStartDate
      ? dbDateToLocalDateString(task.initialStartDate)
      : null,
    initialDueDate: task.initialDueDate
      ? dbDateToLocalDateString(task.initialDueDate)
      : null,
    updatedStartDate: task.updatedStartDate
      ? dbDateToLocalDateString(task.updatedStartDate)
      : null,
    updatedDueDate: task.updatedDueDate
      ? dbDateToLocalDateString(task.updatedDueDate)
      : null,
    actualStartDate: task.actualStartDate
      ? dbDateToLocalDateString(task.actualStartDate)
      : null,
    actualCompletionDate: task.actualCompletionDate
      ? dbDateToLocalDateString(task.actualCompletionDate)
      : null,
  }));
}

async function loadHolidayKeys(): Promise<string[]> {
  const rows = await prisma.holiday.findMany({ select: { date: true } });
  return rows.map((row) => dbDateToLocalDateString(row.date));
}

async function computeProjectActualPercent(
  projectId: string,
): Promise<number> {
  const [tasks, holidayKeys] = await Promise.all([
    prisma.task.findMany({
      where: { projectId },
      select: {
        id: true,
        progress: true,
        initialStartDate: true,
        initialDueDate: true,
        updatedStartDate: true,
        updatedDueDate: true,
        actualStartDate: true,
        actualCompletionDate: true,
      },
    }),
    loadHolidayKeys(),
  ]);
  return computeProjectScheduleHealth(toScheduleInput(tasks), holidayKeys)
    .pActualProject;
}

/**
 * Maintains the 30-day auto-complete clock (FR-LFC-01).
 * Safe to call after any task mutation that may change weighted progress.
 */
export async function syncProjectProgressClock(
  projectId: string,
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      lifecycleStatus: true,
      deletedAt: true,
      progressReached100At: true,
    },
  });
  if (
    !project ||
    project.deletedAt ||
    project.lifecycleStatus !== "ACTIVE"
  ) {
    return;
  }

  const pActual = await computeProjectActualPercent(projectId);
  if (pActual >= 100) {
    if (!project.progressReached100At) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          progressReached100At: new Date(),
          ...auditUpdate(SYSTEM_ACTOR_ID),
        },
      });
    }
    return;
  }

  if (project.progressReached100At) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        progressReached100At: null,
        ...auditUpdate(SYSTEM_ACTOR_ID),
      },
    });
  }
}

export async function markProjectCompleted(
  projectId: string,
): Promise<ActionResult<Project>> {
  try {
    return await withAuditSession(async ({ actorId }) => {
      const { project } = await requireAdminProject(projectId);
      if (project.lifecycleStatus === "COMPLETED") {
        throw new ActionError("Project is already completed.", "VALIDATION");
      }

      const pActual = await computeProjectActualPercent(projectId);
      if (pActual < 100) {
        throw new ActionError(
          "Move to Completed Projects requires 100% weighted actual progress.",
          "VALIDATION",
        );
      }

      const now = new Date();
      const updated = await prisma.project.update({
        where: { id: projectId },
        data: {
          lifecycleStatus: "COMPLETED",
          completedAt: now,
          completedBy: actorId,
          completionMethod: "MANUAL",
          completedPurgeDueAt: addCalendarYears(now, COMPLETED_RETENTION_YEARS),
          progressReached100At: project.progressReached100At ?? now,
          ...auditUpdate(actorId),
        },
        include: { members: { select: { userId: true } } },
      });

      revalidateLifecyclePaths(projectId);
      return actionSuccess(mapProject(updated));
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function reopenProject(
  projectId: string,
): Promise<ActionResult<Project>> {
  try {
    return await withAuditSession(async ({ actorId }) => {
      const { project } = await requireAdminProject(projectId);
      if (project.lifecycleStatus !== "COMPLETED") {
        throw new ActionError("Only completed projects can be reopened.", "VALIDATION");
      }

      const pActual = await computeProjectActualPercent(projectId);
      const now = new Date();
      const updated = await prisma.project.update({
        where: { id: projectId },
        data: {
          lifecycleStatus: "ACTIVE",
          completedAt: null,
          completedBy: null,
          completionMethod: null,
          completedPurgeDueAt: null,
          progressReached100At: pActual >= 100 ? now : null,
          ...auditUpdate(actorId),
        },
        include: { members: { select: { userId: true } } },
      });

      revalidateLifecyclePaths(projectId);
      return actionSuccess(mapProject(updated));
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function listCompletedProjects(): Promise<
  ActionResult<Project[]>
> {
  try {
    const user = await requireApprovedSessionUser();
    if (!canAccessCompletedWorkspace(user)) {
      throw new ActionError(
        "You do not have permission to view Completed Projects.",
        "FORBIDDEN",
      );
    }

    const rows = await prisma.project.findMany({
      where: completedProjectsVisibilityFilter(user),
      include: { members: { select: { userId: true } } },
      orderBy: { completedAt: "desc" },
    });
    return actionSuccess(rows.map(mapProject));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function softDeleteProject(
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    return await withAuditSession(async ({ actorId }) => {
      const { project } = await requireAdminProject(projectId);
      if (project.deletedAt) {
        throw new ActionError("Project is already deleted.", "VALIDATION");
      }

      const now = new Date();
      await prisma.project.update({
        where: { id: projectId },
        data: {
          deletedAt: now,
          deletedBy: actorId,
          purgeDueAt: addCalendarDays(now, SOFT_DELETE_RETENTION_DAYS),
          ...auditUpdate(actorId),
        },
      });

      revalidateLifecyclePaths(projectId);
      return actionSuccess({ id: projectId });
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function listDeletedProjects(): Promise<ActionResult<Project[]>> {
  try {
    const user = await requireApprovedSessionUser();
    requireSuperPm(user);

    const rows = await prisma.project.findMany({
      where: { deletedAt: { not: null } },
      include: { members: { select: { userId: true } } },
      orderBy: { deletedAt: "desc" },
    });
    return actionSuccess(rows.map(mapProject));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function restoreProject(
  projectId: string,
): Promise<ActionResult<Project>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user);

      const project = await loadProjectWithMembers(projectId);
      if (!project) {
        throw new ActionError("Project not found.", "NOT_FOUND");
      }
      if (!project.deletedAt) {
        throw new ActionError("Project is not soft-deleted.", "VALIDATION");
      }

      const updated = await prisma.project.update({
        where: { id: projectId },
        data: {
          deletedAt: null,
          deletedBy: null,
          purgeDueAt: null,
          ...auditUpdate(actorId),
        },
        include: { members: { select: { userId: true } } },
      });

      revalidateLifecyclePaths(projectId);
      return actionSuccess(mapProject(updated));
    });
  } catch (error) {
    return actionFailure(error);
  }
}

type PurgeActor = {
  id: string;
  email: string;
  name: string;
};

async function resolveUserStamp(userId: string | null | undefined): Promise<{
  id: string | null;
  email: string;
  name: string;
}> {
  if (!userId) {
    return { id: null, email: "", name: "" };
  }
  if (userId === SYSTEM_ACTOR_ID) {
    return {
      id: SYSTEM_ACTOR_ID,
      email: SYSTEM_ACTOR_EMAIL,
      name: SYSTEM_ACTOR_DISPLAY_NAME,
    };
  }
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  return {
    id: userId,
    email: row?.email ?? "",
    name: resolveActorDisplayName(userId, row?.name),
  };
}

async function physicallyPurgeProject(input: {
  projectId: string;
  actor: PurgeActor;
  trigger: PurgeTrigger;
  reason?: string | null;
}): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    include: {
      owner: { select: { id: true, email: true, name: true } },
      members: true,
      tasks: { include: { subtasks: true, comments: true } },
      milestones: true,
      issues: { include: { comments: true } },
      issueActivities: true,
    },
  });
  if (!project) {
    throw new ActionError("Project not found.", "NOT_FOUND");
  }

  const [
    createdByStamp,
    updatedByStamp,
    completedByStamp,
    deletedByStamp,
    holidayKeys,
  ] = await Promise.all([
    resolveUserStamp(project.createdBy),
    resolveUserStamp(project.updatedBy),
    resolveUserStamp(project.completedBy),
    resolveUserStamp(project.deletedBy),
    loadHolidayKeys(),
  ]);

  const health = computeProjectScheduleHealth(
    toScheduleInput(project.tasks),
    holidayKeys,
  );

  const subtaskCount = project.tasks.reduce(
    (sum, task) => sum + task.subtasks.length,
    0,
  );
  const commentCount = project.tasks.reduce(
    (sum, task) => sum + task.comments.length,
    0,
  );
  const issueCommentCount = project.issues.reduce(
    (sum, issue) => sum + issue.comments.length,
    0,
  );

  const snapshotJson: Prisma.InputJsonValue = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      ownerId: project.ownerId,
      lifecycleStatus: project.lifecycleStatus,
      completedAt: project.completedAt?.toISOString() ?? null,
      deletedAt: project.deletedAt?.toISOString() ?? null,
    },
    taskIds: project.tasks.map((task) => task.id),
    issueIds: project.issues.map((issue) => issue.id),
    milestoneIds: project.milestones.map((milestone) => milestone.id),
  };

  const purged = await prisma.$transaction(async (tx) => {
    const row = await tx.purgedProject.create({
      data: {
        originalProjectId: project.id,
        name: project.name,
        description: project.description,
        ownerId: project.ownerId,
        ownerEmail: project.owner.email,
        ownerName: project.owner.name,
        lifecycleStatusAtPurge: project.lifecycleStatus,
        createdAtOriginal: project.createdAt,
        createdByOriginal: createdByStamp.id,
        createdByEmailOriginal: createdByStamp.email || null,
        updatedAtOriginal: project.updatedAt,
        updatedByOriginal: updatedByStamp.id,
        updatedByEmailOriginal: updatedByStamp.email || null,
        completedAt: project.completedAt,
        completedBy: project.completedBy,
        completedByEmail: completedByStamp.email || null,
        completionMethod: project.completionMethod,
        completedPurgeDueAt: project.completedPurgeDueAt,
        deletedAt: project.deletedAt,
        deletedBy: project.deletedBy,
        deletedByEmail: deletedByStamp.email || null,
        memberCount: project.members.length,
        taskCount: project.tasks.length,
        subtaskCount,
        commentCount,
        milestoneCount: project.milestones.length,
        issueCount: project.issues.length,
        issueCommentCount,
        issueActivityCount: project.issueActivities.length,
        lastKnownActualProgress: health.pActualProject,
        lastKnownTargetProgress: health.pTargetProject,
        snapshotJson,
        purgedBy: input.actor.id,
        purgedByEmail: input.actor.email,
        purgedByName: input.actor.name,
        purgeTrigger: input.trigger,
        purgeReason: input.reason?.trim() || null,
        createdBy: input.actor.id,
      },
    });

    await tx.project.delete({ where: { id: project.id } });
    return row;
  });

  return purged.id;
}

export async function purgeProject(input: {
  projectId: string;
  reason?: string;
  confirmName: string;
}): Promise<ActionResult<{ purgedProjectId: string }>> {
  try {
    return await withAuditSession(async ({ user }) => {
      requireSuperPm(user);

      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true, deletedAt: true },
      });
      if (!project) {
        throw new ActionError("Project not found.", "NOT_FOUND");
      }
      if (input.confirmName.trim() !== project.name) {
        throw new ActionError(
          "Type the project name exactly to confirm permanent deletion.",
          "VALIDATION",
        );
      }

      const purgedProjectId = await physicallyPurgeProject({
        projectId: project.id,
        actor: { id: user.id, email: user.email, name: user.name },
        trigger: "SUPER_PM_MANUAL",
        reason: input.reason,
      });

      revalidateLifecyclePaths(project.id);
      return actionSuccess({ purgedProjectId });
    });
  } catch (error) {
    return actionFailure(error);
  }
}

function mapPurged(row: {
  id: string;
  originalProjectId: string;
  name: string;
  description: string;
  ownerEmail: string;
  ownerName: string;
  lifecycleStatusAtPurge: "ACTIVE" | "COMPLETED";
  memberCount: number;
  taskCount: number;
  issueCount: number;
  milestoneCount: number;
  purgedAt: Date;
  purgedByEmail: string;
  purgedByName: string;
  purgeTrigger: PurgeTrigger;
  purgeReason: string | null;
}): PurgedProjectSummary {
  return {
    id: row.id,
    originalProjectId: row.originalProjectId,
    name: row.name,
    description: row.description,
    ownerEmail: row.ownerEmail,
    ownerName: row.ownerName,
    lifecycleStatusAtPurge: row.lifecycleStatusAtPurge,
    memberCount: row.memberCount,
    taskCount: row.taskCount,
    issueCount: row.issueCount,
    milestoneCount: row.milestoneCount,
    purgedAt: row.purgedAt.toISOString(),
    purgedByEmail: row.purgedByEmail,
    purgedByName: row.purgedByName,
    purgeTrigger: row.purgeTrigger,
    purgeReason: row.purgeReason,
  };
}

export async function listPurgedProjects(): Promise<
  ActionResult<PurgedProjectSummary[]>
> {
  try {
    const user = await requireApprovedSessionUser();
    requireSuperPm(user);

    const rows = await prisma.purgedProject.findMany({
      orderBy: { purgedAt: "desc" },
      take: 200,
    });
    return actionSuccess(rows.map(mapPurged));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function runProjectRetentionJob(): Promise<
  ActionResult<{
    autoCompleted: number;
    purgedSoftDeleted: number;
    purgedCompleted: number;
    usersWarned: number;
    usersPurged: number;
  }>
> {
  try {
    const session = await requireApprovedSessionUser();
    requireSuperPm(session);

    return await withSystemAuditSession(async () => {
      const now = new Date();
      const systemActor: PurgeActor = {
        id: SYSTEM_ACTOR_ID,
        email: SYSTEM_ACTOR_EMAIL,
        name: SYSTEM_ACTOR_DISPLAY_NAME,
      };

      // 1) Auto-complete: at 100% for 30+ days, still Active, not deleted.
      const autoCandidates = await prisma.project.findMany({
        where: {
          lifecycleStatus: "ACTIVE",
          deletedAt: null,
          progressReached100At: {
            lte: addCalendarDays(now, -AUTO_COMPLETE_AFTER_DAYS),
          },
        },
        select: { id: true },
      });

      let autoCompleted = 0;
      for (const candidate of autoCandidates) {
        const pActual = await computeProjectActualPercent(candidate.id);
        if (pActual < 100) {
          await prisma.project.update({
            where: { id: candidate.id },
            data: {
              progressReached100At: null,
              ...auditUpdate(SYSTEM_ACTOR_ID),
            },
          });
          continue;
        }
        await prisma.project.update({
          where: { id: candidate.id },
          data: {
            lifecycleStatus: "COMPLETED",
            completedAt: now,
            completedBy: SYSTEM_ACTOR_ID,
            completionMethod: "AUTO_RETENTION",
            completedPurgeDueAt: addCalendarYears(
              now,
              COMPLETED_RETENTION_YEARS,
            ),
            ...auditUpdate(SYSTEM_ACTOR_ID),
          },
        });
        autoCompleted += 1;
      }

      // 2) Soft-delete retention expired.
      const softExpired = await prisma.project.findMany({
        where: {
          deletedAt: { not: null },
          purgeDueAt: { lte: now },
        },
        select: { id: true },
      });
      let purgedSoftDeleted = 0;
      for (const row of softExpired) {
        await physicallyPurgeProject({
          projectId: row.id,
          actor: systemActor,
          trigger: "SOFT_DELETE_RETENTION_EXPIRED",
          reason: "Soft-delete retention (30 days) elapsed without restore.",
        });
        purgedSoftDeleted += 1;
      }

      // 3) Five-year completed retention expired.
      const completedExpired = await prisma.project.findMany({
        where: {
          lifecycleStatus: "COMPLETED",
          deletedAt: null,
          completedPurgeDueAt: { lte: now },
        },
        select: { id: true },
      });
      let purgedCompleted = 0;
      for (const row of completedExpired) {
        await physicallyPurgeProject({
          projectId: row.id,
          actor: systemActor,
          trigger: "COMPLETED_RETENTION_EXPIRED",
          reason: "Completed retention (five years from labelling) elapsed.",
        });
        purgedCompleted += 1;
      }

      // 4) Soft-deactivated user warning + purge (FR-GOV-06).
      const { usersWarned, usersPurged } = await runUserRetentionPass(now);

      revalidateLifecyclePaths();
      revalidatePath("/settings/users");
      return actionSuccess({
        autoCompleted,
        purgedSoftDeleted,
        purgedCompleted,
        usersWarned,
        usersPurged,
      });
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/** True when the signed-in user may open the Completed Projects workspace. */
export async function getCompletedWorkspaceAccess(): Promise<
  ActionResult<{ allowed: boolean }>
> {
  try {
    const user = await requireApprovedSessionUser();
    return actionSuccess({ allowed: canAccessCompletedWorkspace(user) });
  } catch (error) {
    return actionFailure(error);
  }
}
