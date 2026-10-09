"use server";

import { revalidatePath } from "next/cache";

import {
  actionFailure,
  actionSuccess,
  ActionError,
  type ActionResult,
} from "@/src/lib/actions/errors";
import { auditCreate, auditUpdate } from "@/src/lib/audit";
import { NOTE_MAX_CHARS, sanitizeNoteHtml } from "@/src/lib/analytics/note-html";
import type { IssueIntelActivity } from "@/src/lib/analytics/issue-intelligence";
import {
  compactProgressEvents,
  type PortfolioIssue,
  type PortfolioMilestone,
  type PortfolioProjectMeta,
  type PortfolioTask,
} from "@/src/lib/analytics/portfolio";
import type { ProgressEventPoint } from "@/src/lib/analytics/schedule-series";
import { SYSTEM_ACTOR_ID } from "@/src/lib/audit-display";
import {
  canEditAllProjectsNote,
  canEditPmNote,
  isUuid,
  portfolioAccessFor,
  portfolioNoteKey,
  resolvePortfolioScope,
  type PortfolioAccess,
  type PortfolioScopeKind,
} from "@/src/lib/dashboard-access";
import { formatIssueId } from "@/src/lib/issue-labels";
import { prisma } from "@/src/lib/prisma";
import { isPrismaUniqueViolation } from "@/src/lib/prisma-errors";
import {
  portfolioProjectsFilter,
  requireApprovedSessionUser,
} from "@/src/lib/rbac";
import { dbDateToLocalDateString } from "@/src/lib/task-defaults";
import type {
  IssueCategory,
  IssueSeverity,
  IssueStatus,
  TaskBucket,
  TaskStatus,
} from "@/src/lib/types";

export type PortfolioPmOption = {
  id: string;
  name: string;
  projectCount: number;
};

export type PortfolioNoteDto = {
  html: string;
  updatedAt: string | null;
  updatedByName: string | null;
};

export type PortfolioDto = {
  scope: PortfolioScopeKind;
  access: PortfolioAccess;
  /** The PM being viewed. Always null on the All projects view. */
  pm: { id: string; name: string } | null;
  pmOptions: PortfolioPmOption[];
  includeCompleted: boolean;
  canIncludeCompleted: boolean;
  projects: PortfolioProjectMeta[];
  tasks: PortfolioTask[];
  milestones: PortfolioMilestone[];
  issues: PortfolioIssue[];
  activities: IssueIntelActivity[];
  events: ProgressEventPoint[];
  holidayDateKeys: string[];
  note: PortfolioNoteDto;
  canEditNote: boolean;
};

export type PortfolioInput = {
  scope?: string | null;
  pmId?: string | null;
  includeCompleted?: boolean;
};

/** Issue events the realisation and burn-down history reads. */
const HISTORY_EVENTS = [
  "RAISED",
  "STATUS_CHANGED",
  "PROGRESS_CHANGED",
  "CLOSED",
  "CANCELLED",
] as const;

function readPayload(value: unknown): { from?: unknown; to?: unknown } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { from, to } = value as { from?: unknown; to?: unknown };
  return { from, to };
}

