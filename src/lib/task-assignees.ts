import "server-only";

import { ActionError } from "@/src/lib/actions/errors";
import { rememberCustomAssignee } from "@/src/lib/custom-assignees";
import {
  cacheAssigneeFromPics,
  normalisePicName,
  picKey,
  type TaskPic,
} from "@/src/lib/assignee-display";
import { requireActiveApprovedAssignee } from "@/src/lib/rbac";
import type { Prisma } from "@prisma/client";

type AssigneeClient = {
  projectMember: {
    findFirst: (args: {
      where: { projectId: string; userId: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

export function taskAssignedToUserWhere(userId: string) {
  return {
    OR: [
      { assigneeId: userId },
      { assignees: { some: { userId } } },
    ],
  };
}

export function uniqueTaskPics(input: readonly TaskPic[]): TaskPic[] {
  const seen = new Set<string>();
  const next: TaskPic[] = [];
  for (const raw of input) {
    const name = normalisePicName(raw.name);
    if (name.length > 120) {
      throw new ActionError("PIC name must be 120 characters or fewer.", "VALIDATION");
    }
    const pic = { userId: raw.userId, name };
    if (!pic.userId && !pic.name) continue;
    const key = picKey(pic);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(pic);
  }
  return next;
}

export async function assertAssignableUser(
  project: { id: string; ownerId: string },
  userId: string,
  client: Pick<AssigneeClient, "projectMember">,
): Promise<{ id: string; name: string }> {
  const assigneeUser = await requireActiveApprovedAssignee(userId);
  const isProjectMember = await client.projectMember.findFirst({
    where: { projectId: project.id, userId },
    select: { id: true },
  });
  const isOwner = project.ownerId === userId;
  const isSuperPm = assigneeUser.globalRole === "super_pm";
  if (!isProjectMember && !isOwner && !isSuperPm) {
    throw new ActionError(
      "Assignee must be on the project roster, the owning PM, or a Super PM.",
      "VALIDATION",
    );
  }
  return assigneeUser;
}

export async function resolveTaskPics(
  project: { id: string; ownerId: string },
  actorId: string,
  input: readonly TaskPic[],
  client: Pick<AssigneeClient, "projectMember">,
): Promise<TaskPic[]> {
  const unique = uniqueTaskPics(input);
  const resolved: TaskPic[] = [];
  for (const pic of unique) {
    if (pic.userId) {
      const user = await assertAssignableUser(project, pic.userId, client);
      resolved.push({ userId: user.id, name: pic.name || user.name });
      continue;
    }
    if (pic.name) {
      await rememberCustomAssignee(actorId, pic.name);
      resolved.push({ userId: null, name: pic.name });
    }
  }
  return resolved;
}

export function taskAssigneeCache(
  pics: TaskPic[],
): Prisma.TaskUpdateInput {
  const cache = cacheAssigneeFromPics(pics);
  return {
    assignee: cache.assigneeId
      ? { connect: { id: cache.assigneeId } }
      : { disconnect: true },
    assigneeName: cache.assigneeName,
  };
}

/** One task.update: drop current PIC rows and write the new set. */
export function taskAssigneeNestedWrite(
  pics: TaskPic[],
  actorId: string,
): Prisma.TaskUpdateInput {
  return {
    ...taskAssigneeCache(pics),
    assignees: {
      deleteMany: {},
      create: pics.map((pic, index) => ({
        userId: pic.userId,
        assigneeName: pic.name,
        sortOrder: index,
        createdBy: actorId,
        updatedBy: actorId,
      })),
    },
  };
}
