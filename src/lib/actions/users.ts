"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";

import {
  validateConfirmPassword,
  validateEmail,
  validateName,
  validatePassword,
} from "@/src/components/auth/auth-validation";
import {
  actionFailure,
  actionSuccess,
  ActionError,
  type ActionResult,
} from "@/src/lib/actions/errors";
import { auditCreate, auditUpdate, withAuditSession } from "@/src/lib/audit";
import {
  privilegeDefaultsForRole,
  sanitizeDashboardScopes,
} from "@/src/lib/dashboard-access";
import { SYSTEM_ACTOR_ID } from "@/src/lib/audit-display";
import { DUPLICATE_EMAIL_PROVISION_MESSAGE } from "@/src/lib/auth-messages";
import { normaliseEmail } from "@/src/lib/email";
import {
  notifyApplicantApproved,
  notifyApplicantRejected,
  notifyPmOfProjectAssignments,
  notifySuperPmsOfUpcomingUserPurges,
  type PmAssignmentEmailItem,
} from "@/src/lib/mail/notify";
import { generateTemporaryPassword } from "@/src/lib/password";
import { prisma } from "@/src/lib/prisma";
import { isPrismaUniqueViolation } from "@/src/lib/prisma-errors";
import {
  activeApprovedUserWhere,
  requireApprovedSessionUser,
  type SessionUser,
} from "@/src/lib/rbac";
import {
  SOFT_DELETE_RETENTION_DAYS,
  USER_PURGE_WARNING_DAYS_BEFORE,
  addCalendarDays,
} from "@/src/lib/retention";
import { getRoleLabel } from "@/src/lib/role-labels";
import { createAdminClient } from "@/src/lib/supabase/admin";
import type {
  ApprovalStatus,
  CompletedProjectAccess,
  DashboardScope,
  GlobalRole,
} from "@/src/lib/types";