export async function getPortfolioSummary(
  input: PortfolioInput = {},
): Promise<ActionResult<PortfolioDto>> {
  try {
    const user = await requireApprovedSessionUser();
    const access = portfolioAccessFor(user);
    const scope = resolvePortfolioScope(access, input.scope);
    if (!scope) {
      throw new ActionError(
        "You do not have access to the portfolio.",
        "FORBIDDEN",
      );
    }

    const canIncludeCompleted = user.completedProjectAccess === "ALL";
    const includeCompleted = canIncludeCompleted && input.includeCompleted === true;

    // PMs who own something this person may see. The same data-scope filter that
    // limits the projects also limits who appears in the picker.
    const ownerGroups = await prisma.project.groupBy({
      by: ["ownerId"],
      where: portfolioProjectsFilter(user, { includeCompleted }),
      _count: { _all: true },
    });
    const ownerIds = ownerGroups.map((row) => row.ownerId);
    const owners = ownerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, name: true },
        })
      : [];
    const ownerName = new Map(owners.map((owner) => [owner.id, owner.name]));
    const pmOptions: PortfolioPmOption[] = ownerGroups
      .map((row) => ({
        id: row.ownerId,
        name: ownerName.get(row.ownerId) ?? "Unknown PM",
        projectCount: row._count._all,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (
      (user.globalRole === "pm" || user.globalRole === "super_pm") &&
      !pmOptions.some((option) => option.id === user.id)
    ) {
      pmOptions.push({ id: user.id, name: user.name, projectCount: 0 });
      pmOptions.sort((a, b) => a.name.localeCompare(b.name));
    }

    let pm: PortfolioDto["pm"] = null;
    if (scope === "pm") {
      const requested = isUuid(input.pmId) ? input.pmId.trim().toLowerCase() : null;
      const picked =
        pmOptions.find((option) => option.id === requested) ??
        pmOptions.find(
          (option) => option.id === user.id && option.projectCount > 0,
        ) ??
        pmOptions.find((option) => option.projectCount > 0) ??
        pmOptions[0] ??
        null;
      pm = picked ? { id: picked.id, name: picked.name } : null;
    }

    const projectRows =
      scope === "pm" && !pm
        ? []
        : await prisma.project.findMany({
            where: portfolioProjectsFilter(user, {
              includeCompleted,
              ownerId: scope === "pm" ? pm?.id : null,
            }),
            select: {
              id: true,
              name: true,
              customProjectId: true,
              lifecycleStatus: true,
              ownerId: true,
              owner: { select: { name: true } },
            },
            orderBy: { name: "asc" },
          });
    const projectIds = projectRows.map((row) => row.id);
    const projectName = new Map(projectRows.map((row) => [row.id, row.name]));

    const noteKey =
      scope === "all" ? portfolioNoteKey("all") : pm ? portfolioNoteKey("pm", pm.id) : null;

    const [
      taskRows,
      milestoneRows,
      issueRows,
      eventRows,
      historyRows,
      recentRows,
      holidayRows,
      noteRow,
    ] = await Promise.all([
      projectIds.length
        ? prisma.task.findMany({
            where: { projectId: { in: projectIds } },
            select: {
              id: true,
              projectId: true,
              title: true,
              status: true,
              bucket: true,
              assigneeId: true,
              assigneeName: true,
              progress: true,
              initialStartDate: true,
              initialDueDate: true,
              updatedStartDate: true,
              updatedDueDate: true,
              actualStartDate: true,
              actualCompletionDate: true,
            },
          })
        : [],
      projectIds.length
        ? prisma.milestone.findMany({
            where: { projectId: { in: projectIds } },
            select: {
              id: true,
              projectId: true,
              name: true,
              description: true,
              initialTarget: true,
              updatedTarget: true,
              actualAchieved: true,
            },
          })
        : [],
      projectIds.length
        ? prisma.issue.findMany({
            where: { projectId: { in: projectIds } },
            select: {
              id: true,
              projectId: true,
              issueNumber: true,
              status: true,
              severity: true,
              category: true,
              progress: true,
              picName: true,
              updatedStartDate: true,
              updatedDueDate: true,
              actualStartDate: true,
              actualResolutionDate: true,
              raisedAt: true,
              updatedAt: true,
            },
          })
        : [],
      projectIds.length
        ? prisma.taskProgressEvent.findMany({
            where: { projectId: { in: projectIds } },
            orderBy: { occurredOn: "asc" },
            select: {
              taskId: true,
              progress: true,
              occurredOn: true,
              source: true,
            },
          })
        : [],
      projectIds.length
        ? prisma.issueActivity.findMany({
            where: {
              projectId: { in: projectIds },
              eventType: { in: [...HISTORY_EVENTS] },
            },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              issueId: true,
              eventType: true,
              createdAt: true,
              payloadJson: true,
            },
          })
        : [],
      projectIds.length
        ? prisma.issueActivity.findMany({
            where: { projectId: { in: projectIds } },
            orderBy: { createdAt: "desc" },
            // A project filter on the page narrows this list, so keep a margin over the 20 shown.
            take: 200,
            select: {
              id: true,
              issueId: true,
              eventType: true,
              summary: true,
              createdAt: true,
              createdBy: true,
              payloadJson: true,
            },
          })
        : [],
      prisma.holiday.findMany({ select: { date: true } }),
      noteKey
        ? prisma.portfolioNote.findUnique({
            where: { scopeKey: noteKey },
            select: { bodyHtml: true, updatedAt: true, updatedBy: true },
          })
        : null,
    ]);

    const actorIds = [
      ...new Set([
        ...recentRows.map((row) => row.createdBy),
        ...(noteRow ? [noteRow.updatedBy] : []),
      ]),
    ];
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const actorName = new Map(actors.map((actor) => [actor.id, actor.name]));

    const date = (value: Date | null) =>
      value ? dbDateToLocalDateString(value) : null;

    const activities = new Map<string, IssueIntelActivity>();
    for (const row of historyRows) {
      activities.set(row.id, {
        id: row.id,
        issueId: row.issueId,
        eventType: row.eventType,
        summary: "",
        createdAt: row.createdAt.toISOString(),
        createdByName: "",
        payload: readPayload(row.payloadJson),
      });
    }
    for (const row of recentRows) {
      activities.set(row.id, {
        id: row.id,
        issueId: row.issueId,
        eventType: row.eventType,
        summary: row.summary,
        createdAt: row.createdAt.toISOString(),
        createdByName: actorName.get(row.createdBy) ?? "Unknown",
        payload: readPayload(row.payloadJson),
      });
    }

    const dto: PortfolioDto = {
      scope,
      access,
      pm,
      pmOptions,
      includeCompleted,
      canIncludeCompleted,
      projects: projectRows.map((row) => ({
        id: row.id,
        name: row.name,
        customProjectId: row.customProjectId ?? "",
        lifecycleStatus: row.lifecycleStatus,
        ownerId: row.ownerId,
        ownerName: row.owner.name,
      })),
      tasks: taskRows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        title: row.title,
        status: row.status as TaskStatus,
        bucket: row.bucket as TaskBucket,
        assigneeId: row.assigneeId,
        assigneeName: row.assigneeName,
        progress: row.progress,
        initialStartDate: date(row.initialStartDate),
        initialDueDate: date(row.initialDueDate),
        updatedStartDate: date(row.updatedStartDate),
        updatedDueDate: date(row.updatedDueDate),
        actualStartDate: date(row.actualStartDate),
        actualCompletionDate: date(row.actualCompletionDate),
      })),
      milestones: milestoneRows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        name: row.name,
        description: row.description ?? "",
        initialTarget: dbDateToLocalDateString(row.initialTarget),
        updatedTarget: dbDateToLocalDateString(row.updatedTarget),
        actualAchieved: date(row.actualAchieved),
      })),
      issues: issueRows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        projectName: projectName.get(row.projectId) ?? "",
        issueNumber: row.issueNumber,
        displayId: formatIssueId(row.issueNumber),
        status: row.status as IssueStatus,
        severity: row.severity as IssueSeverity,
        category: row.category as IssueCategory,
        progress: row.progress,
        picName: row.picName,
        updatedStartDate: date(row.updatedStartDate),
        updatedDueDate: date(row.updatedDueDate),
        actualStartDate: date(row.actualStartDate),
        actualResolutionDate: date(row.actualResolutionDate),
        raisedAt: row.raisedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      activities: [...activities.values()],
      events: compactProgressEvents(
        eventRows.map((row) => ({
          taskId: row.taskId,
          progress: row.progress,
          occurredOn: row.occurredOn.toISOString(),
          source: row.source,
        })),
      ),
      holidayDateKeys: holidayRows.map((row) => dbDateToLocalDateString(row.date)),
      note: {
        html: noteRow ? sanitizeNoteHtml(noteRow.bodyHtml) : "",
        updatedAt: noteRow ? noteRow.updatedAt.toISOString() : null,
        updatedByName: noteRow
          ? (actorName.get(noteRow.updatedBy) ?? "Unknown")
          : null,
      },
      canEditNote:
        scope === "all"
          ? canEditAllProjectsNote(user)
          : pm
            ? canEditPmNote(user, pm.id)
            : false,
    };
    return actionSuccess(dto);
  } catch (error) {
    return actionFailure(error);
  }
}

