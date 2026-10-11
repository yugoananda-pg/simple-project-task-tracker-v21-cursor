"use server";

import { revalidatePath } from "next/cache";

import {
  actionFailure,
  actionSuccess,
  ActionError,
  type ActionResult,
} from "@/src/lib/actions/errors";
import { softDeleteProject } from "@/src/lib/actions/project-lifecycle";
import { auditCreate, auditUpdate, withAuditSession } from "@/src/lib/audit";
import { SYSTEM_ACTOR_ID } from "@/src/lib/audit-display";
import {
  computeProjectScheduleHealth,
  type StatusFlagId,
} from "@/src/lib/analytics/weighted-progress";
import { notifyPmOfProjectAssignments } from "@/src/lib/mail/notify";
import { taskAssignedToUserWhere } from "@/src/lib/task-assignees";
import { mapProject } from "@/src/lib/mappers";
import { prisma } from "@/src/lib/prisma";
import {
  activeApprovedUserWhere,
  canBrowsePeerPmPortfolios,
  canCreateProject,
  canManageProjectTasks,
  getProjectAccess,
  loadProjectWithMembers,
  PROJECT_LIST_SCOPE_ALL,
  projectsVisibilityFilter,
  requireActiveApprovedAssignee,
  requireAdminProject,
  requireReadableProject,
  requireApprovedSessionUser,
  type ProjectAccessLevel,
  type ProjectListScope,
  type SessionUser,
} from "@/src/lib/rbac";
import { dbDateToLocalDateString } from "@/src/lib/task-defaults";
import type { Project } from "@/src/lib/types";

export type ProjectMemberUser = {
  id: string;
  name: string;
  email: string;
};

export type ProjectListItem = Project & {
  access: ProjectAccessLevel;
  taskCount: number;
  openIssueCount: number;
  criticalOpenIssueCount: number;
  projectPs: number;
  pActualProject: number;
  pTargetProject: number;
  statusFlag: StatusFlagId;
};

function validateProjectName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ActionError("Please enter a project name.", "VALIDATION");
  }
  if (trimmed.length > 100) {
    throw new ActionError("Project name must be 100 characters or fewer.", "VALIDATION");
  }
  return trimmed;
}

function validateProjectDescription(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length > 500) {
    throw new ActionError(
      "Project description must be 500 characters or fewer.",
      "VALIDATION",
    );
  }
  return trimmed;
}

function validateCustomProjectId(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length > 80) {
    throw new ActionError(
      "Custom Project ID must be 80 characters or fewer.",
      "VALIDATION",
    );
  }
  return trimmed;
}

function withAccess(
  user: SessionUser,
  project: Awaited<ReturnType<typeof loadProjectWithMembers>> & object,
  extras: {
    taskCount: number;
    openIssueCount: number;
    criticalOpenIssueCount: number;
    projectPs: number;
    pActualProject: number;
    pTargetProject: number;
    statusFlag: StatusFlagId;
  },
): ProjectListItem {
  const mapped = mapProject(project);
  return {
    ...mapped,
    access: getProjectAccess(user, project),
    ...extras,
  };
}

export type BrowsableProjectOwner = {
  id: string;
  name: string;
  email: string;
};

/**
 * PMs / Super PMs who own at least one Active project — used by the home-page
 * peer portfolio browser (FR-GOV-05).
 */
export async function listBrowsableProjectOwners(): Promise<
  ActionResult<BrowsableProjectOwner[]>
