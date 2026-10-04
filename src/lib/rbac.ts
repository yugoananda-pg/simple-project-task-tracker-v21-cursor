import "server-only";

import type { ApprovalStatus, CompletedProjectAccess, GlobalRole } from "@/src/lib/types";
import type { Project } from "@prisma/client";
import { redirect } from "next/navigation";

import { ActionError } from "@/src/lib/actions/errors";
import { SYSTEM_ACTOR_ID } from "@/src/lib/audit-display";
import { auditCreate } from "@/src/lib/audit";
import { normaliseEmail } from "@/src/lib/email";
import { prisma } from "@/src/lib/prisma";
import { isPrismaUniqueViolation } from "@/src/lib/prisma-errors";
import { PROJECT_LIST_SCOPE_ALL } from "@/src/lib/project-list-scope";
import { createClient } from "@/src/lib/supabase/server";

export { getRoleLabel } from "@/src/lib/role-labels";
export { PROJECT_LIST_SCOPE_ALL };

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  globalRole: GlobalRole;
  approvalStatus: ApprovalStatus;
  completedProjectAccess: CompletedProjectAccess;
};

export type ProjectAccessLevel = "none" | "read" | "write" | "admin";

export type ProjectWithMembers = Project & {
  members: Array<{ userId: string }>;
};

/** Prisma filter: human accounts that may own/join projects or take task/issue PIC. */
export const activeApprovedUserWhere = {
  approvalStatus: "APPROVED" as const,
  deactivatedAt: null,
  id: { not: SYSTEM_ACTOR_ID },
};

/**
 * Ensures a user may receive operational assignment (project member, task PIC, issue PIC, owner).
 * Pending / rejected / deactivated / System accounts are rejected.
 */
export async function requireActiveApprovedAssignee(userId: string): Promise<{
  id: string;
  name: string;
  email: string;
  globalRole: GlobalRole;
}> {
  if (userId === SYSTEM_ACTOR_ID) {
    throw new ActionError(
      "Only approved, active accounts can be assigned to projects or tasks.",
      "VALIDATION",
    );
  }
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      approvalStatus: "APPROVED",
      deactivatedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      globalRole: true,
    },
  });
  if (!user) {
    throw new ActionError(
      "Only approved, active accounts can be assigned to projects or tasks.",
      "VALIDATION",
    );
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    globalRole: user.globalRole as GlobalRole,
  };
}

export async function getAuthUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function requireAuthUserId(): Promise<string> {
  const userId = await getAuthUserId();
  if (!userId) {
    throw new ActionError("Please sign in to continue.", "UNAUTHORISED");
  }
  return userId;
}

/**
 * Creates the app profile for a newly authenticated Auth user.
 * First human account becomes Super PM + APPROVED; later humans start PENDING.
 * The System actor row is never counted as a human (FR-AUD-03 / FR-GOV-01).
 * Emails are stored in canonical form; duplicate addresses (any case) are rejected.
 */
