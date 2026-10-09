import type { Prisma, TaskProgressEventSource } from "@prisma/client";

/** Append-only. Skips a write when progress has not changed. */
export async function logTaskProgress(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    taskId: string;
    progress: number;
    actorId: string;
    occurredOn?: Date;
    source?: TaskProgressEventSource;
    previousProgress?: number | null;
  },
): Promise<void> {
  const progress = Math.max(0, Math.min(100, Math.round(input.progress)));
  if (
    input.previousProgress != null &&
    input.previousProgress === progress
  ) {
    return;
  }
  await tx.taskProgressEvent.create({
    data: {
      projectId: input.projectId,
      taskId: input.taskId,
      progress,
      occurredOn: input.occurredOn ?? new Date(),
      source: input.source ?? "recorded",
      createdBy: input.actorId,
    },
  });
}