export type ManagedUserDto = {
  id: string;
  email: string;
  name: string;
  globalRole: GlobalRole;
  approvalStatus: ApprovalStatus;
  approvedAt: string | null;
  approvedBy: string | null;
  emailConfirmedAt: string | null;
  dashboardAccess: DashboardScope[];
  completedProjectAccess: CompletedProjectAccess;
  deactivatedAt: string | null;
  purgeDueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Governance mutation payload including optional notification delivery status. */
export type ManagedUserWithMailDto = {
  user: ManagedUserDto;
  emailDelivered: boolean;
  emailSkipReason?: string;
};

export type CandidatePmDto = {
  id: string;
  name: string;
  email: string;
  globalRole: GlobalRole;
};

export type OwnedProjectHandoverDto = {
  id: string;
  name: string;
  taskAssignedToTargetCount: number;
};

export type UserDeletionImpact = {
  userId: string;
  name: string;
  email: string;
  globalRole: GlobalRole;
  ownedProjects: OwnedProjectHandoverDto[];
  candidatePms: CandidatePmDto[];
  warningMessage: string;
  mode: "pm_handover" | "member" | "viewer";
  assignedTaskCount: number;
  issuePicCount: number;
  membershipCount: number;
};

export type ProjectOwnerAssignment = {
  projectId: string;
  newOwnerId: string;
};

type TxClient = Prisma.TransactionClient;

type PmRecipientBucket = {
  recipientName: string;
  recipientEmail: string;
  items: Map<string, { projectName: string; taskTitles: string[] }>;
};

function requireSuperPm(user: SessionUser): void {
  if (user.globalRole !== "super_pm") {
    throw new ActionError(
      "Only a Super PM may manage user governance.",
      "FORBIDDEN",
    );
  }
}

function mapManagedUser(row: {
  id: string;
  email: string;
  name: string;
  globalRole: GlobalRole;
  approvalStatus: ApprovalStatus;
  approvedAt: Date | null;
  approvedBy: string | null;
  emailConfirmedAt: Date | null;
  dashboardAccess: DashboardScope[];
  completedProjectAccess: CompletedProjectAccess;
  deactivatedAt: Date | null;
  purgeDueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ManagedUserDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    globalRole: row.globalRole,
    approvalStatus: row.approvalStatus,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
    emailConfirmedAt: row.emailConfirmedAt?.toISOString() ?? null,
    dashboardAccess: row.dashboardAccess,
    completedProjectAccess: row.completedProjectAccess,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    purgeDueAt: row.purgeDueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const managedUserSelect = {
  id: true,
  email: true,
  name: true,
  globalRole: true,
  approvalStatus: true,
  approvedAt: true,
  approvedBy: true,
  emailConfirmedAt: true,
  dashboardAccess: true,
  completedProjectAccess: true,
  deactivatedAt: true,
  purgeDueAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function revalidateUserGovernancePaths() {
  revalidatePath("/settings/users");
  revalidatePath("/settings");
  revalidatePath("/pending-approval");
  revalidatePath("/", "layout");
}

/** Super PM governance console — excludes the System actor row. */
export async function listManagedUsers(): Promise<
  ActionResult<ManagedUserDto[]>
> {
  try {
    const user = await requireApprovedSessionUser();
    requireSuperPm(user);

    const rows = await prisma.user.findMany({
      where: { id: { not: SYSTEM_ACTOR_ID } },
      orderBy: [{ approvalStatus: "asc" }, { createdAt: "desc" }],
      select: managedUserSelect,
    });

    return actionSuccess(rows.map(mapManagedUser));
  } catch (error) {
    return actionFailure(error);
  }
}

/** Approved, active PM / Super PM roster for owner reassignment. */
export async function listAssignableProjectManagers(input?: {
  excludeUserId?: string;
}): Promise<ActionResult<CandidatePmDto[]>> {
  try {
    const user = await requireApprovedSessionUser();
    requireSuperPm(user);

    const rows = await loadCandidatePms(input?.excludeUserId);
    return actionSuccess(rows);
  } catch (error) {
    return actionFailure(error);
  }
}

/** Count of email-confirmed humans still waiting for Super PM approval. */
export async function countPendingApprovals(): Promise<number> {
  return prisma.user.count({
    where: {
      id: { not: SYSTEM_ACTOR_ID },
      approvalStatus: "PENDING",
      emailConfirmedAt: { not: null },
      deactivatedAt: null,
    },
  });
}

/**
 * Super PM provisions a known person into an immediately usable account.
 * Bypasses self-service email confirmation and the approval queue (FR-GOV-07).
 * Requires SUPABASE_SERVICE_ROLE_KEY.
 */
export async function provisionUserBySuperPm(input: {
  name: string;
  email: string;
  temporaryPassword: string;
  confirmPassword: string;
  globalRole: GlobalRole;
}): Promise<ActionResult<ManagedUserDto>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user);

      const nameError = validateName(input.name);
      if (nameError) throw new ActionError(nameError, "VALIDATION");
      const emailError = validateEmail(input.email);
      if (emailError) throw new ActionError(emailError, "VALIDATION");
      const passwordError = validatePassword(input.temporaryPassword);
      if (passwordError) throw new ActionError(passwordError, "VALIDATION");
      const confirmError = validateConfirmPassword(
        input.temporaryPassword,
        input.confirmPassword,
      );
      if (confirmError) throw new ActionError(confirmError, "VALIDATION");
      if (!isGlobalRole(input.globalRole)) {
        throw new ActionError("Please select a valid role.", "VALIDATION");
      }

      const email = normaliseEmail(input.email);
      const name = input.name.trim();

      const existingProfile = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existingProfile) {
        throw new ActionError(DUPLICATE_EMAIL_PROVISION_MESSAGE, "VALIDATION");
      }

      const admin = createAdminClient();
      if (!admin) {
        throw new ActionError(
          "Account provisioning requires SUPABASE_SERVICE_ROLE_KEY on the server.",
          "VALIDATION",
        );
      }

      const { data: createdAuth, error: authError } =
        await admin.auth.admin.createUser({
          email,
          password: input.temporaryPassword,
          email_confirm: true,
          user_metadata: { name },
        });

      if (authError || !createdAuth.user?.id) {
        const message = (authError?.message ?? "").toLowerCase();
        if (
          message.includes("already") ||
          message.includes("registered") ||
          authError?.code === "email_exists" ||
          authError?.code === "user_already_exists"
        ) {
          throw new ActionError(DUPLICATE_EMAIL_PROVISION_MESSAGE, "VALIDATION");
        }
        console.error(
          "[users] provisionUserBySuperPm Auth create failed:",
          authError?.message,
          authError?.code,
        );
        throw new ActionError(
          "Unable to create the Auth identity. Please try again.",
          "VALIDATION",
        );
      }

      const authUserId = createdAuth.user.id;
      const now = new Date();
      const privileges = privilegeDefaultsForRole(input.globalRole);

      try {
        const row = await prisma.user.create({
          data: {
            id: authUserId,
            email,
            name,
            globalRole: input.globalRole,
            approvalStatus: "APPROVED",
            emailConfirmedAt: now,
            approvedAt: now,
            approvedBy: actorId,
            dashboardAccess: privileges.dashboardAccess,
            completedProjectAccess: privileges.completedProjectAccess,
            projectVisibilityMode: "SELECTED",
            ...auditCreate(actorId),
          },
        });

        revalidateUserGovernancePaths();
        return actionSuccess(mapManagedUser(row));
      } catch (error) {
        const { error: rollbackError } =
          await admin.auth.admin.deleteUser(authUserId);
        if (rollbackError) {
          console.error(
            "[users] Failed to roll back Auth user after provision error:",
            authUserId,
            rollbackError.message,
          );
        }
        if (isPrismaUniqueViolation(error, "email")) {
          throw new ActionError(DUPLICATE_EMAIL_PROVISION_MESSAGE, "VALIDATION");
        }
        throw error;
      }
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Super PM generates a temporary password for a user and returns it once for
 * secure out-of-band hand-off (when the user cannot receive email).
 */
export async function resetUserPasswordBySuperPm(
  userId: string,
): Promise<
  ActionResult<{
    userId: string;
    email: string;
    name: string;
    temporaryPassword: string;
  }>
> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user);
      assertMutableTarget(userId, actorId);

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) {
        throw new ActionError("User not found.", "NOT_FOUND");
      }
      if (target.deactivatedAt) {
        throw new ActionError(
          "Cannot reset the password for a deactivated account. Reactivate it first, or permanently delete it.",
          "VALIDATION",
        );
      }

      const admin = createAdminClient();
      if (!admin) {
        throw new ActionError(
          "Password reset requires SUPABASE_SERVICE_ROLE_KEY on the server.",
          "VALIDATION",
        );
      }

      const temporaryPassword = generateTemporaryPassword();
      const { error: updateError } = await admin.auth.admin.updateUserById(
        userId,
        { password: temporaryPassword },
      );
      if (updateError) {
        console.error(
          "[users] resetUserPasswordBySuperPm failed:",
          updateError.message,
          updateError.code,
        );
        throw new ActionError(
          "Unable to reset this password right now. Please try again.",
          "VALIDATION",
        );
      }

      await prisma.user.update({
        where: { id: userId },
        data: { ...auditUpdate(actorId) },
      });

      return actionSuccess({
        userId: target.id,
        email: target.email,
        name: target.name,
        temporaryPassword,
      });
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Super PM updates another user's display name. Email remains immutable.
 */
