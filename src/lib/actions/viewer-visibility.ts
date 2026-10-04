"use server";

import { revalidatePath } from "next/cache";

import {
  actionFailure,
  actionSuccess,
  ActionError,
  type ActionResult,
} from "@/src/lib/actions/errors";
import { auditCreate, withAuditSession } from "@/src/lib/audit";
import { prisma } from "@/src/lib/prisma";
import {
  activeApprovedUserWhere,
  requireApprovedSessionUser,
  type SessionUser,
} from "@/src/lib/rbac";

export type ViewerDirectoryRow = {
  id: string;
  name: string;
  email: string;
  /** Count of Active (non-deleted) projects currently granted via ProjectMember. */
  grantedActiveCount: number;
};

export type ViewerGrantProjectRow = {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  granted: boolean;
};

function requireSuperPm(user: SessionUser): void {
  if (user.globalRole !== "super_pm") {
    throw new ActionError(
      "Only a Super PM may manage Viewer project visibility.",
      "FORBIDDEN",
    );
  }
}

async function requireActiveViewer(viewerUserId: string) {
  const viewer = await prisma.user.findFirst({
    where: {
      AND: [
        { id: viewerUserId },
        activeApprovedUserWhere,
        { globalRole: "viewer" },
      ],
    },
    select: { id: true, name: true, email: true },
  });
  if (!viewer) {
    throw new ActionError(
      "Select an approved, active Viewer account.",
      "VALIDATION",
    );
  }
  return viewer;
}

/**
 * Super PM directory of approved Viewers with how many Active projects each can see.
 */
export async function listViewerVisibilityDirectory(): Promise<
  ActionResult<ViewerDirectoryRow[]>
> {
  try {
    const user = await requireApprovedSessionUser();
    requireSuperPm(user);

    const viewers = await prisma.user.findMany({
      where: {
        ...activeApprovedUserWhere,
        globalRole: "viewer",
      },
      select: {
        id: true,
        name: true,
        email: true,
        projectMembers: {
          where: {
            project: {
              deletedAt: null,
              lifecycleStatus: "ACTIVE",
            },
          },
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return actionSuccess(
      viewers.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        grantedActiveCount: row.projectMembers.length,
      })),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Active programmes plus whether the selected Viewer already has ProjectMember access.
 */
export async function listViewerProjectGrants(
  viewerUserId: string,
): Promise<ActionResult<ViewerGrantProjectRow[]>> {
  try {
    const user = await requireApprovedSessionUser();
    requireSuperPm(user);
    await requireActiveViewer(viewerUserId);

    const [projects, memberships] = await Promise.all([
      prisma.project.findMany({
        where: {
          deletedAt: null,
          lifecycleStatus: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          owner: { select: { name: true, email: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.projectMember.findMany({
        where: {
          userId: viewerUserId,
          project: {
            deletedAt: null,
            lifecycleStatus: "ACTIVE",
          },
        },
        select: { projectId: true },
      }),
    ]);

    const granted = new Set(memberships.map((row) => row.projectId));
    return actionSuccess(
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        ownerName: project.owner.name,
        ownerEmail: project.owner.email,
        granted: granted.has(project.id),
      })),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Replace the selected Viewer’s Active-project memberships with `projectIds`.
 * Other members on those projects are untouched. Soft-deleted / Completed
 * memberships for the Viewer are left alone (Completed visibility remains
 * FR-GOV-04A).
 */
export async function syncViewerProjectGrants(input: {
  viewerUserId: string;
  projectIds: string[];
}): Promise<
  ActionResult<{
    viewerUserId: string;
    grantedActiveCount: number;
    added: number;
    removed: number;
  }>
> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user!);
      const viewer = await requireActiveViewer(input.viewerUserId);

      const uniqueProjectIds = [...new Set(input.projectIds)];

      if (uniqueProjectIds.length > 0) {
        const activeProjects = await prisma.project.findMany({
          where: {
            id: { in: uniqueProjectIds },
            deletedAt: null,
            lifecycleStatus: "ACTIVE",
          },
          select: { id: true, ownerId: true },
        });
        if (activeProjects.length !== uniqueProjectIds.length) {
          throw new ActionError(
            "One or more selected projects are missing, completed, or deleted.",
            "VALIDATION",
          );
        }
        // A Viewer must never become the sole owner-linked admin via this path.
        for (const project of activeProjects) {
          if (project.ownerId === viewer.id) {
            throw new ActionError(
              "Cannot change membership for a project this account owns.",
              "VALIDATION",
            );
          }
        }
      }

      const existing = await prisma.projectMember.findMany({
        where: {
          userId: viewer.id,
          project: {
            deletedAt: null,
            lifecycleStatus: "ACTIVE",
          },
        },
        select: { projectId: true },
      });
      const existingIds = new Set(existing.map((row) => row.projectId));
      const nextIds = new Set(uniqueProjectIds);

      const toAdd = [...nextIds].filter((id) => !existingIds.has(id));
      const toRemove = [...existingIds].filter((id) => !nextIds.has(id));

      await prisma.$transaction(async (tx) => {
        if (toRemove.length > 0) {
          await tx.projectMember.deleteMany({
            where: {
              userId: viewer.id,
              projectId: { in: toRemove },
            },
          });
        }
        if (toAdd.length > 0) {
          const stamps = auditCreate(actorId);
          await tx.projectMember.createMany({
            data: toAdd.map((projectId) => ({
              projectId,
              userId: viewer.id,
              ...stamps,
            })),
            skipDuplicates: true,
          });
        }
      });

      revalidatePath("/");
      revalidatePath("/settings/viewer-visibility");
      for (const projectId of [...toAdd, ...toRemove]) {
        revalidatePath(`/projects/${projectId}`);
      }

      return actionSuccess({
        viewerUserId: viewer.id,
        grantedActiveCount: uniqueProjectIds.length,
        added: toAdd.length,
        removed: toRemove.length,
      });
    });
  } catch (error) {
    return actionFailure(error);
  }
}
