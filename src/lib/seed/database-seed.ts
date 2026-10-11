import { addDays, subDays } from "date-fns";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type GlobalRole,
  type TaskBucket,
  type TaskPriority,
  type TaskStatus,
  type User,
} from "@prisma/client";

import {
  SYSTEM_ACTOR_DISPLAY_NAME,
  SYSTEM_ACTOR_EMAIL,
  SYSTEM_ACTOR_ID,
} from "@/src/lib/audit-display";
import { privilegeDefaultsForRole } from "@/src/lib/dashboard-access";

/** Fixed UUIDs so UAT docs and re-seeds stay reproducible (not tied to Supabase Auth). */
export const SEED_USER_IDS = {
  pm: "a1000001-0001-4001-8001-000000000001",
  sarah: "a1000002-0002-4002-8002-000000000002",
  david: "a1000003-0003-4003-8003-000000000003",
  viewer: "a1000004-0004-4004-8004-000000000004",
} as const;

export type SeedSummary = {
  superPmEmail: string;
  usersDeleted: number;
  usersCreated: number;
  projectsCreated: number;
  tasksCreated: number;
  subtasksCreated: number;
  commentsCreated: number;
};

type SeedUserKey = "super_pm" | "pm" | "sarah" | "david";

type SeedAssignee =
  | { kind: "user"; key: SeedUserKey }
  | { kind: "custom"; name: string }
  | { kind: "unassigned" };

type SeedSubtask = {
  title: string;
  isCompleted: boolean;
};

type SeedComment = {
  authorKey: SeedUserKey;
  content: string;
  daysAgo: number;
};

type SeedTask = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  bucket: TaskBucket;
  assignee: SeedAssignee;
  initialStartOffset: number;
  initialDueOffset: number;
  actualStartOffset?: number;
  actualCompletionOffset?: number;
  subtasks: SeedSubtask[];
  comments: SeedComment[];
};

type SeedProject = {
  name: string;
  description: string;
  ownerKey: SeedUserKey;
  memberKeys: SeedUserKey[];
  tasks: SeedTask[];
};

type SeedUserMap = Record<SeedUserKey, User>;

const DUMMY_USER_DEFINITIONS = [
  {
    id: SEED_USER_IDS.pm,
    name: "Alex Morgan",
    email: "pm.alex@tracker.local",
    globalRole: "pm" as GlobalRole,
  },
  {
    id: SEED_USER_IDS.sarah,
    name: "Sarah Jenkins",
    email: "member.sarah@tracker.local",
    globalRole: "member" as GlobalRole,
  },
  {
    id: SEED_USER_IDS.david,
    name: "David Chen",
    email: "member.david@tracker.local",
    globalRole: "member" as GlobalRole,
  },
  {
    id: SEED_USER_IDS.viewer,
    name: "Rachel Green",
    email: "viewer.rachel@tracker.local",
    globalRole: "viewer" as GlobalRole,
  },
] as const;

export function createSeedPrismaClient(): PrismaClient {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DIRECT_URL or DATABASE_URL must be set before running the database seed.",
    );
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function dateFromOffset(offsetDays: number): Date {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return addDays(base, offsetDays);
}

/** Wipe project domain data in reverse dependency order. */
export async function wipeProjectData(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.taskComment.deleteMany(),
    prisma.subtask.deleteMany(),
    prisma.task.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.project.deleteMany(),
  ]);
}

async function resolveSuperPm(prisma: PrismaClient): Promise<User> {
  const preferredEmail = process.env.SEED_PRESERVE_EMAIL?.trim().toLowerCase();

  if (preferredEmail) {
    const byEmail = await prisma.user.findUnique({
      where: { email: preferredEmail },
    });
    if (!byEmail) {
      throw new Error(
        `SEED_PRESERVE_EMAIL is set to "${preferredEmail}" but no matching user exists.`,
      );
    }
    if (byEmail.globalRole !== "super_pm") {
      throw new Error(
        `SEED_PRESERVE_EMAIL user "${preferredEmail}" is not a Super PM (globalRole: ${byEmail.globalRole}).`,
      );
    }
    return byEmail;
  }

  const superPms = await prisma.user.findMany({
    where: { globalRole: "super_pm" },
    orderBy: { createdAt: "asc" },
  });

  if (superPms.length === 0) {
    throw new Error(
      "No Super PM user found. Register at least one account via the app before seeding.",
    );
  }

  return superPms[0]!;
}

/**
 * Ensures the System audit actor exists in `User` (FR-AUD-03 / FR-AUD-08).
 * Not a Supabase Auth login — only an actor-master row for JOIN name resolution.
 */