export async function updateManagedUserName(input: {
  userId: string;
  name: string;
}): Promise<ActionResult<ManagedUserDto>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user);
      assertMutableTarget(input.userId, actorId);

      const nameError = validateName(input.name);
      if (nameError) throw new ActionError(nameError, "VALIDATION");

      const target = await prisma.user.findUnique({
        where: { id: input.userId },
      });
      if (!target) {
        throw new ActionError("User not found.", "NOT_FOUND");
      }
      if (target.deactivatedAt) {
        throw new ActionError(
          "Cannot edit a deactivated account. Reactivate it first.",
          "VALIDATION",
        );
      }

      const row = await prisma.user.update({
        where: { id: input.userId },
        data: {
          name: input.name.trim(),
          ...auditUpdate(actorId),
        },
        select: managedUserSelect,
      });

      const admin = createAdminClient();
      if (admin) {
        const { error: metaError } = await admin.auth.admin.updateUserById(
          input.userId,
          { user_metadata: { name: input.name.trim() } },
        );
        if (metaError) {
          console.warn(
            "[users] Auth metadata name sync failed:",
            metaError.message,
          );
        }
      }

      revalidateUserGovernancePaths();
      return actionSuccess(mapManagedUser(row));
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function approveUser(input: {
  userId: string;
  globalRole: GlobalRole;
}): Promise<ActionResult<ManagedUserWithMailDto>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user);
      assertMutableTarget(input.userId, actorId);

      if (!isGlobalRole(input.globalRole)) {
        throw new ActionError("Please select a valid role.", "VALIDATION");
      }

      const target = await prisma.user.findUnique({
        where: { id: input.userId },
      });
      if (!target) {
        throw new ActionError("User not found.", "NOT_FOUND");
      }
      if (target.deactivatedAt) {
        throw new ActionError(
          "This account is deactivated. Use Reactivate on the Safe deletion tab instead of approving again.",
          "VALIDATION",
        );
      }
      if (target.approvalStatus === "APPROVED") {
        return actionSuccess({
          user: mapManagedUser(target),
          emailDelivered: false,
          emailSkipReason: "Already approved — use Resend approval email if needed",
        });
      }
      if (!target.emailConfirmedAt) {
        throw new ActionError(
          "This account has not confirmed its email yet. It cannot be approved until the registrant confirms their address.",
          "VALIDATION",
        );
      }

      const defaults = privilegeDefaultsForRole(input.globalRole);
      const completedProjectAccess =
        input.globalRole === "super_pm"
          ? "ALL"
          : target.completedProjectAccess;

      const updated = await prisma.user.update({
        where: { id: input.userId },
        data: {
          approvalStatus: "APPROVED",
          approvedAt: new Date(),
          approvedBy: actorId,
          globalRole: input.globalRole,
          completedProjectAccess,
          dashboardAccess: defaults.dashboardAccess,
          projectVisibilityMode: "SELECTED",
          ...auditUpdate(actorId),
        },
      });

      const applicantName = updated.name;
      const applicantEmail = updated.email;
      const roleLabel = getRoleLabel(updated.globalRole as GlobalRole);
      after(async () => {
        const mail = await notifyApplicantApproved({
          applicantName,
          applicantEmail,
          roleLabel,
        });
        if (!mail.sent) {
          console.warn(
            "[users] Approval email not sent:",
            mail.reason,
            "→",
            applicantEmail,
          );
        }
      });

      revalidateUserGovernancePaths();
      return actionSuccess({
        user: mapManagedUser(updated),
        emailDelivered: true,
        emailSkipReason: undefined,
      });
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function rejectUser(
  userId: string,
): Promise<ActionResult<ManagedUserWithMailDto>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user);
      assertMutableTarget(userId, actorId);

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) {
        throw new ActionError("User not found.", "NOT_FOUND");
      }
      if (target.globalRole === "super_pm") {
        throw new ActionError(
          "A Super PM account cannot be rejected from this console.",
          "FORBIDDEN",
        );
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          approvalStatus: "REJECTED",
          approvedAt: null,
          approvedBy: actorId,
          ...auditUpdate(actorId),
        },
      });

      const applicantName = updated.name;
      const applicantEmail = updated.email;
      after(async () => {
        const mail = await notifyApplicantRejected({
          applicantName,
          applicantEmail,
        });
        if (!mail.sent) {
          console.warn(
            "[users] Rejection email not sent:",
            mail.reason,
            "→",
            applicantEmail,
          );
        }
      });

      revalidateUserGovernancePaths();
      return actionSuccess({
        user: mapManagedUser(updated),
        emailDelivered: true,
        emailSkipReason: undefined,
      });
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/** Re-send the approval notification to an already-approved account. */
export async function resendApprovalEmail(
  userId: string,
): Promise<ActionResult<ManagedUserWithMailDto>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user);
      assertMutableTarget(userId, actorId);

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) {
        throw new ActionError("User not found.", "NOT_FOUND");
      }
      if (target.deactivatedAt) {
        throw new ActionError(
          "This account is deactivated. Reactivate it before sending mail.",
          "VALIDATION",
        );
      }
      if (target.approvalStatus !== "APPROVED") {
        throw new ActionError(
          "Only approved accounts can receive an approval email.",
          "VALIDATION",
        );
      }

      const mail = await notifyApplicantApproved({
        applicantName: target.name,
        applicantEmail: target.email,
        roleLabel: getRoleLabel(target.globalRole as GlobalRole),
      });

      return actionSuccess({
        user: mapManagedUser(target),
        emailDelivered: mail.sent,
        emailSkipReason: mail.reason,
      });
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateUserPrivileges(input: {
  userId: string;
  globalRole: GlobalRole;
  dashboardAccess: DashboardScope[];
  completedProjectAccess: CompletedProjectAccess;
}): Promise<ActionResult<ManagedUserDto>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user);
      assertMutableTarget(input.userId, actorId);

      const target = await prisma.user.findUnique({
        where: { id: input.userId },
      });
      if (!target) {
        throw new ActionError("User not found.", "NOT_FOUND");
      }
      if (target.deactivatedAt) {
        throw new ActionError(
          "Cannot change privileges on a deactivated account.",
          "VALIDATION",
        );
      }

      if (
        target.globalRole === "super_pm" &&
        input.globalRole !== "super_pm"
      ) {
        throw new ActionError(
          "Demoting a Super PM is not supported from this console.",
          "FORBIDDEN",
        );
      }

      const scopes =
        input.globalRole === "super_pm"
          ? privilegeDefaultsForRole("super_pm").dashboardAccess
          : sanitizeDashboardScopes(input.dashboardAccess);
      const completedAccess =
        input.globalRole === "super_pm"
          ? ("ALL" as const)
          : input.completedProjectAccess;

      if (!isCompletedAccess(completedAccess)) {
        throw new ActionError(
          "Invalid completed-project visibility value.",
          "VALIDATION",
        );
      }
      if (!isGlobalRole(input.globalRole)) {
        throw new ActionError("Invalid global role.", "VALIDATION");
      }

      const updated = await prisma.user.update({
        where: { id: input.userId },
        data: {
          globalRole: input.globalRole,
          dashboardAccess: scopes,
          completedProjectAccess:
            input.globalRole === "super_pm" ? "ALL" : completedAccess,
          ...(input.globalRole === "viewer" && target.globalRole !== "viewer"
            ? { projectVisibilityMode: "SELECTED" as const }
            : {}),
          ...auditUpdate(actorId),
        },
      });

      revalidatePath("/settings/users");
      return actionSuccess(mapManagedUser(updated));
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function getUserDeletionImpact(
  userId: string,
): Promise<ActionResult<UserDeletionImpact>> {
  try {
    const user = await requireApprovedSessionUser();
    requireSuperPm(user);
    assertMutableTarget(userId, user.id);

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      throw new ActionError("User not found.", "NOT_FOUND");
    }
    if (target.deactivatedAt) {
      throw new ActionError("This account is already deactivated.", "VALIDATION");
    }

    const role = target.globalRole as GlobalRole;
    const mode = deletionModeForRole(role);

    const [ownedProjects, assignedTaskCount, issuePicCount, membershipCount] =
      await Promise.all([
        prisma.project.findMany({
          where: { ownerId: userId },
          select: {
            id: true,
            name: true,
            _count: {
              select: { tasks: { where: { assigneeId: userId } } },
            },
          },
          orderBy: { name: "asc" },
        }),
        prisma.task.count({ where: { assigneeId: userId } }),
        prisma.issue.count({ where: { picId: userId } }),
        prisma.projectMember.count({ where: { userId } }),
      ]);

    const candidatePms =
      mode === "pm_handover" ? await loadCandidatePms(userId) : [];

    return actionSuccess({
      userId,
      name: target.name,
      email: target.email,
      globalRole: role,
      ownedProjects: ownedProjects.map((project) => ({
        id: project.id,
        name: project.name,
        taskAssignedToTargetCount: project._count.tasks,
      })),
      candidatePms,
      warningMessage: buildDeletionWarning(mode, target.name, ownedProjects.length),
      mode,
      assignedTaskCount,
      issuePicCount,
      membershipCount,
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Safe Account Deactivation (FR-GOV-06): reassign assets by role, then soft-deactivate
 * with a 30-day purge window. The User row remains for audit JOIN name resolution.
 */
export async function deactivateUser(input: {
  userId: string;
  projectAssignments?: ProjectOwnerAssignment[];
}): Promise<ActionResult<ManagedUserDto>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user);
      assertMutableTarget(input.userId, actorId);

      const target = await prisma.user.findUnique({
        where: { id: input.userId },
      });
      if (!target) {
        throw new ActionError("User not found.", "NOT_FOUND");
      }
      if (target.deactivatedAt) {
        return actionSuccess(mapManagedUser(target));
      }

      const role = target.globalRole as GlobalRole;
      const mode = deletionModeForRole(role);

      if (role === "super_pm") {
        await assertSurvivingSuperPm(input.userId);
      }

      const emailBuckets = new Map<string, PmRecipientBucket>();

      const updated = await prisma.$transaction(async (tx) => {
        if (mode === "pm_handover") {
          await handoverPmAssets({
            tx,
            targetId: input.userId,
            targetName: target.name,
            actorId,
            projectAssignments: input.projectAssignments ?? [],
            emailBuckets,
          });
        } else if (mode === "member") {
          await reassignTasksAndPicsToProjectOwners({
            tx,
            targetId: input.userId,
            targetName: target.name,
            actorId,
            projectIds: null,
          });
        }

        await tx.projectMember.deleteMany({ where: { userId: input.userId } });

        const now = new Date();
        return tx.user.update({
          where: { id: input.userId },
          data: {
            deactivatedAt: now,
            deactivatedBy: actorId,
            approvalStatus: "REJECTED",
            purgeDueAt: addCalendarDays(now, SOFT_DELETE_RETENTION_DAYS),
            purgeWarningSentAt: null,
            ...auditUpdate(actorId),
          },
        });
      });

      if (mode === "pm_handover") {
        await sendAggregatedPmAssignmentEmails(
          emailBuckets,
          `Projects and tasks previously owned or assigned to ${target.name} have been transferred to you as part of a safe account deactivation.`,
        );
      }

      revalidateUserGovernancePaths();
      revalidatePath("/");
      return actionSuccess(mapManagedUser(updated));
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * @deprecated Prefer `deactivateUser`. Kept as an alias so stale Turbopack / HMR
 * bundles that still import the Wave 4B-2 name do not crash the Settings page.
 */
export async function deactivateUserWithHandover(input: {
  userId: string;
  projectAssignments?: ProjectOwnerAssignment[];
  /** Legacy single-replacement field — ignored; use projectAssignments. */
  replacementUserId?: string | null;
}): Promise<ActionResult<ManagedUserDto>> {
  return deactivateUser({
    userId: input.userId,
    projectAssignments: input.projectAssignments,
  });
}

/** Restore a soft-deactivated account without requiring re-registration. */
export async function reactivateUser(
  userId: string,
): Promise<ActionResult<ManagedUserDto>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user);
      assertMutableTarget(userId, actorId);

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) {
        throw new ActionError("User not found.", "NOT_FOUND");
      }
      if (!target.deactivatedAt) {
        throw new ActionError("This account is not deactivated.", "VALIDATION");
      }

      const ownedCount = await prisma.project.count({
        where: { ownerId: userId },
      });
      if (ownedCount > 0) {
        throw new ActionError(
          "Cannot reactivate while this account still owns projects. Reassign ownership first.",
          "VALIDATION",
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.projectMember.deleteMany({ where: { userId } });

        await tx.task.updateMany({
          where: { assigneeId: userId },
          data: {
            assigneeId: null,
            assigneeName: "",
            ...auditUpdate(actorId),
          },
        });

        const leftoverIssues = await tx.issue.findMany({
          where: { picId: userId },
          select: { id: true, projectId: true },
        });
        if (leftoverIssues.length > 0) {
          await tx.issue.updateMany({
            where: { picId: userId },
            data: {
              picId: null,
              picName: "",
              ...auditUpdate(actorId),
            },
          });
          await tx.issueActivity.createMany({
            data: leftoverIssues.map((issue) => ({
              projectId: issue.projectId,
              issueId: issue.id,
              eventType: "PIC_CHANGED" as const,
              summary: `PIC cleared from ${target.name} during account reactivation.`,
              payloadJson: {
                fromPicId: userId,
                toPicId: null,
                reason: "SAFE_USER_REACTIVATION",
              },
              createdBy: actorId,
            })),
          });
        }

        return tx.user.update({
          where: { id: userId },
          data: {
            deactivatedAt: null,
            deactivatedBy: null,
            purgeDueAt: null,
            purgeWarningSentAt: null,
            approvalStatus: "APPROVED",
            approvedAt: target.approvedAt ?? new Date(),
            approvedBy: target.approvedBy ?? actorId,
            ...auditUpdate(actorId),
          },
        });
      });

      revalidateUserGovernancePaths();
      return actionSuccess(mapManagedUser(updated));
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Permanently remove a soft-deactivated account. Requires zero owned projects.
 * Also attempts to delete the matching Supabase Auth identity when a service role key is configured.
 */
