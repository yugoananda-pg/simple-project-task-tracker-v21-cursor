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
import type { ProgressEventPoint } from "@/src/lib/analytics/schedule-series";
import { prisma } from "@/src/lib/prisma";
import { hasDashboardScope } from "@/src/lib/dashboard-access";
import { requireAdminProject, requireReadableProject } from "@/src/lib/rbac";

export type ProjectAnalyticsBundle = {
  events: ProgressEventPoint[];
  activities: IssueIntelActivity[];
  noteHtml: string;
  noteUpdatedAt: string | null;
  noteUpdatedByName: string | null;
};

export async function loadProjectAnalytics(
  projectId: string,
): Promise<ProjectAnalyticsBundle | null> {
  try {
    const { user } = await requireReadableProject(projectId);
    if (!hasDashboardScope(user, "PROJECT")) return null;
  } catch (error) {
    if (error instanceof ActionError) return null;
    throw error;
  }
  const [events, activities, note] = await Promise.all([
    prisma.taskProgressEvent.findMany({
      where: { projectId },
      orderBy: { occurredOn: "asc" },
      select: {
        taskId: true,
        progress: true,
        occurredOn: true,
        source: true,
      },
    }),
    prisma.issueActivity.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: {
        id: true,
        issueId: true,
        eventType: true,
        summary: true,
        createdAt: true,
        createdBy: true,
        payloadJson: true,
      },
    }),
    prisma.analyticsNote.findUnique({
      where: { projectId },
      select: {
        bodyHtml: true,
        updatedAt: true,
        updatedBy: true,
      },
    }),
  ]);

  const actorIds = [
    ...new Set([
      ...activities.map((row) => row.createdBy),
      ...(note ? [note.updatedBy] : []),
    ]),
  ];
  const actors =
    actorIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        });
  const nameById = new Map(actors.map((actor) => [actor.id, actor.name]));

  return {
    events: events.map((event) => ({
      taskId: event.taskId,
      progress: event.progress,
      occurredOn: event.occurredOn.toISOString(),
      source: event.source,
    })),
    activities: activities.map((row) => {
      const payload =
        row.payloadJson && typeof row.payloadJson === "object"
          ? (row.payloadJson as { from?: unknown; to?: unknown })
          : undefined;
      return {
        id: row.id,
        issueId: row.issueId,
        eventType: row.eventType,
        summary: row.summary,
        createdAt: row.createdAt.toISOString(),
        createdByName: nameById.get(row.createdBy) ?? "Unknown",
        payload,
      };
    }),
    noteHtml: note ? sanitizeNoteHtml(note.bodyHtml) : "",
    noteUpdatedAt: note ? note.updatedAt.toISOString() : null,
    noteUpdatedByName: note
      ? (nameById.get(note.updatedBy) ?? "Unknown")
      : null,
  };
}

export async function saveProjectAnalyticsNote(
  projectId: string,
  html: string,
): Promise<ActionResult<{ html: string; updatedAt: string; updatedByName: string }>> {
  try {
    const { user } = await requireAdminProject(projectId);
    const bodyHtml = sanitizeNoteHtml(html);
    if (bodyHtml.length > NOTE_MAX_CHARS) {
      throw new ActionError(
        `This note is too long. Keep it under ${NOTE_MAX_CHARS.toLocaleString("en-AU")} characters.`,
        "VALIDATION",
      );
    }
    const stamps = auditUpdate(user.id);
    const saved = await prisma.analyticsNote.upsert({
      where: { projectId },
      create: {
        projectId,
        bodyHtml,
        ...auditCreate(user.id),
      },
      update: {
        bodyHtml,
        ...stamps,
      },
    });
    revalidatePath(`/projects/${projectId}`);
    return actionSuccess({
      html: sanitizeNoteHtml(saved.bodyHtml),
      updatedAt: saved.updatedAt.toISOString(),
      updatedByName: user.name,
    });
  } catch (error) {
    return actionFailure(error);
  }
}