export async function ensureSystemActor(prisma: PrismaClient): Promise<void> {
  await prisma.user.upsert({
    where: { id: SYSTEM_ACTOR_ID },
    create: {
      id: SYSTEM_ACTOR_ID,
      email: SYSTEM_ACTOR_EMAIL,
      name: SYSTEM_ACTOR_DISPLAY_NAME,
      globalRole: "viewer",
      approvalStatus: "APPROVED",
      approvedAt: new Date(),
      dashboardAccess: [],
      completedProjectAccess: "NONE",
      createdBy: SYSTEM_ACTOR_ID,
      updatedBy: SYSTEM_ACTOR_ID,
    },
    update: {
      email: SYSTEM_ACTOR_EMAIL,
      name: SYSTEM_ACTOR_DISPLAY_NAME,
      approvalStatus: "APPROVED",
      updatedBy: SYSTEM_ACTOR_ID,
    },
  });
}

async function wipeNonSuperPmUsers(
  prisma: PrismaClient,
  superPmId: string,
): Promise<number> {
  const result = await prisma.user.deleteMany({
    where: {
      id: {
        notIn: [superPmId, SYSTEM_ACTOR_ID],
      },
    },
  });
  return result.count;
}

async function ensureDummyUsers(prisma: PrismaClient): Promise<number> {
  let created = 0;
  for (const definition of DUMMY_USER_DEFINITIONS) {
    const existing = await prisma.user.findUnique({
      where: { email: definition.email },
    });
    await prisma.user.upsert({
      where: { email: definition.email },
      create: {
        id: definition.id,
        email: definition.email,
        name: definition.name,
        globalRole: definition.globalRole,
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        completedProjectAccess:
          definition.globalRole === "super_pm" ? "ALL" : "NONE",
        dashboardAccess: privilegeDefaultsForRole(definition.globalRole)
          .dashboardAccess,
        projectVisibilityMode: "SELECTED",
        createdBy: definition.id,
        updatedBy: definition.id,
      },
      update: {
        name: definition.name,
        globalRole: definition.globalRole,
        updatedBy: definition.id,
      },
    });
    if (!existing) created += 1;
  }
  return created;
}

async function loadSeedUserMap(
  prisma: PrismaClient,
  superPm: User,
): Promise<SeedUserMap> {
  const pm = await prisma.user.findUniqueOrThrow({
    where: { email: "pm.alex@tracker.local" },
  });
  const sarah = await prisma.user.findUniqueOrThrow({
    where: { email: "member.sarah@tracker.local" },
  });
  const david = await prisma.user.findUniqueOrThrow({
    where: { email: "member.david@tracker.local" },
  });

  return {
    super_pm: superPm,
    pm,
    sarah,
    david,
  };
}

function resolveAssignee(
  assignee: SeedAssignee,
  users: SeedUserMap,
): { assigneeId: string | null; assigneeName: string } {
  if (assignee.kind === "unassigned") {
    return { assigneeId: null, assigneeName: "" };
  }
  if (assignee.kind === "custom") {
    return { assigneeId: null, assigneeName: assignee.name };
  }
  const user = users[assignee.key];
  return { assigneeId: user.id, assigneeName: user.name };
}