export async function hardDeleteUser(
  userId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user);
      assertMutableTarget(userId, actorId);

      await physicallyDeleteUser({
        userId,
        actorId,
        requireDeactivated: true,
      });

      revalidateUserGovernancePaths();
      return actionSuccess({ id: userId });
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Permanently remove a registration applicant (PENDING or REJECTED) who was never
 * put through Safe deletion. Still blocks if they own projects (defence in depth).
 */
export async function deleteRegistrationApplicant(
  userId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      requireSuperPm(user);
      assertMutableTarget(userId, actorId);

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) {
        throw new ActionError("User not found.", "NOT_FOUND");
      }
      if (target.deactivatedAt) {
        throw new ActionError(
          "This account is in the Safe deletion flow. Use Permanently delete on the Safe deletion tab.",
          "VALIDATION",
        );
      }
      if (
        target.approvalStatus !== "PENDING" &&
        target.approvalStatus !== "REJECTED"
      ) {
        throw new ActionError(
          "Only pending or rejected registration accounts can be removed here. Use Safe deletion for approved accounts.",
          "VALIDATION",
        );
      }
      if (target.globalRole === "super_pm") {
        throw new ActionError(
          "A Super PM account cannot be removed from the registration queue.",
          "FORBIDDEN",
        );
      }

      await physicallyDeleteUser({
        userId,
        actorId,
        requireDeactivated: false,
      });

      revalidateUserGovernancePaths();
      return actionSuccess({ id: userId });
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Retention pass for soft-deactivated accounts:
 * (a) warn Super PMs 2 days before purgeDueAt;
 * (b) hard-delete when purgeDueAt has elapsed.
 * Intended to be called from `runProjectRetentionJob`.
 */
