import "server-only";

import { isDatabaseUnreachable, prisma, retryOnceIfUnreachable } from "@/src/lib/prisma";

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
  try {
    const rows = await retryOnceIfUnreachable(() =>
      prisma.customAssignee.findMany({
        select: { name: true },
        orderBy: { name: "asc" },
      }),
    );
    return rows.map((row) => row.name);
  } catch (error) {
    // Suggestions are optional. A closed pooler socket must not take down the project page.
    if (isDatabaseUnreachable(error)) return [];
    throw error;
  }
}
