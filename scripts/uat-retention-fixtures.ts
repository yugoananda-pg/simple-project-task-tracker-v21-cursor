/**
 * Disposable UAT fixtures for job-assisted UAT-413 / UAT-418.
 *
 * Safety:
 * - Creates/updates ONLY projects named UAT-413 / UAT-418.
 * - Temporarily shields any OTHER retention-eligible rows so Run retention job
 *   cannot mutate the real portfolio, then restores those shields afterwards.
 * - Never changes the system clock.
 *
 * Usage:
 *   npx tsx scripts/uat-retention-fixtures.ts prepare
 *   npx tsx scripts/uat-retention-fixtures.ts restore-shields
 *   npx tsx scripts/uat-retention-fixtures.ts preflight
 */
import { config } from "dotenv";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

import { generateTemporaryPassword } from "../src/lib/password";
import { createSeedPrismaClient } from "../src/lib/seed/database-seed";

config({ path: ".env.local" });
config();

const FIXTURE_413 = "UAT-413 Auto-Complete Me";
const FIXTURE_418 = "UAT-418 Five-Year Purge";
const SHIELD_PATH = resolve(
  process.cwd(),
  ".uat-retention-shields.json",
);

type ShieldSnapshot = {
  projects: Array<{
    id: string;
    name: string;
    progressReached100At: string | null;
    completedPurgeDueAt: string | null;
    purgeDueAt: string | null;
  }>;
  users: Array<{
    id: string;
    email: string;
    purgeDueAt: string | null;
    purgeWarningSentAt: string | null;
  }>;
};

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function yearsFromNow(years: number): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

async function preflight(prisma: ReturnType<typeof createSeedPrismaClient>) {
  const now = new Date();
  const autoCutoff = new Date(now);
  autoCutoff.setUTCDate(autoCutoff.getUTCDate() - 30);

  const [autoCandidates, softExpired, completedExpired, usersDue] =
    await Promise.all([
      prisma.project.findMany({
        where: {
          lifecycleStatus: "ACTIVE",
          deletedAt: null,
          progressReached100At: { lte: autoCutoff },
        },
        select: {
          id: true,
          name: true,
          progressReached100At: true,
          ownerId: true,
        },
      }),
      prisma.project.findMany({
        where: { deletedAt: { not: null }, purgeDueAt: { lte: now } },
        select: { id: true, name: true, purgeDueAt: true },
      }),
      prisma.project.findMany({
        where: {
          lifecycleStatus: "COMPLETED",
          deletedAt: null,
          completedPurgeDueAt: { lte: now },
        },
        select: { id: true, name: true, completedPurgeDueAt: true },
      }),
      prisma.user.findMany({
        where: {
          deactivatedAt: { not: null },
          purgeDueAt: { lte: now },
        },
        select: { id: true, email: true, purgeDueAt: true },
      }),
    ]);

  console.log("=== Retention preflight (what the job would touch NOW) ===");
  console.log("Auto-complete candidates:", autoCandidates.length);
  for (const row of autoCandidates) {
    console.log(`  - ${row.name} (${row.id})`);
  }
  console.log("Soft-delete expired:", softExpired.length);
  for (const row of softExpired) {
    console.log(`  - ${row.name} (${row.id})`);
  }
  console.log("Completed five-year expired:", completedExpired.length);
  for (const row of completedExpired) {
    console.log(`  - ${row.name} (${row.id})`);
  }
  console.log("Users purge-due:", usersDue.length);
  for (const row of usersDue) {
    console.log(`  - ${row.email} (${row.id})`);
  }

  return { autoCandidates, softExpired, completedExpired, usersDue, now };
}