export async function runUserRetentionPass(
  now: Date = new Date(),
): Promise<{ usersWarned: number; usersPurged: number }> {
  const warningHorizon = addCalendarDays(now, USER_PURGE_WARNING_DAYS_BEFORE);

  const warningCandidates = await prisma.user.findMany({
    where: {
      id: { not: SYSTEM_ACTOR_ID },
      deactivatedAt: { not: null },
      purgeDueAt: {
        not: null,
        lte: warningHorizon,
        gt: now,
      },
      purgeWarningSentAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      globalRole: true,
      purgeDueAt: true,
    },
  });

  let usersWarned = 0;
  if (warningCandidates.length > 0) {
    const superPms = await prisma.user.findMany({
      where: {
        id: { not: SYSTEM_ACTOR_ID },
        globalRole: "super_pm",
        approvalStatus: "APPROVED",
        deactivatedAt: null,
      },
      select: { email: true },
    });

    await notifySuperPmsOfUpcomingUserPurges({
      superPmEmails: superPms.map((row) => row.email),
      accounts: warningCandidates.map((row) => ({
        name: row.name,
        email: row.email,
        roleLabel: getRoleLabel(row.globalRole as GlobalRole),
        purgeDueAt: formatAuDate(row.purgeDueAt!),
      })),
    });

    await prisma.user.updateMany({
      where: { id: { in: warningCandidates.map((row) => row.id) } },
      data: {
        purgeWarningSentAt: now,
        ...auditUpdate(SYSTEM_ACTOR_ID),
      },
    });
    usersWarned = warningCandidates.length;
  }

  const purgeCandidates = await prisma.user.findMany({
    where: {
      id: { not: SYSTEM_ACTOR_ID },
      deactivatedAt: { not: null },
      purgeDueAt: { lte: now },
    },
    select: { id: true },
  });

  let usersPurged = 0;
  for (const row of purgeCandidates) {
    try {
      await physicallyDeleteUser({
        userId: row.id,
        actorId: SYSTEM_ACTOR_ID,
        requireDeactivated: true,
      });
      usersPurged += 1;
    } catch (error) {
      console.error(
        "[retention] Failed to purge deactivated user",
        row.id,
        error,
      );
    }
  }

  return { usersWarned, usersPurged };
}

