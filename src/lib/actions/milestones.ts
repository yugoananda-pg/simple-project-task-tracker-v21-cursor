"use server";

import { revalidatePath } from "next/cache";

import {
  actionFailure,
  actionSuccess,
  ActionError,
  type ActionResult,
} from "@/src/lib/actions/errors";
import { assertActualDateNotFuture } from "@/src/lib/actions/date-validation";
import { auditCreate, auditUpdate, withAuditSession } from "@/src/lib/audit";
import { prisma } from "@/src/lib/prisma";
import { requireAdminProject, requireReadableProject } from "@/src/lib/rbac";
import {
  dbDateToLocalDateString,
  localDateStringToDbDate,
} from "@/src/lib/task-defaults";
import type { Milestone } from "@/src/lib/types";

function mapMilestone(row: {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  initialTarget: Date;
  updatedTarget: Date;
  actualAchieved: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Milestone {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description ?? "",
    initialTarget: dbDateToLocalDateString(row.initialTarget),
    updatedTarget: dbDateToLocalDateString(row.updatedTarget),
    actualAchieved: row.actualAchieved
      ? dbDateToLocalDateString(row.actualAchieved)
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ActionError("Please enter a milestone name.", "VALIDATION");
  }
  if (trimmed.length > 120) {
    throw new ActionError(
      "Milestone name must be 120 characters or fewer.",
      "VALIDATION",
    );
  }
  return trimmed;
}

function requireDate(value: string, label: string): Date {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ActionError(`Please enter a valid ${label}.`, "VALIDATION");
  }
  return localDateStringToDbDate(trimmed);
}

export async function listMilestones(
  projectId: string,
): Promise<ActionResult<Milestone[]>> {
  try {
    await requireReadableProject(projectId);
    const rows = await prisma.milestone.findMany({
      where: { projectId },
      orderBy: { updatedTarget: "asc" },
    });
    return actionSuccess(rows.map(mapMilestone));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function createMilestone(input: {
  projectId: string;
  name: string;
  description?: string;
  initialTarget: string;
}): Promise<ActionResult<Milestone>> {
  try {
    return await withAuditSession(async ({ actorId }) => {
      await requireAdminProject(input.projectId);
      const name = validateName(input.name);
      const initialTarget = requireDate(input.initialTarget, "target date");
      const description = (input.description ?? "").trim().slice(0, 500);

      const row = await prisma.milestone.create({
        data: {
          projectId: input.projectId,
          name,
          description,
          initialTarget,
          updatedTarget: initialTarget,
          ...auditCreate(actorId),
        },
      });

      revalidatePath(`/projects/${input.projectId}`);
      return actionSuccess(mapMilestone(row));
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateMilestone(input: {
  id: string;
  name?: string;
  description?: string;
  updatedTarget?: string;
  actualAchieved?: string | null;
}): Promise<ActionResult<Milestone>> {
  try {
    return await withAuditSession(async ({ actorId }) => {
      const existing = await prisma.milestone.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        throw new ActionError("Milestone not found.", "NOT_FOUND");
      }
      await requireAdminProject(existing.projectId);

      const data: {
        name?: string;
        description?: string;
        updatedTarget?: Date;
        actualAchieved?: Date | null;
        updatedBy: string;
      } = { ...auditUpdate(actorId) };

      if (input.name !== undefined) {
        data.name = validateName(input.name);
      }
      if (input.description !== undefined) {
        data.description = input.description.trim().slice(0, 500);
      }
      if (input.updatedTarget !== undefined) {
        data.updatedTarget = requireDate(input.updatedTarget, "updated target");
      }
      if (input.actualAchieved !== undefined) {
        if (input.actualAchieved === null || input.actualAchieved === "") {
          data.actualAchieved = null;
        } else {
          assertActualDateNotFuture(
            input.actualAchieved,
            "Achieved date",
          );
          data.actualAchieved = requireDate(
            input.actualAchieved,
            "actual achieved date",
          );
        }
      }

      const row = await prisma.milestone.update({
        where: { id: input.id },
        data,
      });

      revalidatePath(`/projects/${existing.projectId}`);
      return actionSuccess(mapMilestone(row));
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteMilestone(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    return await withAuditSession(async () => {
      const existing = await prisma.milestone.findUnique({ where: { id } });
      if (!existing) {
        throw new ActionError("Milestone not found.", "NOT_FOUND");
      }
      await requireAdminProject(existing.projectId);
      await prisma.milestone.delete({ where: { id } });
      revalidatePath(`/projects/${existing.projectId}`);
      return actionSuccess({ id });
    });
  } catch (error) {
    return actionFailure(error);
  }
}