export async function bootstrapUserProfile(input: {
  id: string;
  email: string;
  name: string;
}): Promise<SessionUser> {
  const email = normaliseEmail(input.email);
  if (!email) {
    throw new ActionError("Please enter a valid email address.", "VALIDATION");
  }

  const existing = await prisma.user.findUnique({ where: { id: input.id } });
  if (existing) {
    // Heal legacy mixed-case rows for this Auth identity only.
    if (existing.email !== email) {
      const clash = await prisma.user.findFirst({
        where: {
          id: { not: existing.id },
          email: { equals: email, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (!clash) {
        try {
          const healed = await prisma.user.update({
            where: { id: existing.id },
            data: { email },
          });
          return toSessionUser(healed);
        } catch (error) {
          if (!isPrismaUniqueViolation(error, "email")) throw error;
        }
      }
    }
    return toSessionUser(existing);
  }

  const emailOwner = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (emailOwner) {
    throw new ActionError(
      "An account with this email already exists.",
      "VALIDATION",
    );
  }

  const humanCount = await prisma.user.count({
    where: { id: { not: SYSTEM_ACTOR_ID } },
  });
  const isFirstHuman = humanCount === 0;
  const globalRole: GlobalRole = isFirstHuman ? "super_pm" : "member";
  const approvalStatus: ApprovalStatus = isFirstHuman ? "APPROVED" : "PENDING";

  try {
    const created = await prisma.user.create({
      data: {
        id: input.id,
        email,
        name: input.name.trim() || email.split("@")[0] || "User",
        globalRole,
        approvalStatus,
        approvedAt: isFirstHuman ? new Date() : null,
        approvedBy: isFirstHuman ? input.id : null,
        completedProjectAccess: globalRole === "super_pm" ? "ALL" : "NONE",
        dashboardAccess:
          globalRole === "super_pm"
            ? (["PROJECT", "PM_PORTFOLIO", "TOTAL_COMPANY"] as const)
            : undefined,
        ...auditCreate(input.id),
      },
    });
    return toSessionUser(created);
  } catch (error) {
    if (isPrismaUniqueViolation(error, "email")) {
      throw new ActionError(
        "An account with this email already exists.",
        "VALIDATION",
      );
    }
    throw error;
  }
}

function toSessionUser(row: {
  id: string;
  email: string;
  name: string;
  globalRole: string;
  approvalStatus: string;
  completedProjectAccess: string;
}): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    globalRole: row.globalRole as GlobalRole,
    approvalStatus: row.approvalStatus as ApprovalStatus,
    completedProjectAccess:
      row.globalRole === "super_pm"
        ? "ALL"
        : (row.completedProjectAccess as CompletedProjectAccess),
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (profile) {
    return toSessionUser(profile);
  }

  const metadataName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : "";
  const email = normaliseEmail(user.email);
  const fallbackName = metadataName || email.split("@")[0] || "User";

  return bootstrapUserProfile({
    id: user.id,
    email,
    name: fallbackName,
  });
}

/** Authenticated profile only — does not enforce approval (pending page / header). */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new ActionError("Please sign in to continue.", "UNAUTHORISED");
  }
  return user;
}

/** Workspace and mutation boundary — FR-GOV-01 / FR-GOV-02. */
export async function requireApprovedSessionUser(): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (user.approvalStatus !== "APPROVED") {
    throw new ActionError("Account pending approval", "FORBIDDEN");
  }
  // Soft-deactivated accounts retain the User row but cannot use the workspace.
  const live = await prisma.user.findUnique({
    where: { id: user.id },
    select: { deactivatedAt: true },
  });
  if (live?.deactivatedAt) {
    throw new ActionError("Account deactivated", "FORBIDDEN");
  }
  return user;
}

/**
 * Page/RSC boundary — redirects instead of throwing so missing sessions do not
 * crash the route (e.g. after a stale cookie or focus refresh).
 */
export async function requireApprovedPageUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.approvalStatus === "REJECTED") {
    redirect("/login?notice=rejected");
  }
  if (user.approvalStatus !== "APPROVED") {
    redirect("/login?notice=awaiting_approval");
  }
  const live = await prisma.user.findUnique({
    where: { id: user.id },
    select: { deactivatedAt: true },
  });
  if (live?.deactivatedAt) {
    redirect("/login");
  }
  return user;
}

export function assertApproved(user: SessionUser): void {
  if (user.approvalStatus !== "APPROVED") {
    throw new ActionError("Account pending approval", "FORBIDDEN");
  }
}

