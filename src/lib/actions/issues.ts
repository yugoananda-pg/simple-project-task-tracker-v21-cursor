"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import {
  actionFailure,
  actionSuccess,
  ActionError,
  type ActionResult,
} from "@/src/lib/actions/errors";
import { assertActualDateNotFuture } from "@/src/lib/actions/date-validation";
import { auditCreate, auditUpdate, withAuditSession } from "@/src/lib/audit";
import {
  normaliseCustomAssigneeName,
  rememberCustomAssignee,
} from "@/src/lib/custom-assignees";
import { formatIssueId, ISSUE_STATUS_LABEL } from "@/src/lib/issue-labels";
import { resolveActorDisplayName } from "@/src/lib/audit-display";
import { prisma } from "@/src/lib/prisma";
import {
  requireActiveApprovedAssignee,
  requireAdminProject,
  requireReadableProject,
  type SessionUser,
} from "@/src/lib/rbac";
import {
  clampProgress,
  dbDateToLocalDateString,
  isPlausibleLocalDate,
  localDateStringToDbDate,
  toLocalDateString,
} from "@/src/lib/task-defaults";
import type {
  Issue,
  IssueActivity,
  IssueCategory,
  IssueComment,
  IssueSeverity,
  IssueStatus,
} from "@/src/lib/types";

type IssueRow = Prisma.IssueGetPayload<{
  include: {
    comments: { include: { user: { select: { id: true; name: true } } } };
    activities: true;
  };
}>;

function mapComment(row: {
  id: string;
  issueId: string;
  userId: string;
  content: string;
  createdAt: Date;
  user: { name: string };
}): IssueComment {
  return {
    id: row.id,
    issueId: row.issueId,
    userId: row.userId,
    authorName: row.user.name,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapActivity(
  row: {
    id: string;
    projectId: string;
    issueId: string;
    eventType: IssueActivity["eventType"];
    summary: string;
    createdAt: Date;
    createdBy: string;
  },
  nameById: Map<string, string>,
): IssueActivity {
  return {
    id: row.id,
    projectId: row.projectId,
    issueId: row.issueId,
    eventType: row.eventType,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    createdByName: resolveActorDisplayName(
      row.createdBy,
      nameById.get(row.createdBy),
    ),
  };
}

function mapIssue(
  row: IssueRow | Prisma.IssueGetPayload<object>,
  nameById: Map<string, string> = new Map(),
): Issue {
  const comments =
    "comments" in row && Array.isArray(row.comments)
      ? row.comments.map(mapComment)
      : undefined;
  const activities =
    "activities" in row && Array.isArray(row.activities)
      ? row.activities.map((activity) => mapActivity(activity, nameById))
      : undefined;

  return {
    id: row.id,
    projectId: row.projectId,
    issueNumber: row.issueNumber,
    displayId: formatIssueId(row.issueNumber),
    title: row.title,
    description: row.description,
    category: row.category as IssueCategory,
    severity: row.severity as IssueSeverity,
    status: row.status as IssueStatus,
    picId: row.picId,
    picName: row.picName,
    raisedBy: row.raisedBy,
    raisedAt: row.raisedAt.toISOString(),
    initialStartDate: row.initialStartDate
      ? dbDateToLocalDateString(row.initialStartDate)
      : null,
    initialDueDate: row.initialDueDate
      ? dbDateToLocalDateString(row.initialDueDate)
      : null,
    updatedStartDate: row.updatedStartDate
      ? dbDateToLocalDateString(row.updatedStartDate)
      : null,
    updatedDueDate: row.updatedDueDate
      ? dbDateToLocalDateString(row.updatedDueDate)
      : null,
    actualStartDate: row.actualStartDate
      ? dbDateToLocalDateString(row.actualStartDate)
      : null,
    actualResolutionDate: row.actualResolutionDate
      ? dbDateToLocalDateString(row.actualResolutionDate)
      : null,
    progress: row.progress,
    impactSummary: row.impactSummary,
    resolutionSummary: row.resolutionSummary,
    relatedTaskId: row.relatedTaskId,
    relatedMilestoneId: row.relatedMilestoneId,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    comments,
    activities,
  };
}

function parseOptionalDate(
  value: string | null | undefined,
  label: string,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!isPlausibleLocalDate(value)) {
    throw new ActionError(
      `Please enter a valid ${label} between the years 2000 and 2100.`,
      "VALIDATION",
    );
  }
  return localDateStringToDbDate(value.trim());
}

function statusFromIssueProgress(
  progress: number,
  current: IssueStatus,
): IssueStatus {
  if (current === "blocked" || current === "cancelled" || current === "closed") {
    return current;
  }
  const value = clampProgress(progress);
  if (value <= 0) return "open";
  if (value >= 100) return "resolved";
  return "in_progress";
}

function progressFromIssueStatus(
  status: IssueStatus,
  currentProgress: number,
): number {
  switch (status) {
    case "open":
      return 0;
    case "in_progress": {
      const current = clampProgress(currentProgress);
      return current > 0 && current < 100 ? current : 1;
    }
    case "resolved":
    case "closed":
      return 100;
    case "blocked":
    case "cancelled":
      return clampProgress(currentProgress);
    default:
      return clampProgress(currentProgress);
  }
}

async function resolveIssuePic(
  projectId: string,
  actorId: string,
  picId: string | null,
  picName: string | null | undefined,
): Promise<{ picId: string | null; picName: string }> {
  if (picId) {
    return { picId, picName: await assertPicAllowed(projectId, picId) };
  }
  const name = normaliseCustomAssigneeName(picName ?? "");
  if (name.length > 120) {
    throw new ActionError(
      "PIC name must be 120 characters or fewer.",
      "VALIDATION",
    );
  }
  if (name) await rememberCustomAssignee(actorId, name);
  return { picId: null, picName: name };
}

async function assertPicAllowed(
  projectId: string,
  picId: string | null,
): Promise<string> {
  if (!picId) return "";
  const [project, membership, user] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    }),
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: picId } },
    }),
    requireActiveApprovedAssignee(picId).catch(() => null),
  ]);
  if (!project || !user) {
    throw new ActionError(
      "Only approved, active accounts can be assigned as PIC.",
      "VALIDATION",
    );
  }
  const allowed =
    user.globalRole === "super_pm" ||
    project.ownerId === picId ||
    membership != null;
  if (!allowed) {
    throw new ActionError(
      "PIC must be a project member, the owning PM, or a Super PM.",
      "VALIDATION",
    );
  }
  return user.name;
}

