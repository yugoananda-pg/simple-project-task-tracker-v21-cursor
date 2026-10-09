"use server";

import { revalidatePath } from "next/cache";

import {
  ActionError,
  actionFailure,
  actionSuccess,
  type ActionResult,
} from "@/src/lib/actions/errors";
import { syncProjectProgressClock } from "@/src/lib/actions/project-lifecycle";
import { logTaskProgress } from "@/src/lib/actions/task-progress-log";
import { auditCreate } from "@/src/lib/audit";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { bucketOrder, planTaskImport } from "@/src/lib/import/task-import-rows";
import { workbookToMatrix } from "@/src/lib/import/task-import-workbook";
import { prisma } from "@/src/lib/prisma";
import { canCreateProject, requireApprovedSessionUser } from "@/src/lib/rbac";
import { localDateStringToDbDate, toLocalDateString } from "@/src/lib/task-defaults";
import type { TaskBucket, TaskStatus } from "@/src/lib/types";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const GROUP_LABEL: Record<TaskBucket, string> = {
  initiating: "Initiating",
  planning: "Planning",
  executing: "Executing",
  monitoring: "Monitoring",
  closing: "Closing",
};

export type TaskImportPreview = {
  projectName: string;
  taskCount: number;
  notices: Array<{ rowNumber: number; message: string }>;
  errors: Array<{ rowNumber: number; message: string }>;
  rows: Array<{
    rowNumber: number;
    title: string;
    processGroup: string;
    progress: number;
    warnings: string[];
  }>;
};

export type ProjectFromWorkbookResult = {
  id: string;
  name: string;
  taskCount: number;
};

function decodeWorkbook(fileBase64: string): Buffer {
  const trimmed = fileBase64.trim();
  if (!trimmed) {
    throw new ActionError("Choose an Excel file first.", "VALIDATION");
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(trimmed, "base64");
  } catch {
    throw new ActionError("That file could not be read.", "VALIDATION");
  }
  if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES) {
    throw new ActionError(
      "The workbook must be an .xlsx file under 2 MB.",
      "VALIDATION",
    );
  }
  return buffer;
}

async function planFromFile(fileBase64: string) {
  const user = await requireApprovedSessionUser();
  if (!canCreateProject(user)) {
    throw new ActionError(
      "You do not have permission to create projects.",
      "FORBIDDEN",
    );
  }
  const buffer = decodeWorkbook(fileBase64);
  const loaded = await workbookToMatrix(buffer);
  if ("error" in loaded) {
    throw new ActionError(loaded.error, "VALIDATION");
  }
  const plan = planTaskImport({
    matrix: loaded.matrix,
    existing: [],
    today: toLocalDateString(),
  });
  if (plan.projectName.length > 100) {
    plan.errors.unshift({
      rowNumber: 1,
      message: "Project name must be 100 characters or fewer.",
    });
  }
  return { user, plan };
}

function toPreview(
  plan: Awaited<ReturnType<typeof planFromFile>>["plan"],
): TaskImportPreview {
  return {
    projectName: plan.projectName,
    taskCount: plan.rows.length,
    notices: plan.notices,
    errors: plan.errors,
    rows: plan.rows.map((row) => ({
      rowNumber: row.rowNumber,
      title: row.title,
      processGroup: GROUP_LABEL[row.bucket],
      progress: row.progress,
      warnings: row.warnings,
    })),
  };
}

export async function downloadTaskImportTemplate(): Promise<
  ActionResult<{ fileName: string; fileBase64: string }>
> {
  try {
    await requireApprovedSessionUser();
    const buffer = await readFile(
      path.join(process.cwd(), "templates", "task-import-template.xlsx"),
    );
    return actionSuccess({
      fileName: "task-import-template.xlsx",
      fileBase64: buffer.toString("base64"),
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function previewProjectWorkbook(input: {
  fileBase64: string;
}): Promise<ActionResult<TaskImportPreview>> {
  try {
    const { plan } = await planFromFile(input.fileBase64);
    return actionSuccess(toPreview(plan));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function createProjectFromWorkbook(input: {
  fileBase64: string;
}): Promise<ActionResult<ProjectFromWorkbookResult>> {
  try {
    const { user, plan } = await planFromFile(input.fileBase64);
    if (plan.errors.length > 0) {
      const sample = plan.errors
        .slice(0, 6)
        .map((error) =>
          error.rowNumber > 0
            ? `Row ${error.rowNumber}: ${error.message}`
            : error.message,
        )
        .join(" ");
      throw new ActionError(
        `Fix the workbook before creating the project. ${sample}`,
        "VALIDATION",
      );
    }
    if (plan.rows.length === 0) {
      throw new ActionError(
        "The workbook has no tasks to import.",
        "VALIDATION",
      );
    }

    const stamps = auditCreate(user.id);
    const sortWithinStatus: Record<TaskStatus, number> = {
      todo: 0,
      in_progress: 0,
      done: 0,
    };

    const project = await prisma.$transaction(
      async (tx) => {
        const created = await tx.project.create({
          data: {
            name: plan.projectName,
            description: "",
            ownerId: user.id,
            ...stamps,
            members: {
              create: {
                userId: user.id,
                ...stamps,
              },
            },
          },
        });

        for (const bucket of bucketOrder()) {
          const imported = plan.rows.filter((row) => row.bucket === bucket);
          for (let index = 0; index < imported.length; index += 1) {
            const row = imported[index]!;
            const sortOrder = sortWithinStatus[row.status];
            sortWithinStatus[row.status] += 1;
            const createdTask = await tx.task.create({
              data: {
                projectId: created.id,
                title: row.title,
                description: "",
                status: row.status,
                progress: row.progress,
                priority: "medium",
                bucket: row.bucket,
                assigneeId: null,
                assigneeName: "",
                sortOrder,
                listSortOrder: index,
                initialStartDate: localDateStringToDbDate(row.initialStartDate),
                initialDueDate: localDateStringToDbDate(row.initialDueDate),
                updatedStartDate: localDateStringToDbDate(row.updatedStartDate),
                updatedDueDate: localDateStringToDbDate(row.updatedDueDate),
                actualStartDate: row.actualStartDate
                  ? localDateStringToDbDate(row.actualStartDate)
                  : null,
                actualCompletionDate: row.actualCompletionDate
                  ? localDateStringToDbDate(row.actualCompletionDate)
                  : null,
                ...stamps,
              },
            });
            if (row.progress > 0) {
              const occurredOn =
                row.progress >= 100 && row.actualCompletionDate
                  ? localDateStringToDbDate(row.actualCompletionDate)
                  : row.actualStartDate
                    ? localDateStringToDbDate(row.actualStartDate)
                    : new Date();
              await logTaskProgress(tx, {
                projectId: created.id,
                taskId: createdTask.id,
                progress: row.progress,
                actorId: user.id,
                occurredOn,
                source: "backfill",
                previousProgress: null,
              });
            }
          }
        }

        return created;
      },
      { timeout: 20_000 },
    );

    revalidatePath("/");
    revalidatePath(`/projects/${project.id}`);
    await syncProjectProgressClock(project.id);

    return actionSuccess({
      id: project.id,
      name: project.name,
      taskCount: plan.rows.length,
    });
  } catch (error) {
    return actionFailure(error);
  }
}