export function getProjectAccess(
  user: SessionUser,
  project: ProjectWithMembers,
): ProjectAccessLevel {
  if (user.globalRole === "super_pm") {
    return "admin";
  }

  const isOwner = project.ownerId === user.id;
  const isMember = project.members.some((member) => member.userId === user.id);

  if (user.globalRole === "pm") {
    // Owning PM: full admin. Peer PM portfolios: read-only (task assignee may still mutate own tasks).
    if (isOwner) return "admin";
    if (!project.deletedAt) return "read";
    return "none";
  }

  if (user.globalRole === "member") {
    // Project-level write removed — Members mutate only tasks assigned to them.
    return isMember ? "read" : "none";
  }

  if (user.globalRole === "viewer") {
    // Visibility is granted via ProjectMember (Settings → Viewer visibility or Edit Project).
    return isMember ? "read" : "none";
  }

  return "none";
}

/**
 * Whether the user may mutate a specific task (status, fields, subtasks).
 * Super PM / owning PM: yes. Others: only when they are the registered assignee
 * and the project is readable and Active.
 */
export function canMutateTask(
  user: SessionUser,
  project: ProjectWithMembers,
  task: { assigneeId: string | null },
): boolean {
  if (project.deletedAt || project.lifecycleStatus === "COMPLETED") {
    return false;
  }
  const access = getProjectAccess(user, project);
  if (access === "admin") return true;
  if (access === "none") return false;
  if (task.assigneeId === user.id) return true;
  // Retained for any future role that still carries project-level write.
  return access === "write";
}

/** Create / reorder / bulk project-task mutations (not assignee self-service). */
export function canManageProjectTasks(
  user: SessionUser,
  project: ProjectWithMembers,
): boolean {
  if (project.deletedAt || project.lifecycleStatus === "COMPLETED") {
    return false;
  }
  return getProjectAccess(user, project) === "admin";
}

export function canCreateProject(user: SessionUser): boolean {
  return user.globalRole === "super_pm" || user.globalRole === "pm";
}

/** Super PM, owning PM (project admin), or assigned PIC may delete a task. */
export function canDeleteTask(
  user: SessionUser,
  project: ProjectWithMembers,
  task: { assigneeId: string | null },
): boolean {
  return canMutateTask(user, project, task);
}

export function canManageProject(
  user: SessionUser,
  project: ProjectWithMembers,
): boolean {
  return getProjectAccess(user, project) === "admin";
}

export function assertProjectRead(
  user: SessionUser,
  project: ProjectWithMembers,
): ProjectAccessLevel {
  if (project.deletedAt) {
    throw new ActionError("Project not found.", "NOT_FOUND");
  }

  const access = getProjectAccess(user, project);
  if (access !== "none") {
    return access;
  }

  // Super PM-granted Completed visibility for non-members (FR-LFC / H.3).
  if (
    project.lifecycleStatus === "COMPLETED" &&
    user.completedProjectAccess === "ALL"
  ) {
    return "read";
  }

  throw new ActionError("You do not have access to this project.", "FORBIDDEN");
}

export function assertProjectWrite(
  user: SessionUser,
  project: ProjectWithMembers,
): ProjectAccessLevel {
  const access = getProjectAccess(user, project);
  // Project-level mutations (create tasks, roster, etc.) require admin.
  // Assignees mutate their own tasks via canMutateTask — not this gate.
  if (access !== "admin" && access !== "write") {
    throw new ActionError(
      "You do not have permission to change this project.",
      "FORBIDDEN",
    );
  }
  return access;
}

export function assertProjectAdmin(
  user: SessionUser,
  project: ProjectWithMembers,
): void {
  const access = getProjectAccess(user, project);
  if (access !== "admin") {
    throw new ActionError(
      "You do not have permission to manage this project.",
      "FORBIDDEN",
    );
  }
}

export async function loadProjectWithMembers(
  projectId: string,
): Promise<ProjectWithMembers | null> {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: {
        select: { userId: true },
      },
    },
  });
}

export async function requireReadableProject(
  projectId: string,
): Promise<{ user: SessionUser; project: ProjectWithMembers; access: ProjectAccessLevel }> {
  const user = await requireApprovedSessionUser();
  const project = await loadProjectWithMembers(projectId);
  if (!project || project.deletedAt) {
    throw new ActionError("Project not found.", "NOT_FOUND");
  }
  const access = assertProjectRead(user, project);
  return { user, project, access };
}