function assertCanRaise(
  user: SessionUser,
  access: "none" | "read" | "write" | "admin",
): void {
  // Viewers never raise. Peer-PM read visitors (not members) also cannot.
  // Members with roster membership have project access `read` but may raise.
  if (user.globalRole === "viewer" || access === "none") {
    throw new ActionError(
      "You do not have permission to raise issues.",
      "FORBIDDEN",
    );
  }
  if (user.globalRole === "pm" && access === "read") {
    throw new ActionError(
      "You can view this project, but only the owning PM or Super PM may raise issues here. You may still update tasks assigned to you.",
      "FORBIDDEN",
    );
  }
}

function assertCanManageIssue(
  user: SessionUser,
  access: "none" | "read" | "write" | "admin",
  issue: { picId: string | null; raisedBy: string },
  mode: "comment",
): void {
  if (access === "admin") return;
  if (mode === "comment") {
    if (issue.picId === user.id || issue.raisedBy === user.id) return;
    if (access === "write") return;
  }
  throw new ActionError(
    "You do not have permission to update this issue.",
    "FORBIDDEN",
  );
}

export async function listIssues(
  projectId: string,
): Promise<ActionResult<Issue[]>> {
  try {
    await requireReadableProject(projectId);
    const rows = await prisma.issue.findMany({
      where: { projectId },
      orderBy: [{ issueNumber: "asc" }],
    });
    return actionSuccess(rows.map((row) => mapIssue(row)));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function getIssueById(
  issueId: string,
): Promise<ActionResult<Issue>> {
  try {
    const row = await prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        comments: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
        activities: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!row) {
      throw new ActionError("Issue not found.", "NOT_FOUND");
    }
    await requireReadableProject(row.projectId);

    const actorIds = [
      ...new Set(row.activities.map((activity) => activity.createdBy)),
    ];
    const actors = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(actors.map((actor) => [actor.id, actor.name]));

    return actionSuccess(mapIssue(row, nameById));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function createIssue(input: {
  projectId: string;
  title: string;
  description?: string;
  category?: IssueCategory;
  severity?: IssueSeverity;
  picId?: string | null;
  picName?: string | null;
  initialStartDate?: string | null;
  initialDueDate?: string | null;
  impactSummary?: string;
  relatedTaskId?: string | null;
  relatedMilestoneId?: string | null;
}): Promise<ActionResult<Issue>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      const { access } = await requireReadableProject(input.projectId);
      assertCanRaise(user, access);

      const title = input.title.trim();
      if (!title) {
        throw new ActionError("Please enter an issue title.", "VALIDATION");
      }

      const initialStart = parseOptionalDate(
        input.initialStartDate ?? null,
        "initial start date",
      );
      const initialDue = parseOptionalDate(
        input.initialDueDate ?? null,
        "initial due date",
      );
      if (
        initialStart instanceof Date &&
        initialDue instanceof Date &&
        initialDue < initialStart
      ) {
        throw new ActionError(
          "Initial due date cannot be before the initial start date.",
          "VALIDATION",
        );
      }
      const pic = await resolveIssuePic(
        input.projectId,
        user.id,
        input.picId ?? null,
        input.picName,
      );

      const issue = await prisma.$transaction(async (tx) => {
        const aggregate = await tx.issue.aggregate({
          where: { projectId: input.projectId },
          _max: { issueNumber: true },
        });
        const issueNumber = (aggregate._max.issueNumber ?? 0) + 1;
        const stamps = auditCreate(actorId);

        const created = await tx.issue.create({
          data: {
            projectId: input.projectId,
            issueNumber,
            title,
            description: (input.description ?? "").trim(),
            category: input.category ?? "technical",
            severity: input.severity ?? "medium",
            status: "open",
            picId: pic.picId,
            picName: pic.picName,
            raisedBy: actorId,
            initialStartDate: initialStart ?? null,
            initialDueDate: initialDue ?? null,
            updatedStartDate: initialStart ?? null,
            updatedDueDate: initialDue ?? null,
            progress: 0,
            impactSummary: (input.impactSummary ?? "").trim(),
            relatedTaskId: input.relatedTaskId ?? null,
            relatedMilestoneId: input.relatedMilestoneId ?? null,
            ...stamps,
          },
        });

        await tx.issueActivity.create({
          data: {
            projectId: input.projectId,
            issueId: created.id,
            eventType: "RAISED",
            summary: `Issue ${formatIssueId(issueNumber)} raised: ${title}`,
            payloadJson: {
              title,
              severity: created.severity,
              category: created.category,
              picId: pic.picId,
            },
            createdBy: actorId,
          },
        });

        return created;
      });

      revalidatePath(`/projects/${input.projectId}`);
      revalidatePath("/");
      return actionSuccess(mapIssue(issue));
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateIssue(input: {
  id: string;
  title?: string;
  description?: string;
  category?: IssueCategory;
  severity?: IssueSeverity;
  status?: IssueStatus;
  progress?: number;
  picId?: string | null;
  picName?: string | null;
  updatedStartDate?: string | null;
  updatedDueDate?: string | null;
  actualStartDate?: string | null;
  actualResolutionDate?: string | null;
  impactSummary?: string;
  resolutionSummary?: string;
  relatedTaskId?: string | null;
  relatedMilestoneId?: string | null;
}): Promise<ActionResult<Issue>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      const existing = await prisma.issue.findUnique({ where: { id: input.id } });
      if (!existing) {
        throw new ActionError("Issue not found.", "NOT_FOUND");
      }
      const { access } = await requireReadableProject(existing.projectId);

      const isFullEditor = access === "admin";
      const isPic = existing.picId === user.id;
      if (!isFullEditor && !isPic) {
        throw new ActionError(
          "You do not have permission to update this issue.",
          "FORBIDDEN",
        );
      }
      if (!isFullEditor && isPic) {
        const allowedKeys = new Set([
          "progress",
          "status",
          "updatedStartDate",
          "updatedDueDate",
          "actualStartDate",
          "actualResolutionDate",
        ]);
        for (const key of Object.keys(input)) {
          if (key === "id") continue;
          if (input[key as keyof typeof input] === undefined) continue;
          if (!allowedKeys.has(key)) {
            throw new ActionError(
              "PIC may only update progress, status, and dates.",
              "FORBIDDEN",
            );
          }
        }
      }

      let nextStatus = input.status ?? (existing.status as IssueStatus);
      let nextProgress =
        input.progress !== undefined
          ? clampProgress(input.progress)
          : existing.progress;

      if (input.progress !== undefined && input.status === undefined) {
        nextStatus = statusFromIssueProgress(nextProgress, nextStatus);
      }
      if (input.status !== undefined && input.progress === undefined) {
        nextProgress = progressFromIssueStatus(nextStatus, existing.progress);
      }

      if (
        (nextStatus === "closed" || nextStatus === "cancelled") &&
        !isFullEditor
      ) {
        throw new ActionError(
          "Only the owning PM or a Super PM may close or cancel an issue.",
          "FORBIDDEN",
        );
      }

      const existingStatus = existing.status as IssueStatus;
      if (
        (nextStatus === "closed" || nextStatus === "cancelled") &&
        nextStatus !== existingStatus
      ) {
        const summary = (
          input.resolutionSummary ??
          existing.resolutionSummary ??
          ""
        ).trim();
        if (!summary) {
          throw new ActionError(
            nextStatus === "closed"
              ? "Please enter a resolution summary before closing."
              : "Please enter a reason before cancelling.",
            "VALIDATION",
          );
        }
      }

      const picTouched =
        input.picId !== undefined || input.picName !== undefined;
      const pic = picTouched
        ? await resolveIssuePic(
            existing.projectId,
            actorId,
            input.picId !== undefined ? input.picId : existing.picId,
            input.picName !== undefined ? input.picName : existing.picName,
          )
        : { picId: existing.picId, picName: existing.picName };

      const updatedStart = parseOptionalDate(
        input.updatedStartDate,
        "updated start date",
      );
      const updatedDue = parseOptionalDate(
        input.updatedDueDate,
        "updated due date",
      );
      if (input.actualStartDate !== undefined) {
        assertActualDateNotFuture(input.actualStartDate, "Actual start date");
      }
      if (input.actualResolutionDate !== undefined) {
        assertActualDateNotFuture(
          input.actualResolutionDate,
          "Actual resolution date",
        );
      }

      const actualStart = parseOptionalDate(
        input.actualStartDate,
        "actual start date",
      );
      let actualResolution = parseOptionalDate(
        input.actualResolutionDate,
        "actual resolution date",
      );

      if (nextProgress >= 100 && actualResolution === undefined) {
        actualResolution =
          existing.actualResolutionDate ??
          localDateStringToDbDate(toLocalDateString());
      }

      const activities: Prisma.IssueActivityCreateManyInput[] = [];
      if (nextStatus !== existing.status) {
        activities.push({
          projectId: existing.projectId,
          issueId: existing.id,
          eventType:
            nextStatus === "closed"
              ? "CLOSED"
              : nextStatus === "cancelled"
                ? "CANCELLED"
                : "STATUS_CHANGED",
          summary: `Status changed from ${ISSUE_STATUS_LABEL[existing.status as IssueStatus]} to ${ISSUE_STATUS_LABEL[nextStatus]}`,
          payloadJson: { from: existing.status, to: nextStatus },
          createdBy: actorId,
        });
      }
      if (nextProgress !== existing.progress) {
        activities.push({
          projectId: existing.projectId,
          issueId: existing.id,
          eventType: "PROGRESS_CHANGED",
          summary: `Progress changed from ${existing.progress}% to ${nextProgress}%`,
          payloadJson: { from: existing.progress, to: nextProgress },
          createdBy: actorId,
        });
      }
      if (
        picTouched &&
        (pic.picId !== existing.picId || pic.picName !== existing.picName)
      ) {
        activities.push({
          projectId: existing.projectId,
          issueId: existing.id,
          eventType: "PIC_CHANGED",
          summary: `PIC changed to ${pic.picName || "Unassigned"}`,
          payloadJson: {
            from: existing.picId,
            to: pic.picId,
            fromName: existing.picName,
            toName: pic.picName,
          },
          createdBy: actorId,
        });
      }
      if (input.category !== undefined || input.severity !== undefined) {
        activities.push({
          projectId: existing.projectId,
          issueId: existing.id,
          eventType: "CLASSIFICATION_CHANGED",
          summary: "Classification updated",
          payloadJson: {
            category: input.category ?? existing.category,
            severity: input.severity ?? existing.severity,
          },
          createdBy: actorId,
        });
      }
      if (
        updatedStart !== undefined ||
        updatedDue !== undefined ||
        actualStart !== undefined ||
        actualResolution !== undefined
      ) {
        activities.push({
          projectId: existing.projectId,
          issueId: existing.id,
          eventType: "DATES_CHANGED",
          summary: "Issue dates updated",
          payloadJson: {},
          createdBy: actorId,
        });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.issue.update({
          where: { id: existing.id },
          data: {
            title: input.title?.trim() ?? undefined,
            description: input.description?.trim(),
            category: input.category,
            severity: input.severity,
            status: nextStatus,
            progress: nextProgress,
            picId: pic.picId,
            picName: pic.picName,
            updatedStartDate:
              updatedStart === undefined ? undefined : updatedStart,
            updatedDueDate: updatedDue === undefined ? undefined : updatedDue,
            actualStartDate:
              actualStart === undefined ? undefined : actualStart,
            actualResolutionDate:
              actualResolution === undefined ? undefined : actualResolution,
            impactSummary: input.impactSummary?.trim(),
            resolutionSummary: input.resolutionSummary?.trim(),
            relatedTaskId:
              input.relatedTaskId === undefined
                ? undefined
                : input.relatedTaskId,
            relatedMilestoneId:
              input.relatedMilestoneId === undefined
                ? undefined
                : input.relatedMilestoneId,
            ...auditUpdate(actorId),
          },
        });
        if (activities.length > 0) {
          await tx.issueActivity.createMany({ data: activities });
        }
        return row;
      });

      revalidatePath(`/projects/${existing.projectId}`);
      revalidatePath("/");
      return actionSuccess(mapIssue(updated));
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function closeIssue(input: {
  id: string;
  resolutionSummary: string;
}): Promise<ActionResult<Issue>> {
  const summary = input.resolutionSummary.trim();
  if (!summary) {
    return actionFailure(
      new ActionError("Please enter a resolution summary.", "VALIDATION"),
    );
  }
  return updateIssue({
    id: input.id,
    status: "closed",
    progress: 100,
    resolutionSummary: summary,
  });
}

export async function addIssueComment(input: {
  issueId: string;
  content: string;
}): Promise<ActionResult<IssueComment>> {
  try {
    return await withAuditSession(async ({ actorId, user }) => {
      const existing = await prisma.issue.findUnique({
        where: { id: input.issueId },
      });
      if (!existing) {
        throw new ActionError("Issue not found.", "NOT_FOUND");
      }
      const { access } = await requireReadableProject(existing.projectId);
      assertCanManageIssue(user, access, existing, "comment");

      const content = input.content.trim();
      if (!content) {
        throw new ActionError("Please enter a comment.", "VALIDATION");
      }

      const comment = await prisma.$transaction(async (tx) => {
        const created = await tx.issueComment.create({
          data: {
            issueId: existing.id,
            userId: actorId,
            content,
            ...auditCreate(actorId),
          },
          include: { user: { select: { id: true, name: true } } },
        });
        await tx.issueActivity.create({
          data: {
            projectId: existing.projectId,
            issueId: existing.id,
            eventType: "COMMENTED",
            summary: `${user.name} commented on ${formatIssueId(existing.issueNumber)}`,
            payloadJson: { commentId: created.id },
            createdBy: actorId,
          },
        });
        await tx.issue.update({
          where: { id: existing.id },
          data: auditUpdate(actorId),
        });
        return created;
      });

      revalidatePath(`/projects/${existing.projectId}`);
      return actionSuccess(mapComment(comment));
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteIssue(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    return await withAuditSession(async () => {
      const existing = await prisma.issue.findUnique({ where: { id } });
      if (!existing) {
        throw new ActionError("Issue not found.", "NOT_FOUND");
      }
      await requireAdminProject(existing.projectId);
      await prisma.issue.delete({ where: { id } });
      revalidatePath(`/projects/${existing.projectId}`);
      revalidatePath("/");
      return actionSuccess({ id });
    });
  } catch (error) {
    return actionFailure(error);
  }
}