async function prepare() {
  const prisma = createSeedPrismaClient();
  try {
    const { autoCandidates, softExpired, completedExpired, usersDue, now } =
      await preflight(prisma);

    const superPm = await prisma.user.findFirst({
      where: {
        globalRole: "super_pm",
        approvalStatus: "APPROVED",
        deactivatedAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true },
    });
    if (!superPm) {
      throw new Error("No approved Super PM found to own fixtures.");
    }

    const fixtureNames = new Set([FIXTURE_413, FIXTURE_418]);
    const shieldProjects = [
      ...autoCandidates,
      ...softExpired,
      ...completedExpired,
    ].filter((row) => !fixtureNames.has(row.name));

    // Deduplicate by id
    const shieldById = new Map<string, (typeof shieldProjects)[number]>();
    for (const row of shieldProjects) {
      shieldById.set(row.id, row);
    }

    const fullShieldProjects = await prisma.project.findMany({
      where: { id: { in: [...shieldById.keys()] } },
      select: {
        id: true,
        name: true,
        progressReached100At: true,
        completedPurgeDueAt: true,
        purgeDueAt: true,
      },
    });

    const snapshot: ShieldSnapshot = {
      projects: fullShieldProjects.map((row) => ({
        id: row.id,
        name: row.name,
        progressReached100At: row.progressReached100At?.toISOString() ?? null,
        completedPurgeDueAt: row.completedPurgeDueAt?.toISOString() ?? null,
        purgeDueAt: row.purgeDueAt?.toISOString() ?? null,
      })),
      users: usersDue.map((row) => ({
        id: row.id,
        email: row.email,
        purgeDueAt: row.purgeDueAt?.toISOString() ?? null,
        purgeWarningSentAt: null,
      })),
    };

    // Push non-fixture due dates far into the future so the job skips them.
    for (const row of fullShieldProjects) {
      await prisma.project.update({
        where: { id: row.id },
        data: {
          progressReached100At: row.progressReached100At
            ? yearsFromNow(50)
            : null,
          completedPurgeDueAt: row.completedPurgeDueAt
            ? yearsFromNow(50)
            : null,
          purgeDueAt: row.purgeDueAt ? yearsFromNow(50) : null,
        },
      });
      console.log(`Shielded portfolio project: ${row.name}`);
    }

    for (const row of usersDue) {
      const existing = await prisma.user.findUnique({
        where: { id: row.id },
        select: { purgeWarningSentAt: true },
      });
      const userSnap = snapshot.users.find((u) => u.id === row.id);
      if (userSnap) {
        userSnap.purgeWarningSentAt =
          existing?.purgeWarningSentAt?.toISOString() ?? null;
      }
      await prisma.user.update({
        where: { id: row.id },
        data: { purgeDueAt: yearsFromNow(50) },
      });
      console.log(`Shielded deactivated user: ${row.email}`);
    }

    writeFileSync(SHIELD_PATH, JSON.stringify(snapshot, null, 2), "utf8");
    console.log(`Shield snapshot written: ${SHIELD_PATH}`);

    // --- UAT-413: Active @ 100% with clock 35 days ago ---
    let project413 = await prisma.project.findFirst({
      where: { name: FIXTURE_413 },
      select: { id: true },
    });
    if (!project413) {
      project413 = await prisma.project.create({
        data: {
          name: FIXTURE_413,
          description:
            "Disposable fixture for UAT-413 auto-complete retention. Safe to purge.",
          ownerId: superPm.id,
          lifecycleStatus: "ACTIVE",
          progressReached100At: daysAgo(35),
          createdBy: superPm.id,
          updatedBy: superPm.id,
          members: {
            create: {
              userId: superPm.id,
              canEdit: true,
              createdBy: superPm.id,
              updatedBy: superPm.id,
            },
          },
          tasks: {
            create: {
              title: "Finish work",
              description: "Single 100% task for weighted actual = 100%.",
              status: "done",
              priority: "medium",
              bucket: "executing",
              progress: 100,
              sortOrder: 0,
              initialStartDate: daysAgo(40),
              initialDueDate: daysAgo(35),
              actualStartDate: daysAgo(40),
              actualCompletionDate: daysAgo(35),
              createdBy: superPm.id,
              updatedBy: superPm.id,
            },
          },
        },
        select: { id: true },
      });
      console.log(`Created ${FIXTURE_413}: ${project413.id}`);
    } else {
      await prisma.project.update({
        where: { id: project413.id },
        data: {
          lifecycleStatus: "ACTIVE",
          deletedAt: null,
          deletedBy: null,
          purgeDueAt: null,
          completedAt: null,
          completedBy: null,
          completionMethod: null,
          completedPurgeDueAt: null,
          progressReached100At: daysAgo(35),
          ownerId: superPm.id,
          updatedBy: superPm.id,
        },
      });
      const taskCount = await prisma.task.count({
        where: { projectId: project413.id },
      });
      if (taskCount === 0) {
        await prisma.task.create({
          data: {
            projectId: project413.id,
            title: "Finish work",
            description: "Single 100% task for weighted actual = 100%.",
            status: "done",
            priority: "medium",
            bucket: "executing",
            progress: 100,
            sortOrder: 0,
            initialStartDate: daysAgo(40),
            initialDueDate: daysAgo(35),
            actualStartDate: daysAgo(40),
            actualCompletionDate: daysAgo(35),
            createdBy: superPm.id,
            updatedBy: superPm.id,
          },
        });
      } else {
        await prisma.task.updateMany({
          where: { projectId: project413.id },
          data: {
            progress: 100,
            status: "done",
            updatedBy: superPm.id,
          },
        });
      }
      console.log(`Reset ${FIXTURE_413}: ${project413.id}`);
    }

    // --- UAT-418: Completed with five-year purge already due ---
    let project418 = await prisma.project.findFirst({
      where: { name: FIXTURE_418 },
      select: { id: true },
    });
    if (!project418) {
      project418 = await prisma.project.create({
        data: {
          name: FIXTURE_418,
          description:
            "Disposable fixture for UAT-418 five-year completed purge. Safe to purge.",
          ownerId: superPm.id,
          lifecycleStatus: "COMPLETED",
          progressReached100At: daysAgo(40),
          completedAt: daysAgo(1),
          completedBy: superPm.id,
          completionMethod: "MANUAL",
          completedPurgeDueAt: daysAgo(1),
          createdBy: superPm.id,
          updatedBy: superPm.id,
          members: {
            create: {
              userId: superPm.id,
              canEdit: true,
              createdBy: superPm.id,
              updatedBy: superPm.id,
            },
          },
          tasks: {
            create: {
              title: "Legacy wrap-up",
              description: "Task retained only until five-year purge.",
              status: "done",
              priority: "low",
              bucket: "executing",
              progress: 100,
              sortOrder: 0,
              initialStartDate: daysAgo(50),
              initialDueDate: daysAgo(40),
              actualStartDate: daysAgo(50),
              actualCompletionDate: daysAgo(40),
              createdBy: superPm.id,
              updatedBy: superPm.id,
            },
          },
        },
        select: { id: true },
      });
      console.log(`Created ${FIXTURE_418}: ${project418.id}`);
    } else {
      await prisma.project.update({
        where: { id: project418.id },
        data: {
          lifecycleStatus: "COMPLETED",
          deletedAt: null,
          deletedBy: null,
          purgeDueAt: null,
          progressReached100At: daysAgo(40),
          completedAt: daysAgo(1),
          completedBy: superPm.id,
          completionMethod: "MANUAL",
          completedPurgeDueAt: daysAgo(1),
          ownerId: superPm.id,
          updatedBy: superPm.id,
        },
      });
      console.log(`Reset ${FIXTURE_418}: ${project418.id}`);
    }

    console.log("");
    console.log("Prepare complete.");
    console.log(`  Super PM owner: ${superPm.email}`);
    console.log(`  UAT-413 id:     ${project413.id}`);
    console.log(`  UAT-418 id:     ${project418.id}`);
    console.log(`  Shields:        ${snapshot.projects.length} project(s), ${snapshot.users.length} user(s)`);
    console.log(`  Now:            ${now.toISOString()}`);
    console.log("");
    console.log(
      "Next: as Super PM, open Settings → Deleted Projects → Run retention job.",
    );
    console.log(
      "After verification: npx tsx scripts/uat-retention-fixtures.ts restore-shields",
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function restoreShields() {
  const prisma = createSeedPrismaClient();
  try {
    if (!existsSync(SHIELD_PATH)) {
      console.log("No shield snapshot found — nothing to restore.");
      return;
    }
    const snapshot = JSON.parse(
      readFileSync(SHIELD_PATH, "utf8"),
    ) as ShieldSnapshot;

    for (const row of snapshot.projects) {
      const stillExists = await prisma.project.findUnique({
        where: { id: row.id },
        select: { id: true },
      });
      if (!stillExists) {
        console.log(`Skip missing shielded project: ${row.name}`);
        continue;
      }
      await prisma.project.update({
        where: { id: row.id },
        data: {
          progressReached100At: row.progressReached100At
            ? new Date(row.progressReached100At)
            : null,
          completedPurgeDueAt: row.completedPurgeDueAt
            ? new Date(row.completedPurgeDueAt)
            : null,
          purgeDueAt: row.purgeDueAt ? new Date(row.purgeDueAt) : null,
        },
      });
      console.log(`Restored shield: ${row.name}`);
    }

    for (const row of snapshot.users) {
      const stillExists = await prisma.user.findUnique({
        where: { id: row.id },
        select: { id: true },
      });
      if (!stillExists) {
        console.log(`Skip missing shielded user: ${row.email}`);
        continue;
      }
      await prisma.user.update({
        where: { id: row.id },
        data: {
          purgeDueAt: row.purgeDueAt ? new Date(row.purgeDueAt) : null,
          purgeWarningSentAt: row.purgeWarningSentAt
            ? new Date(row.purgeWarningSentAt)
            : null,
        },
      });
      console.log(`Restored user shield: ${row.email}`);
    }

    unlinkSync(SHIELD_PATH);
    console.log("Shield snapshot removed.");
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * One-time Super PM password reset for browser UAT login only.
 * Prints the temporary password once — change it afterwards in Account settings.
 */
async function resetSuperPmPassword() {
  const prisma = createSeedPrismaClient();
  try {
    const superPm = await prisma.user.findFirst({
      where: {
        globalRole: "super_pm",
        approvalStatus: "APPROVED",
        deactivatedAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true },
    });
    if (!superPm) {
      throw new Error("No approved Super PM found.");
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
      );
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const temporaryPassword = generateTemporaryPassword();
    const { error } = await admin.auth.admin.updateUserById(superPm.id, {
      password: temporaryPassword,
    });
    if (error) {
      throw new Error(`Password reset failed: ${error.message}`);
    }

    console.log("Super PM temporary password ready (shown once):");
    console.log(`  email:    ${superPm.email}`);
    console.log(`  name:     ${superPm.name}`);
    console.log(`  password: ${temporaryPassword}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const mode = process.argv[2] ?? "prepare";
  if (mode === "prepare") {
    await prepare();
    return;
  }
  if (mode === "restore-shields") {
    await restoreShields();
    return;
  }
  if (mode === "preflight") {
    const prisma = createSeedPrismaClient();
    try {
      await preflight(prisma);
    } finally {
      await prisma.$disconnect();
    }
    return;
  }
  if (mode === "reset-super-pm-password") {
    await resetSuperPmPassword();
    return;
  }
  throw new Error(`Unknown mode: ${mode}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