function buildSeedProjects(): SeedProject[] {
  return [
    {
      name: "E-Commerce Mobile App Redesign",
      description:
        "Refresh the retail mobile experience with modern checkout, personalisation, and accessibility improvements ahead of peak season.",
      ownerKey: "super_pm",
      memberKeys: ["super_pm", "sarah", "david"],
      tasks: [
        {
          title: "Confirm redesign goals and executive sponsor",
          description:
            "Align scope, success metrics, and steering committee cadence with product leadership.",
          status: "done",
          priority: "important",
          bucket: "initiating",
          assignee: { kind: "user", key: "super_pm" },
          initialStartOffset: -28,
          initialDueOffset: -21,
          actualStartOffset: -27,
          actualCompletionOffset: -20,
          subtasks: [
            { title: "Draft problem statement", isCompleted: true },
            { title: "Secure executive sign-off", isCompleted: true },
          ],
          comments: [
            {
              authorKey: "super_pm",
              content: "Steering group approved the north-star metrics.",
              daysAgo: 19,
            },
          ],
        },
        {
          title: "Map end-to-end customer journeys",
          description:
            "Document browse, basket, checkout, and post-purchase flows for iOS and Android.",
          status: "done",
          priority: "medium",
          bucket: "planning",
          assignee: { kind: "user", key: "sarah" },
          initialStartOffset: -20,
          initialDueOffset: -10,
          actualStartOffset: -19,
          actualCompletionOffset: -9,
          subtasks: [
            { title: "Interview three power users", isCompleted: true },
            { title: "Publish journey map in Miro", isCompleted: true },
            { title: "Review with UX lead", isCompleted: true },
          ],
          comments: [
            {
              authorKey: "sarah",
              content: "Journey map uploaded — ready for wireframe sprint.",
              daysAgo: 8,
            },
          ],
        },
        {
          title: "Build redesigned cart and checkout flow",
          description:
            "Implement sticky cart summary, express pay, and order review screens.",
          status: "in_progress",
          priority: "urgent",
          bucket: "executing",
          assignee: { kind: "user", key: "david" },
          initialStartOffset: -12,
          initialDueOffset: 6,
          actualStartOffset: -11,
          subtasks: [
            { title: "Implement cart line-item component", isCompleted: true },
            { title: "Wire express pay button", isCompleted: true },
            { title: "Add order confirmation screen", isCompleted: false },
          ],
          comments: [
            {
              authorKey: "david",
              content: "Express pay works in staging — confirmation screen next.",
              daysAgo: 1,
            },
          ],
        },
        {
          title: "Integrate third-party wallet SDK",
          description:
            "Coordinate with external vendor for Apple Pay and Google Pay certification.",
          status: "in_progress",
          priority: "important",
          bucket: "executing",
          assignee: { kind: "custom", name: "Mr X" },
          initialStartOffset: -8,
          initialDueOffset: 10,
          actualStartOffset: -7,
          subtasks: [
            { title: "Receive vendor sandbox keys", isCompleted: true },
            { title: "Complete certification checklist", isCompleted: false },
          ],
          comments: [
            {
              authorKey: "super_pm",
              content: "Mr X confirmed sandbox access — target cert next Friday.",
              daysAgo: 3,
            },
          ],
        },
        {
          title: "Polish empty states and skeleton loaders",
          description:
            "Improve perceived performance on catalogue and wishlist screens.",
          status: "todo",
          priority: "low",
          bucket: "executing",
          assignee: { kind: "unassigned" },
          initialStartOffset: 4,
          initialDueOffset: 18,
          subtasks: [
            { title: "Design empty wishlist illustration", isCompleted: false },
            { title: "Implement shimmer placeholders", isCompleted: false },
          ],
          comments: [],
        },
        {
          title: "Monitor checkout conversion during beta",
          description:
            "Track funnel drop-off and session replay samples for the closed beta cohort.",
          status: "in_progress",
          priority: "medium",
          bucket: "monitoring",
          assignee: { kind: "user", key: "sarah" },
          initialStartOffset: -4,
          initialDueOffset: 20,
          actualStartOffset: -3,
          subtasks: [
            { title: "Configure analytics dashboard", isCompleted: true },
            { title: "Weekly beta metrics review", isCompleted: false },
          ],
          comments: [
            {
              authorKey: "sarah",
              content: "Checkout completion up 6% vs legacy — keep monitoring.",
              daysAgo: 2,
            },
          ],
        },
        {
          title: "Fix overdue push notification deep links",
          description:
            "Promotional pushes land on the home screen instead of the advertised product.",
          status: "todo",
          priority: "urgent",
          bucket: "monitoring",
          assignee: { kind: "user", key: "super_pm" },
          initialStartOffset: -14,
          initialDueOffset: -4,
          subtasks: [
            { title: "Reproduce on production build", isCompleted: false },
            { title: "Patch universal link handler", isCompleted: false },
          ],
          comments: [
            {
              authorKey: "david",
              content: "Marketing campaign paused until this is resolved.",
              daysAgo: 5,
            },
          ],
        },
        {
          title: "Prepare App Store submission assets",
          description:
            "Screenshots, preview video, and privacy nutrition labels for both stores.",
          status: "todo",
          priority: "important",
          bucket: "closing",
          assignee: { kind: "custom", name: "Creative Studio Co." },
          initialStartOffset: 12,
          initialDueOffset: 24,
          subtasks: [
            { title: "Draft release notes", isCompleted: false },
            { title: "Collect localised screenshots", isCompleted: false },
          ],
          comments: [],
        },
        {
          title: "Conduct launch retrospective",
          description:
            "Capture delivery lessons and handover actions for the growth squad.",
          status: "done",
          priority: "low",
          bucket: "closing",
          assignee: { kind: "user", key: "david" },
          initialStartOffset: -30,
          initialDueOffset: -25,
          actualStartOffset: -29,
          actualCompletionOffset: -24,
          subtasks: [
            { title: "Send pre-read survey", isCompleted: true },
            { title: "Facilitate retro session", isCompleted: true },
          ],
          comments: [],
        },
        {
          title: "Stakeholder read-out deck for peak readiness",
          description:
            "Summarise scope delivered, open risks, and hypercare plan before peak trading.",
          status: "todo",
          priority: "urgent",
          bucket: "initiating",
          assignee: { kind: "user", key: "sarah" },
          initialStartOffset: -2,
          initialDueOffset: 5,
          subtasks: [
            { title: "Draft executive summary slide", isCompleted: false },
            { title: "Validate open risk register", isCompleted: false },
          ],
          comments: [],
        },
      ],
    },
    {
      name: "Enterprise Cloud Infrastructure Migration",
      description:
        "Programme to migrate legacy on-premises workloads to AWS with phased cutovers and zero-downtime targets.",
      ownerKey: "pm",
      memberKeys: ["pm", "super_pm", "sarah"],
      tasks: [
        {
          title: "Establish migration governance charter",
          description:
            "Define RAID log, steering cadence, and decision rights for the programme.",
          status: "done",
          priority: "urgent",
          bucket: "initiating",
          assignee: { kind: "user", key: "pm" },
          initialStartOffset: -40,
          initialDueOffset: -34,
          actualStartOffset: -39,
          actualCompletionOffset: -33,
          subtasks: [
            { title: "Appoint programme lead", isCompleted: true },
            { title: "Publish communication plan", isCompleted: true },
          ],
          comments: [
            {
              authorKey: "pm",
              content: "Charter signed — wave planning can begin.",
              daysAgo: 32,
            },
          ],
        },
        {
          title: "Complete wave-one application inventory",
          description:
            "Classify 45 tier-one applications by migration strategy and dependency map.",
          status: "in_progress",
          priority: "important",
          bucket: "planning",
          assignee: { kind: "user", key: "sarah" },
          initialStartOffset: -18,
          initialDueOffset: 4,
          actualStartOffset: -17,
          subtasks: [
            { title: "Validate owner contact list", isCompleted: true },
            { title: "Score complexity matrix", isCompleted: false },
            { title: "Review with enterprise architects", isCompleted: false },
          ],
          comments: [
            {
              authorKey: "sarah",
              content: "80% of apps scored — workshops booked for the remainder.",
              daysAgo: 4,
            },
          ],
        },
        {
          title: "Provision AWS landing zone accounts",
          description:
            "Organisation units, SSO integration, and baseline guardrails via Control Tower.",
          status: "todo",
          priority: "medium",
          bucket: "executing",
          assignee: { kind: "user", key: "super_pm" },
          initialStartOffset: 2,
          initialDueOffset: 16,
          subtasks: [
            { title: "Enable Control Tower", isCompleted: false },
            { title: "Configure SCP baseline", isCompleted: false },
          ],
          comments: [],
        },
        {
          title: "Remediate overdue legacy VPN dependency",
          description:
            "Batch jobs still traverse an on-prem VPN — blocks data-centre exit.",
          status: "todo",
          priority: "urgent",
          bucket: "monitoring",
          assignee: { kind: "user", key: "sarah" },
          initialStartOffset: -16,
          initialDueOffset: -5,
          subtasks: [
            { title: "Document traffic flows", isCompleted: false },
            { title: "Design PrivateLink alternative", isCompleted: false },
          ],
          comments: [
            {
              authorKey: "pm",
              content: "Risk register flagged red — escalate to infrastructure board.",
              daysAgo: 6,
            },
          ],
        },
        {
          title: "Migrate identity service to EKS",
          description:
            "Containerise the auth broker and deploy to the shared services cluster.",
          status: "in_progress",
          priority: "important",
          bucket: "executing",
          assignee: { kind: "user", key: "sarah" },
          initialStartOffset: -10,
          initialDueOffset: 8,
          actualStartOffset: -9,
          subtasks: [
            { title: "Build container images", isCompleted: true },
            { title: "Configure Helm release", isCompleted: false },
          ],
          comments: [
            {
              authorKey: "super_pm",
              content: "Security review slot confirmed for next Tuesday.",
              daysAgo: 2,
            },
          ],
        },
        {
          title: "Prepare BAU handover checklist",
          description:
            "Transition runbooks, cost dashboards, and support rota to operations.",
          status: "todo",
          priority: "low",
          bucket: "closing",
          assignee: { kind: "user", key: "pm" },
          initialStartOffset: 20,
          initialDueOffset: 32,
          subtasks: [
            { title: "Draft operating model summary", isCompleted: false },
            { title: "Schedule handover workshop", isCompleted: false },
          ],
          comments: [],
        },
      ],
    },
  ];
}