export async function requireWritableProject(
  projectId: string,
): Promise<{ user: SessionUser; project: ProjectWithMembers }> {
  const user = await requireApprovedSessionUser();
  const project = await loadProjectWithMembers(projectId);
  if (!project || project.deletedAt) {
    throw new ActionError("Project not found.", "NOT_FOUND");
  }
  if (project.lifecycleStatus === "COMPLETED") {
    throw new ActionError(
      "Completed projects are read-only. Reopen the project to edit.",
      "FORBIDDEN",
    );
  }
  assertProjectWrite(user, project);
  return { user, project };
}

export async function requireAdminProject(
  projectId: string,
): Promise<{ user: SessionUser; project: ProjectWithMembers }> {
  const user = await requireApprovedSessionUser();
  const project = await loadProjectWithMembers(projectId);
  if (!project || project.deletedAt) {
    throw new ActionError("Project not found.", "NOT_FOUND");
  }
  assertProjectAdmin(user, project);
  return { user, project };
}

export type ProjectListScope = {
  /**
   * When set to a user id (PM / Super PM), list Active projects owned by them.
   * When set to {@link PROJECT_LIST_SCOPE_ALL}, list every Active project.
   * Empty / null = “My projects” (owned ∪ tasked).
   */
  browseOwnerId?: string | null;
};

/** Active, non-deleted projects for the landing page. */
export function projectsVisibilityFilter(
  user: SessionUser,
  scope: ProjectListScope = {},
) {
  const lifecycle = {
    lifecycleStatus: "ACTIVE" as const,
    deletedAt: null,
  };

  const browseOwnerId = scope.browseOwnerId?.trim() || null;

  // PM and Super PM share the same landing scopes. Super PM still has absolute
  // open/admin rights on every project; the home list is intentionally scoped.
  if (user.globalRole === "super_pm" || user.globalRole === "pm") {
    if (browseOwnerId === PROJECT_LIST_SCOPE_ALL) {
      return lifecycle;
    }
    if (browseOwnerId && browseOwnerId !== user.id) {
      return { ...lifecycle, ownerId: browseOwnerId };
    }
    // Default ("My projects"): owned programmes, or programmes with a task assigned to me.
    return {
      ...lifecycle,
      OR: [
        { ownerId: user.id },
        { tasks: { some: { assigneeId: user.id } } },
      ],
    };
  }

  // Member / Viewer: only projects where Super PM (or owning PM) granted membership.
  return {
    ...lifecycle,
    members: { some: { userId: user.id } },
  };
}

/** True when the role may browse another PM's Active portfolio on the home page. */
export function canBrowsePeerPmPortfolios(user: SessionUser): boolean {
  return user.globalRole === "super_pm" || user.globalRole === "pm";
}

/** Completed, non-deleted visibility for `/projects/completed`. */
export function completedProjectsVisibilityFilter(user: SessionUser) {
  const base = {
    lifecycleStatus: "COMPLETED" as const,
    deletedAt: null,
  };

  if (user.globalRole === "super_pm" || user.completedProjectAccess === "ALL") {
    return base;
  }

  // Owning PM always sees owned completed; ASSIGNED also includes membership.
  if (user.completedProjectAccess === "ASSIGNED") {
    return {
      ...base,
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } },
      ],
    };
  }

  // NONE (default): owning PM still sees own completed projects.
  return {
    ...base,
    ownerId: user.id,
  };
}

export function canAccessCompletedWorkspace(user: SessionUser): boolean {
  if (user.globalRole === "super_pm") return true;
  if (user.completedProjectAccess === "ALL") return true;
  if (user.completedProjectAccess === "ASSIGNED") return true;
  // Owning PMs always have an entry point (list may be empty).
  return user.globalRole === "pm";
}
