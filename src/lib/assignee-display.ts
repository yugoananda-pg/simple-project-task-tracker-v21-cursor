import type { Task } from "@/src/lib/types";

export type TaskPic = {
  userId: string | null;
  name: string;
};

export type TaskPicInfo = {
  assigneeId: string | null;
  assigneeName: string;
  assignees?: TaskPic[];
};

export function normalisePicName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function picKey(pic: Pick<TaskPic, "userId" | "name">): string {
  if (pic.userId) return `user:${pic.userId}`;
  const name = normalisePicName(pic.name);
  if (name) return `custom:${name.toLowerCase()}`;
  return "__unassigned__";
}

export function picLabel(pic: Pick<TaskPic, "userId" | "name">): string {
  const name = normalisePicName(pic.name);
  if (name) return name;
  if (pic.userId) return `PIC · ${pic.userId.slice(0, 8)}`;
  return "Unassigned";
}

export function listTaskPics(task: TaskPicInfo): TaskPic[] {
  if (task.assignees && task.assignees.length > 0) {
    return task.assignees
      .map((pic) => ({
        userId: pic.userId,
        name: normalisePicName(pic.name),
      }))
      .filter((pic) => pic.userId || pic.name);
  }
  const name = normalisePicName(task.assigneeName);
  if (task.assigneeId || name) {
    return [{ userId: task.assigneeId, name }];
  }
  return [];
}

export function getTaskPicDisplayName(task: TaskPicInfo): string {
  const pics = listTaskPics(task);
  if (pics.length === 0) return "Unassigned";
  if (pics.length === 1) return picLabel(pics[0]!);
  return pics.map(picLabel).join(", ");
}

export function getTaskPicSummary(task: TaskPicInfo, visible = 2): string {
  const pics = listTaskPics(task);
  if (pics.length === 0) return "Unassigned";
  if (pics.length <= visible) return pics.map(picLabel).join(", ");
  const shown = pics.slice(0, visible).map(picLabel).join(", ");
  return `${shown} +${pics.length - visible}`;
}

/** Custom (unregistered) PIC — name stored without a linked user account. */
export function isCustomPic(task: TaskPicInfo): boolean {
  const pics = listTaskPics(task);
  return pics.length === 1 && !pics[0]!.userId && Boolean(pics[0]!.name);
}

export function hasAssignedPic(task: TaskPicInfo): boolean {
  return listTaskPics(task).length > 0;
}

export function taskHasUserPic(task: TaskPicInfo, userId: string | null | undefined): boolean {
  if (!userId) return false;
  return listTaskPics(task).some((pic) => pic.userId === userId);
}

/** Stable key for analytics / Gantt grouping of a single person. */
export function getTaskPicKey(task: TaskPicInfo): string {
  const pics = listTaskPics(task);
  if (pics.length === 0) return "__unassigned__";
  return picKey(pics[0]!);
}

export function getTaskPicKeys(task: TaskPicInfo): string[] {
  const pics = listTaskPics(task);
  if (pics.length === 0) return ["__unassigned__"];
  return pics.map(picKey);
}

export function getTaskPicInitial(task: TaskPicInfo): string {
  const pics = listTaskPics(task);
  if (pics.length === 0) return "?";
  return (picLabel(pics[0]!).trim()[0] ?? "?").toUpperCase();
}

export function getTaskPicInitials(task: TaskPicInfo): string[] {
  return listTaskPics(task).map((pic) => (picLabel(pic).trim()[0] ?? "?").toUpperCase());
}

export function cacheAssigneeFromPics(pics: TaskPic[]): Pick<Task, "assigneeId" | "assigneeName"> {
  const first = pics[0];
  if (!first) return { assigneeId: null, assigneeName: "" };
  return { assigneeId: first.userId, assigneeName: first.name };
}

export function samePics(left: TaskPic[], right: TaskPic[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((pic, index) => {
    const other = right[index]!;
    return pic.userId === other.userId && pic.name.toLowerCase() === other.name.toLowerCase();
  });
}