function deletionModeForRole(
  role: GlobalRole,
): UserDeletionImpact["mode"] {
  if (role === "pm" || role === "super_pm") return "pm_handover";
  if (role === "member") return "member";
  return "viewer";
}

function buildDeletionWarning(
  mode: UserDeletionImpact["mode"],
  name: string,
  ownedProjectCount: number,
): string {
  if (mode === "pm_handover") {
    return ownedProjectCount > 0
      ? `Before deactivating ${name}, every owned project must be assigned to another approved PM or Super PM. Tasks and issue PIC assignments on those projects (and on any other projects) will move to the receiving project lead.`
      : `Deactivating ${name} will reassign any remaining tasks and issue PIC fields on non-owned projects to each project's lead PM, remove memberships, and start a 30-day purge window.`;
  }
  if (mode === "member") {
    return `Deactivating ${name} will reassign their tasks and issue PIC fields to each project's lead PM, remove project memberships, and start a 30-day purge window.`;
  }
  return `Deactivating ${name} will soft-deactivate the account and start a 30-day purge window. No project or task changes are required for Viewer accounts.`;
}

async function loadCandidatePms(
  excludeUserId?: string,
): Promise<CandidatePmDto[]> {
  const rows = await prisma.user.findMany({
    where: {
      AND: [
        activeApprovedUserWhere,
        {
          globalRole: { in: ["pm", "super_pm"] },
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        },
      ],
    },
    select: { id: true, name: true, email: true, globalRole: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    globalRole: row.globalRole as GlobalRole,
  }));
}

async function assertSurvivingSuperPm(targetUserId: string): Promise<void> {
  const remaining = await prisma.user.count({
    where: {
      id: { not: targetUserId },
      globalRole: "super_pm",
      approvalStatus: "APPROVED",
      deactivatedAt: null,
    },
  });
  if (remaining < 1) {
    throw new ActionError(
      "At least one active, approved Super PM must remain. Assign another Super PM before deactivating this account.",
      "VALIDATION",
    );
  }
}

