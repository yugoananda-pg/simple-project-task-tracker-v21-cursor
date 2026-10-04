"use server";

import { revalidatePath } from "next/cache";

import {
  actionFailure,
  actionSuccess,
  ActionError,
  type ActionResult,
} from "@/src/lib/actions/errors";
import {
  createSeedPrismaClient,
  resetAndSeedDatabase,
  type SeedSummary,
} from "@/src/lib/seed/database-seed";
import { requireApprovedSessionUser } from "@/src/lib/rbac";

export async function runDatabaseSeedAction(): Promise<ActionResult<SeedSummary>> {
  try {
    const user = await requireApprovedSessionUser();
    if (user.globalRole !== "super_pm") {
      throw new ActionError(
        "Only a Super PM can reset and seed the database.",
        "FORBIDDEN",
      );
    }

    const prisma = createSeedPrismaClient();
    try {
      const summary = await resetAndSeedDatabase(prisma);
      revalidatePath("/", "layout");
      revalidatePath("/projects", "layout");
      return actionSuccess(summary);
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    return actionFailure(error);
  }
}