export async function resetAndSeedDatabase(
  prisma: PrismaClient,
): Promise<SeedSummary> {
  const superPm = await resolveSuperPm(prisma);

  await ensureSystemActor(prisma);
  await wipeProjectData(prisma);
  const usersDeleted = await wipeNonSuperPmUsers(prisma, superPm.id);
  await ensureSystemActor(prisma);
  const usersCreated = await ensureDummyUsers(prisma);

  const users = await loadSeedUserMap(prisma, superPm);
  const seedProjects = buildSeedProjects();

  let tasksCreated = 0;
  let subtasksCreated = 0;
  let commentsCreated = 0;

  for (const seedProject of seedProjects) {
    const owner = users[seedProject.ownerKey];
    const memberIds = [
      ...new Set(seedProject.memberKeys.map((key) => users[key].id)),
    ];

    const project = await prisma.project.create({
      data: {
        name: seedProject.name,
        description: seedProject.description,
        ownerId: owner.id,
        createdBy: owner.id,
        updatedBy: owner.id,
        members: {
          create: memberIds.map((userId) => ({
            userId,
            createdBy: owner.id,
            updatedBy: owner.id,
          })),
        },
      },
    });

    const sortCounters: Record<string, number> = {
      todo: 0,
      in_progress: 0,
      done: 0,
    };

    for (const seedTask of seedProject.tasks) {
      const { assigneeId, assigneeName } = resolveAssignee(
        seedTask.assignee,
        users,
      );
      const assignees =
        assigneeId || assigneeName
          ? [{ userId: assigneeId, assigneeName, sortOrder: 0 }]
          : [];
      const sortOrder = sortCounters[seedTask.status] ?? 0;
      sortCounters[seedTask.status] = sortOrder + 1;

      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          title: seedTask.title,
          description: seedTask.description,
          status: seedTask.status,
          priority: seedTask.priority,
          bucket: seedTask.bucket,
          assigneeId,
          assigneeName,
          assignees: {
            create: assignees.map((pic) => ({
              userId: pic.userId,
              assigneeName: pic.assigneeName,
              sortOrder: pic.sortOrder,
              createdBy: owner.id,
              updatedBy: owner.id,
            })),
          },
          progress:
            seedTask.status === "done"
              ? 100
              : seedTask.status === "in_progress"
                ? 1
                : 0,
          sortOrder,
          listSortOrder: sortOrder,
          initialStartDate: dateFromOffset(seedTask.initialStartOffset),
          initialDueDate: dateFromOffset(seedTask.initialDueOffset),
          updatedStartDate: dateFromOffset(seedTask.initialStartOffset),
          updatedDueDate: dateFromOffset(seedTask.initialDueOffset),
          actualStartDate:
            seedTask.actualStartOffset !== undefined
              ? dateFromOffset(seedTask.actualStartOffset)
              : null,
          actualCompletionDate:
            seedTask.actualCompletionOffset !== undefined
              ? dateFromOffset(seedTask.actualCompletionOffset)
              : null,
          createdBy: owner.id,
          updatedBy: owner.id,
        },
      });
      tasksCreated += 1;

      if (seedTask.subtasks.length > 0) {
        await prisma.subtask.createMany({
          data: seedTask.subtasks.map((subtask, index) => ({
            taskId: task.id,
            title: subtask.title,
            isCompleted: subtask.isCompleted,
            sortOrder: index,
            createdBy: owner.id,
            updatedBy: owner.id,
          })),
        });
        subtasksCreated += seedTask.subtasks.length;
      }

      for (const seedComment of seedTask.comments) {
        const author = users[seedComment.authorKey];
        await prisma.taskComment.create({
          data: {
            taskId: task.id,
            userId: author.id,
            content: seedComment.content,
            createdAt: subDays(new Date(), seedComment.daysAgo),
            createdBy: author.id,
            updatedBy: author.id,
          },
        });
        commentsCreated += 1;
      }
    }
  }

  return {
    superPmEmail: superPm.email,
    usersDeleted,
    usersCreated,
    projectsCreated: seedProjects.length,
    tasksCreated,
    subtasksCreated,
    commentsCreated,
  };
}