async function handoverPmAssets(input: {
  tx: TxClient;
  targetId: string;
  targetName: string;
  actorId: string;
  projectAssignments: ProjectOwnerAssignment[];
  emailBuckets: Map<string, PmRecipientBucket>;
}): Promise<void> {
  const ownedProjects = await input.tx.project.findMany({
    where: { ownerId: input.targetId },
    select: { id: true, name: true },
  });

  const assignmentByProject = new Map(
    input.projectAssignments.map((row) => [row.projectId, row.newOwnerId]),
  );

  if (ownedProjects.length > 0) {
    for (const project of ownedProjects) {
      if (!assignmentByProject.has(project.id)) {
        throw new ActionError(
          `Select a new PM for every owned project, including “${project.name}”.`,
          "VALIDATION",
        );
      }
    }
  }

  const newOwnerIds = [...new Set(input.projectAssignments.map((a) => a.newOwnerId))];
  const owners =
    newOwnerIds.length > 0
      ? await input.tx.user.findMany({
          where: { id: { in: newOwnerIds } },
          select: {
            id: true,
            name: true,
            email: true,
            globalRole: true,
            approvalStatus: true,
            deactivatedAt: true,
          },
        })
      : [];
  const ownerById = new Map(owners.map((row) => [row.id, row]));

  for (const assignment of input.projectAssignments) {
    if (assignment.newOwnerId === input.targetId) {
      throw new ActionError(
        "The replacement PM must be different from the account being deactivated.",
        "VALIDATION",
      );
    }
    const owner = ownerById.get(assignment.newOwnerId);
    if (
      !owner ||
      owner.deactivatedAt ||
      owner.approvalStatus !== "APPROVED" ||
      (owner.globalRole !== "pm" && owner.globalRole !== "super_pm")
    ) {
      throw new ActionError(
        "Each replacement must be an approved, active PM or Super PM.",
        "VALIDATION",
      );
    }
  }

  for (const project of ownedProjects) {
    const newOwnerId = assignmentByProject.get(project.id)!;
    const newOwner = ownerById.get(newOwnerId)!;

    await input.tx.project.update({
      where: { id: project.id },
      data: {
        ownerId: newOwnerId,
        ...auditUpdate(input.actorId),
      },
    });

    await ensureProjectMembership(input.tx, project.id, newOwnerId, input.actorId);

    const reassignedTitles = await reassignTasksAndPicsOnProject({
      tx: input.tx,
      projectId: project.id,
      fromUserId: input.targetId,
      fromUserName: input.targetName,
      toUserId: newOwnerId,
      toUserName: newOwner.name,
      actorId: input.actorId,
      reason: "SAFE_USER_DEACTIVATION_OWNED_PROJECT",
    });

    addPmEmailItem(input.emailBuckets, {
      recipientId: newOwnerId,
      recipientName: newOwner.name,
      recipientEmail: newOwner.email,
      projectId: project.id,
      projectName: project.name,
      taskTitles: reassignedTitles,
    });
  }

  // Non-owned projects: tasks/PIC → each project's current owning PM.
  const ownedIds = new Set(ownedProjects.map((p) => p.id));
  const leftoverTaskProjects = await input.tx.task.findMany({
    where: {
      assigneeId: input.targetId,
      ...(ownedIds.size > 0 ? { projectId: { notIn: [...ownedIds] } } : {}),
    },
    select: { projectId: true },
    distinct: ["projectId"],
  });
  const leftoverIssueProjects = await input.tx.issue.findMany({
    where: {
      picId: input.targetId,
      ...(ownedIds.size > 0 ? { projectId: { notIn: [...ownedIds] } } : {}),
    },
    select: { projectId: true },
    distinct: ["projectId"],
  });
  const nonOwnedProjectIds = [
    ...new Set([
      ...leftoverTaskProjects.map((r) => r.projectId),
      ...leftoverIssueProjects.map((r) => r.projectId),
    ]),
  ];

  if (nonOwnedProjectIds.length > 0) {
    const projects = await input.tx.project.findMany({
      where: { id: { in: nonOwnedProjectIds } },
      select: {
        id: true,
        name: true,
        ownerId: true,
        owner: { select: { id: true, name: true, email: true } },
      },
    });

    for (const project of projects) {
      const titles = await reassignTasksAndPicsOnProject({
        tx: input.tx,
        projectId: project.id,
        fromUserId: input.targetId,
        fromUserName: input.targetName,
        toUserId: project.ownerId,
        toUserName: project.owner.name,
        actorId: input.actorId,
        reason: "SAFE_USER_DEACTIVATION_NON_OWNED_PROJECT",
      });

      addPmEmailItem(input.emailBuckets, {
        recipientId: project.owner.id,
        recipientName: project.owner.name,
        recipientEmail: project.owner.email,
        projectId: project.id,
        projectName: project.name,
        taskTitles: titles,
      });
    }
  }
}

async function reassignTasksAndPicsToProjectOwners(input: {
  tx: TxClient;
  targetId: string;
  targetName: string;
  actorId: string;
  /** When null, reassign across all projects. */
  projectIds: string[] | null;
}): Promise<void> {
  const taskWhere: Prisma.TaskWhereInput = {
    assigneeId: input.targetId,
    ...(input.projectIds ? { projectId: { in: input.projectIds } } : {}),
  };
  const issueWhere: Prisma.IssueWhereInput = {
    picId: input.targetId,
    ...(input.projectIds ? { projectId: { in: input.projectIds } } : {}),
  };

  const [tasks, issues] = await Promise.all([
    input.tx.task.findMany({
      where: taskWhere,
      select: { id: true, projectId: true },
    }),
    input.tx.issue.findMany({
      where: issueWhere,
      select: { id: true, projectId: true },
    }),
  ]);

  const projectIds = [
    ...new Set([...tasks.map((t) => t.projectId), ...issues.map((i) => i.projectId)]),
  ];
  if (projectIds.length === 0) return;

  const projects = await input.tx.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      ownerId: true,
      owner: { select: { id: true, name: true } },
    },
  });
  const ownerByProject = new Map(
    projects.map((p) => [p.id, p] as const),
  );

  for (const project of projects) {
    await reassignTasksAndPicsOnProject({
      tx: input.tx,
      projectId: project.id,
      fromUserId: input.targetId,
      fromUserName: input.targetName,
      toUserId: project.ownerId,
      toUserName: project.owner.name,
      actorId: input.actorId,
      reason: "SAFE_USER_DEACTIVATION_MEMBER",
    });
  }

  // Guard: if a project vanished mid-flight, skip silently (ownerByProject covers found rows).
  void ownerByProject;
}