export type PortfolioNoteTarget =
  | { scope: "all" }
  | { scope: "pm"; pmId: string };

/** Decision D3: the All-projects note takes any PM or Super PM; a PM note takes that PM or a Super PM. */
export async function savePortfolioNote(
  target: PortfolioNoteTarget,
  html: string,
): Promise<
  ActionResult<{ html: string; updatedAt: string; updatedByName: string }>
> {
  try {
    const user = await requireApprovedSessionUser();
    if (typeof html !== "string") {
      throw new ActionError("The note is not valid.", "VALIDATION");
    }

    let key: string;
    if (target?.scope === "all") {
      if (!canEditAllProjectsNote(user)) {
        throw new ActionError(
          "Only a Project Manager or Super PM with Total Company access can edit this note.",
          "FORBIDDEN",
        );
      }
      key = portfolioNoteKey("all");
    } else if (target?.scope === "pm" && isUuid(target.pmId)) {
      if (!canEditPmNote(user, target.pmId.trim().toLowerCase())) {
        throw new ActionError(
          "Only that Project Manager or a Super PM can edit this note.",
          "FORBIDDEN",
        );
      }
      if (target.pmId.trim().toLowerCase() === SYSTEM_ACTOR_ID) {
        throw new ActionError("That Project Manager was not found.", "NOT_FOUND");
      }
      const owner = await prisma.user.findFirst({
        where: {
          id: target.pmId.trim().toLowerCase(),
          globalRole: { in: ["pm", "super_pm"] },
        },
        select: { id: true },
      });
      if (!owner) {
        throw new ActionError("That Project Manager was not found.", "NOT_FOUND");
      }
      key = portfolioNoteKey("pm", owner.id);
    } else {
      throw new ActionError("Choose which portfolio note to save.", "VALIDATION");
    }

    const bodyHtml = sanitizeNoteHtml(html);
    if (bodyHtml.length > NOTE_MAX_CHARS) {
      throw new ActionError(
        `This note is too long. Keep it under ${NOTE_MAX_CHARS.toLocaleString("en-AU")} characters.`,
        "VALIDATION",
      );
    }

    const write = () =>
      prisma.portfolioNote.upsert({
        where: { scopeKey: key },
        create: { scopeKey: key, bodyHtml, ...auditCreate(user.id) },
        update: { bodyHtml, ...auditUpdate(user.id) },
      });
    let saved;
    try {
      saved = await write();
    } catch (error) {
      // Two first saves racing on one scope. The second write is an update.
      if (!isPrismaUniqueViolation(error, "scopeKey")) throw error;
      saved = await write();
    }

    revalidatePath("/portfolio");
    return actionSuccess({
      html: sanitizeNoteHtml(saved.bodyHtml),
      updatedAt: saved.updatedAt.toISOString(),
      updatedByName: user.name,
    });
  } catch (error) {
    return actionFailure(error);
  }
}