> {
  try {
    const user = await requireApprovedSessionUser();
    if (!canBrowsePeerPmPortfolios(user)) {
      return actionSuccess([]);
    }

    const owners = await prisma.user.findMany({
      where: {
        ...activeApprovedUserWhere,
        globalRole: { in: ["pm", "super_pm"] },
        ownedProjects: {
          some: {
            lifecycleStatus: "ACTIVE",
            deletedAt: null,
          },
        },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });

    return actionSuccess(owners);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function listProjects(
  scope: ProjectListScope = {},
): Promise<ActionResult<ProjectListItem[]>> {
  try {
    const user = await requireApprovedSessionUser();

    if (scope.browseOwnerId) {
      if (!canBrowsePeerPmPortfolios(user)) {
        throw new ActionError(
          "Only a Project Manager or Super PM may browse another PM’s portfolio.",
          "FORBIDDEN",
        );
      }
      if (scope.browseOwnerId !== PROJECT_LIST_SCOPE_ALL) {
        const owner = await prisma.user.findFirst({
          where: {
            AND: [
              { id: scope.browseOwnerId },
              activeApprovedUserWhere,
              { globalRole: { in: ["pm", "super_pm"] } },
            ],
          },
          select: { id: true },
        });
        if (!owner) {
          throw new ActionError(
            "That Project Manager was not found or is not available.",
            "NOT_FOUND",
          );
        }
      }
    }

    const [projects, holidayRows, openIssueRows] = await Promise.all([
      prisma.project.findMany({
        where: projectsVisibilityFilter(user, scope),
        include: {
          members: { select: { userId: true } },
          tasks: {
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
          },
          _count: { select: { tasks: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.holiday.findMany({ select: { date: true } }),
      prisma.issue.groupBy({
        by: ["projectId", "severity"],
        where: {
          status: { notIn: ["resolved", "closed", "cancelled"] },
        },
        _count: { _all: true },
      }),
    ]);

    const holidayKeys = holidayRows.map((row) =>
      dbDateToLocalDateString(row.date),
    );

    const openByProject = new Map<
      string,
      { openCount: number; criticalOpenCount: number }
    >();
    for (const row of openIssueRows) {
      const current = openByProject.get(row.projectId) ?? {
        openCount: 0,
        criticalOpenCount: 0,
      };
      current.openCount += row._count._all;
      if (row.severity === "critical") {
        current.criticalOpenCount += row._count._all;
      }
      openByProject.set(row.projectId, current);
    }

    return actionSuccess(
      projects.map((project) => {
        const scheduleTasks = project.tasks.map((task) => ({
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
        const health = computeProjectScheduleHealth(
          scheduleTasks,
          holidayKeys,
        );
        const open = openByProject.get(project.id) ?? {
          openCount: 0,
          criticalOpenCount: 0,
        };
        return withAccess(user, project, {
          taskCount: project._count.tasks,
          openIssueCount: open.openCount,
          criticalOpenIssueCount: open.criticalOpenCount,
          projectPs: health.projectPs,
          pActualProject: health.pActualProject,
          pTargetProject: health.pTargetProject,
          statusFlag: health.statusFlag,
        });
      }),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

export async function getProjectById(
  projectId: string,
): Promise<
  ActionResult<{
    project: Project;
    access: ProjectAccessLevel;
    canManage: boolean;
    canWriteTasks: boolean;
    canRaiseIssues: boolean;
    memberUsers: ProjectMemberUser[];
  }>
> {
  try {
    const { user, project, access } = await requireReadableProject(projectId);
    const memberUsers = await loadRosterUsersForPickers(projectId);
    const canRaiseIssues =
      access === "admin" ||
      (user.globalRole === "member" && access !== "none");
    return actionSuccess({
      project: mapProject(project),
      access,
      canManage: access === "admin",
      canWriteTasks: canManageProjectTasks(user, project),
      canRaiseIssues,
      memberUsers,
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function createProject(input: {
  name: string;
  description?: string;
}): Promise<ActionResult<Project>> {
  try {
    const user = await requireApprovedSessionUser();
    if (!canCreateProject(user)) {
      throw new ActionError(
        "You do not have permission to create projects.",
        "FORBIDDEN",
      );
    }

    const name = validateProjectName(input.name);
    const description = validateProjectDescription(input.description ?? "");

    const stamps = auditCreate(user.id);
    const project = await prisma.project.create({
      data: {
        name,
        description,
        ownerId: user.id,
        ...stamps,
        members: {
          create: {
            userId: user.id,
            ...stamps,
          },
        },
      },
      include: {
        members: { select: { userId: true } },
      },
    });

    revalidatePath("/");
    return actionSuccess(mapProject(project));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteProject(
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  // Soft-delete only — physical purge is Super PM / retention (W4B-4).
  return softDeleteProject(projectId);
}

/** Approved, active humans available for roster assignment. */
export async function listDirectoryUsers(): Promise<
  ActionResult<ProjectMemberUser[]>
> {
  try {
    await requireApprovedSessionUser();
    const rows = await prisma.user.findMany({
      where: activeApprovedUserWhere,
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    return actionSuccess(rows);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateProject(input: {
  projectId: string;
  name: string;
  customProjectId?: string;
  description?: string;
  memberUserIds: string[];
}): Promise<
  ActionResult<{ project: Project; memberUsers: ProjectMemberUser[] }>
> {
  try {
    return await withAuditSession(async ({ actorId }) => {
      const { project } = await requireAdminProject(input.projectId);
      if (project.lifecycleStatus === "COMPLETED") {
        throw new ActionError(
          "Completed projects are read-only. Reopen the project to edit.",
          "FORBIDDEN",
        );
      }
      const name = validateProjectName(input.name);
      const customProjectId = validateCustomProjectId(input.customProjectId);
      const description = validateProjectDescription(input.description ?? "");

      const uniqueMemberIds = [
        ...new Set([project.ownerId, ...input.memberUserIds]),
      ];

      const directory = await prisma.user.findMany({
        where: {
          AND: [activeApprovedUserWhere, { id: { in: uniqueMemberIds } }],
        },
        select: { id: true, name: true, email: true },
      });
      if (directory.length !== uniqueMemberIds.length) {
        throw new ActionError(
          "One or more selected members are not approved active users.",
          "VALIDATION",
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.project.update({
          where: { id: input.projectId },
          data: {
            name,
            customProjectId,
            description,
            ...auditUpdate(actorId),
          },
        });

        const existing = await tx.projectMember.findMany({
          where: { projectId: input.projectId },
          select: { userId: true },
        });
        const existingIds = new Set(existing.map((row) => row.userId));
        const nextIds = new Set(uniqueMemberIds);

        const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
        const toAdd = [...nextIds].filter((id) => !existingIds.has(id));

        if (toRemove.length > 0) {
          await tx.projectMember.deleteMany({
            where: {
              projectId: input.projectId,
              userId: { in: toRemove },
            },
          });
        }

        if (toAdd.length > 0) {
          const stamps = auditCreate(actorId);
          await tx.projectMember.createMany({
            data: toAdd.map((userId) => ({
              projectId: input.projectId,
              userId,
              ...stamps,
            })),
          });
        }
      });

      const refreshed = await prisma.project.findUniqueOrThrow({
        where: { id: input.projectId },
        include: { members: { select: { userId: true } } },
      });
      const memberRows = await prisma.projectMember.findMany({
        where: { projectId: input.projectId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { user: { name: "asc" } },
      });

      revalidatePath("/");
      revalidatePath(`/projects/${input.projectId}`);
      return actionSuccess({
        project: mapProject(refreshed),
        memberUsers: memberRows.map((row) => row.user),
      });
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Super PM only: change the designated project owner to another approved PM / Super PM.
 * Always emails the new PM. Tasks currently assigned to the previous owner on this project
 * are moved to the new owner.
 */
export async function reassignProjectOwner(input: {
  projectId: string;
  newOwnerId: string;
}): Promise<
  ActionResult<{ project: Project; memberUsers: ProjectMemberUser[] }>
> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      if (user.globalRole !== "super_pm") {
        throw new ActionError(
          "Only a Super PM may reassign project ownership.",
          "FORBIDDEN",
        );
      }

      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
        select: {
          id: true,
          name: true,
          ownerId: true,
          deletedAt: true,
          lifecycleStatus: true,
        },
      });
      if (!project) {
        throw new ActionError("Project not found.", "NOT_FOUND");
      }
      if (project.deletedAt) {
        throw new ActionError(
          "Cannot reassign ownership of a soft-deleted project.",
          "VALIDATION",
        );
      }
      if (project.ownerId === input.newOwnerId) {
        const refreshed = await loadProjectMembersPayload(input.projectId);
        return actionSuccess(refreshed);
      }

      const newOwner = await requireActiveApprovedAssignee(input.newOwnerId);
      if (newOwner.globalRole !== "pm" && newOwner.globalRole !== "super_pm") {
        throw new ActionError(
          "New owner must be an approved, active PM or Super PM.",
          "VALIDATION",
        );
      }

      const previousOwnerId = project.ownerId;

      const reassignedTitles = await prisma.$transaction(async (tx) => {
        await tx.project.update({
          where: { id: input.projectId },
          data: {
            ownerId: newOwner.id,
            ...auditUpdate(actorId),
          },
        });

        const membership = await tx.projectMember.findUnique({
          where: {
            projectId_userId: {
              projectId: input.projectId,
              userId: newOwner.id,
            },
          },
          select: { id: true },
        });
        if (!membership) {
          await tx.projectMember.create({
            data: {
              projectId: input.projectId,
              userId: newOwner.id,
              ...auditCreate(actorId),
            },
          });
        }

        const tasks = await tx.task.findMany({
          where: {
            projectId: input.projectId,
            ...taskAssignedToUserWhere(previousOwnerId),
          },
          select: {
            id: true,
            title: true,
            assigneeId: true,
            assigneeName: true,
            assignees: { orderBy: { sortOrder: "asc" } },
          },
        });
        for (const task of tasks) {
          const nextPics = (
            task.assignees.length > 0
              ? task.assignees.map((row) => ({
                  userId: row.userId,
                  name: row.assigneeName,
                }))
              : [{ userId: task.assigneeId, name: task.assigneeName }]
          ).map((pic) =>
            pic.userId === previousOwnerId
              ? { userId: newOwner.id, name: newOwner.name }
              : pic,
          );
          const first = nextPics[0];
          await tx.taskAssignee.deleteMany({ where: { taskId: task.id } });
          if (nextPics.length > 0) {
            await tx.taskAssignee.createMany({
              data: nextPics.map((pic, index) => ({
                taskId: task.id,
                userId: pic.userId,
                assigneeName: pic.name,
                sortOrder: index,
                createdBy: actorId,
                updatedBy: actorId,
              })),
            });
          }
          await tx.task.update({
            where: { id: task.id },
            data: {
              assigneeId: first?.userId ?? null,
              assigneeName: first?.name ?? "",
              ...auditUpdate(actorId),
            },
          });
        }

        return tasks.map((task) => task.title);
      });

      void notifyPmOfProjectAssignments({
        recipientName: newOwner.name,
        recipientEmail: newOwner.email,
        items: [
          {
            projectName: project.name,
            taskTitles: reassignedTitles,
          },
        ],
        reason:
          "A Super PM has assigned you as the project owner. Review the project and any tasks transferred from the previous owner.",
      });

      const refreshed = await loadProjectMembersPayload(input.projectId);
      revalidatePath("/");
      revalidatePath(`/projects/${input.projectId}`);
      return actionSuccess(refreshed);
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Assignable people for task PIC pickers: project roster + owning PM + every
 * active Super PM (even if not on the roster checkbox list).
 */
async function loadRosterUsersForPickers(
  projectId: string,
): Promise<ProjectMemberUser[]> {
  const [project, memberRows, superPms] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            approvalStatus: true,
            deactivatedAt: true,
          },
        },
      },
    }),
    prisma.projectMember.findMany({
      where: {
        projectId,
        user: activeApprovedUserWhere,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.user.findMany({
      where: {
        ...activeApprovedUserWhere,
        globalRole: "super_pm",
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const byId = new Map<string, ProjectMemberUser>();
  for (const row of memberRows) {
    byId.set(row.user.id, row.user);
  }
  const owner = project?.owner;
  if (
    owner &&
    owner.approvalStatus === "APPROVED" &&
    owner.deactivatedAt == null &&
    owner.id !== SYSTEM_ACTOR_ID
  ) {
    byId.set(owner.id, {
      id: owner.id,
      name: owner.name,
      email: owner.email,
    });
  }
  for (const superPm of superPms) {
    byId.set(superPm.id, superPm);
  }

  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

async function loadProjectMembersPayload(projectId: string): Promise<{
  project: Project;
  memberUsers: ProjectMemberUser[];
}> {
  const refreshed = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { members: { select: { userId: true } } },
  });
  return {
    project: mapProject(refreshed),
    memberUsers: await loadRosterUsersForPickers(projectId),
  };
}
