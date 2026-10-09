import "server-only";

import { prisma } from "@/src/lib/prisma";

export function normaliseCustomAssigneeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export async function rememberCustomAssignee(
  actorId: string,
  rawName: string,
): Promise<void> {
  const name = normaliseCustomAssigneeName(rawName);
  if (!name || name.length > 120) return;
  const nameKey = name.toLowerCase();
  await prisma.customAssignee.upsert({
    where: { nameKey },
    create: {
      name,
      nameKey,
      createdBy: actorId,
      updatedBy: actorId,
    },
    update: {
      name,
      updatedBy: actorId,
    },
  });
}

export async function listCustomAssigneeNames(): Promise<string[]> {
  const rows = await prisma.customAssignee.findMany({
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => row.name);
}