async function reassignTasksAndPicsOnProject(input: {
  tx: TxClient;
  projectId: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  actorId: string;
  reason: string;
}): Promise<string[]> {
  const tasks = await input.tx.task.findMany({
    where: { projectId: input.projectId, assigneeId: input.fromUserId },
    select: { id: true, title: true },
  });

  if (tasks.length > 0) {
    await input.tx.task.updateMany({
      where: {
        projectId: input.projectId,
        assigneeId: input.fromUserId,
      },
      data: {
        assigneeId: input.toUserId,
        assigneeName: input.toUserName,
        ...auditUpdate(input.actorId),
      },
    });
  }

  const issues = await input.tx.issue.findMany({
    where: { projectId: input.projectId, picId: input.fromUserId },
    select: { id: true, projectId: true },
  });

  if (issues.length > 0) {
    await input.tx.issue.updateMany({
      where: {
        projectId: input.projectId,
        picId: input.fromUserId,
      },
      data: {
        picId: input.toUserId,
        picName: input.toUserName,
        ...auditUpdate(input.actorId),
      },
    });

    await input.tx.issueActivity.createMany({
      data: issues.map((issue) => ({
        projectId: issue.projectId,
        issueId: issue.id,
        eventType: "PIC_CHANGED" as const,
        summary: `PIC reassigned from ${input.fromUserName} to ${input.toUserName} during safe user deactivation.`,
        payloadJson: {
          fromPicId: input.fromUserId,
          toPicId: input.toUserId,
          reason: input.reason,
        },
        createdBy: input.actorId,
      })),
    });
  }

  return tasks.map((task) => task.title);
}

async function ensureProjectMembership(
  tx: TxClient,
  projectId: string,
  userId: string,
  actorId: string,
): Promise<void> {
  const existing = await tx.projectMember.findUnique({
    where: {
      projectId_userId: { projectId, userId },
    },
    select: { id: true },
  });
  if (existing) return;

  await tx.projectMember.create({
    data: {
      projectId,
      userId,
      ...auditCreate(actorId),
    },
  });
}

function addPmEmailItem(
  buckets: Map<string, PmRecipientBucket>,
  input: {
    recipientId: string;
    recipientName: string;
    recipientEmail: string;
    projectId: string;
    projectName: string;
    taskTitles: string[];
  },
): void {
  let bucket = buckets.get(input.recipientId);
  if (!bucket) {
    bucket = {
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail,
      items: new Map(),
    };
    buckets.set(input.recipientId, bucket);
  }

  const existing = bucket.items.get(input.projectId);
  if (existing) {
    existing.taskTitles.push(...input.taskTitles);
  } else {
    bucket.items.set(input.projectId, {
      projectName: input.projectName,
      taskTitles: [...input.taskTitles],
    });
  }
}

async function sendAggregatedPmAssignmentEmails(
  buckets: Map<string, PmRecipientBucket>,
  reason: string,
): Promise<void> {
  for (const bucket of buckets.values()) {
    const items: PmAssignmentEmailItem[] = [...bucket.items.values()].map(
      (item) => ({
        projectName: item.projectName,
        taskTitles: item.taskTitles,
      }),
    );
    void notifyPmOfProjectAssignments({
      recipientName: bucket.recipientName,
      recipientEmail: bucket.recipientEmail,
      items,
      reason,
    });
  }
}

async function physicallyDeleteUser(input: {
  userId: string;
  actorId: string;
  requireDeactivated: boolean;
}): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: input.userId },
  });
  if (!target) {
    throw new ActionError("User not found.", "NOT_FOUND");
  }
  if (input.userId === SYSTEM_ACTOR_ID) {
    throw new ActionError("The System actor cannot be deleted.", "VALIDATION");
  }
  if (input.requireDeactivated && !target.deactivatedAt) {
    throw new ActionError(
      "Only deactivated accounts can be permanently deleted. Soft-deactivate first.",
      "VALIDATION",
    );
  }

  const ownedCount = await prisma.project.count({
    where: { ownerId: input.userId },
  });
  if (ownedCount > 0) {
    throw new ActionError(
      "Cannot permanently delete an account that still owns projects. Reassign ownership first.",
      "VALIDATION",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectMember.deleteMany({ where: { userId: input.userId } });

    await tx.task.updateMany({
      where: { assigneeId: input.userId },
      data: {
        assigneeId: null,
        assigneeName: "",
        ...auditUpdate(input.actorId),
      },
    });

    const issues = await tx.issue.findMany({
      where: { picId: input.userId },
      select: { id: true, projectId: true },
    });
    if (issues.length > 0) {
      await tx.issue.updateMany({
        where: { picId: input.userId },
        data: {
          picId: null,
          picName: "",
          ...auditUpdate(input.actorId),
        },
      });
      await tx.issueActivity.createMany({
        data: issues.map((issue) => ({
          projectId: issue.projectId,
          issueId: issue.id,
          eventType: "PIC_CHANGED" as const,
          summary: `PIC cleared because ${target.name} was permanently deleted.`,
          payloadJson: {
            fromPicId: input.userId,
            toPicId: null,
            reason: "SAFE_USER_HARD_DELETE",
          },
          createdBy: input.actorId,
        })),
      });
    }

    await tx.user.delete({ where: { id: input.userId } });
  });

  const admin = createAdminClient();
  if (admin) {
    const { error } = await admin.auth.admin.deleteUser(input.userId);
    if (error) {
      console.error(
        "[users] Auth identity delete failed for",
        input.userId,
        error.message,
      );
    }
  }
}

function assertMutableTarget(userId: string, actorId: string): void {
  if (userId === actorId) {
    throw new ActionError(
      "You cannot perform this action on your own account here.",
      "VALIDATION",
    );
  }
  if (userId === SYSTEM_ACTOR_ID) {
    throw new ActionError("The System actor cannot be modified.", "VALIDATION");
  }
}

function isGlobalRole(value: string): value is GlobalRole {
  return (
    value === "super_pm" ||
    value === "pm" ||
    value === "member" ||
    value === "viewer"
  );
}

function isCompletedAccess(value: string): value is CompletedProjectAccess {
  return value === "NONE" || value === "ASSIGNED" || value === "ALL";
}

function formatAuDate(value: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}
