import type {
  Project,
  Subtask,
  Task,
  TaskBucket,
  TaskComment,
  TaskPriority,
  TaskStatus,
} from "@/src/lib/types";

/** Versioned LocalStorage key for Wave 1 (client-first). */
export const STORAGE_KEY = "sptt_v2_wave1";

export type AppStore = {
  version: 2;
  projects: Project[];
  tasks: Task[];
};

/** Stable empty store for SSR — must keep referential equality across calls. */
export const SERVER_SNAPSHOT: AppStore = {
  version: 2,
  projects: [],
  tasks: [],
};

export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageError";
  }
}

export class NotFoundError extends Error {
  constructor(
    public readonly entity: string,
    public readonly id: string,
  ) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function createSeedStore(): AppStore {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const yesterdayDate = yesterday.slice(0, 10);
  const overdueDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const ownerId = "wave1-local-owner";
  const projectId = crypto.randomUUID();

  const taskAuditId = crypto.randomUUID();
  const taskWireframesId = crypto.randomUUID();
  const taskHeadlineId = crypto.randomUUID();
  const taskKickoffId = crypto.randomUUID();

  const projects: Project[] = [
    {
      id: projectId,
      name: "Website Redesign",
      customProjectId: "",
      description:
        "Refresh the marketing site layout, copy, and call-to-action flow.",
      ownerId,
      permittedUserIds: [ownerId],
      lifecycleStatus: "ACTIVE",
      progressReached100At: null,
      completedAt: null,
      completedBy: null,
      completionMethod: null,
      completedPurgeDueAt: null,
      deletedAt: null,
      deletedBy: null,
      purgeDueAt: null,
      createdAt: lastWeek,
      updatedAt: now,
    },
  ];

  const tasks: Task[] = [
    {
      id: taskAuditId,
      projectId,
      title: "Audit current homepage content",
      description: "List outdated sections and missing CTAs.",
      status: "done",
      priority: "medium",
      bucket: "initiating",
      assigneeId: ownerId,
      assigneeName: "Demo Owner",
      initialStartDate: lastWeek.slice(0, 10),
      initialDueDate: yesterdayDate,
      updatedStartDate: null,
      updatedDueDate: null,
      actualStartDate: lastWeek.slice(0, 10),
      actualCompletionDate: yesterdayDate,
      progress: 0,
      sortOrder: 0,
      createdAt: lastWeek,
      createdBy: ownerId,
      createdByName: "Demo Owner",
      updatedAt: yesterday,
      updatedBy: ownerId,
      updatedByName: "Demo Owner",
      subtasks: [
        {
          id: crypto.randomUUID(),
          taskId: taskAuditId,
          title: "Capture competitor CTAs",
          isCompleted: true,
          sortOrder: 0,
        },
        {
          id: crypto.randomUUID(),
          taskId: taskAuditId,
          title: "Flag outdated copy blocks",
          isCompleted: true,
          sortOrder: 1,
        },
      ],
      comments: [
        {
          id: crypto.randomUUID(),
          taskId: taskAuditId,
          userId: ownerId,
          content: "Audit complete — ready for wireframes.",
          createdAt: yesterday,
        },
      ],
    },
    {
      id: taskWireframesId,
      projectId,
      title: "Draft wireframes for mobile nav",
      description: "Keep it simple — one primary CTA in the header.",
      status: "in_progress",
      priority: "important",
      bucket: "planning",
      assigneeId: ownerId,
      assigneeName: "Demo Owner",
      initialStartDate: yesterdayDate,
      initialDueDate: inThreeDays,
      updatedStartDate: null,
      updatedDueDate: null,
      actualStartDate: yesterdayDate,
      actualCompletionDate: null,
      progress: 0,
      sortOrder: 0,
      createdAt: yesterday,
      createdBy: ownerId,
      createdByName: "Demo Owner",
      updatedAt: now,
      updatedBy: ownerId,
      updatedByName: "Demo Owner",
      subtasks: [
        {
          id: crypto.randomUUID(),
          taskId: taskWireframesId,
          title: "Sketch closed menu state",
          isCompleted: true,
          sortOrder: 0,
        },
        {
          id: crypto.randomUUID(),
          taskId: taskWireframesId,
          title: "Sketch open menu state",
          isCompleted: false,
          sortOrder: 1,
        },
        {
          id: crypto.randomUUID(),
          taskId: taskWireframesId,
          title: "Review with stakeholder",
          isCompleted: false,
          sortOrder: 2,
        },
      ],
      comments: [],
    },
    {
      id: taskHeadlineId,
      projectId,
      title: "Write hero headline options",
      description: "",
      status: "todo",
      priority: "urgent",
      bucket: "executing",
      assigneeId: null,
      assigneeName: "",
      initialStartDate: null,
      initialDueDate: overdueDate,
      updatedStartDate: null,
      updatedDueDate: null,
      actualStartDate: null,
      actualCompletionDate: null,
      progress: 0,
      sortOrder: 0,
      createdAt: now,
      createdBy: ownerId,
      createdByName: "Demo Owner",
      updatedAt: now,
      updatedBy: ownerId,
      updatedByName: "Demo Owner",
      subtasks: [],
      comments: [],
    },
    {
      id: taskKickoffId,
      projectId,
      title: "Prepare redesign kick-off agenda",
      description: "Include goals, stakeholders, and success metrics.",
      status: "todo",
      priority: "low",
      bucket: "initiating",
      assigneeId: ownerId,
      assigneeName: "Demo Owner",
      initialStartDate: null,
      initialDueDate: inThreeDays,
      updatedStartDate: null,
      updatedDueDate: null,
      actualStartDate: null,
      actualCompletionDate: null,
      progress: 0,
      sortOrder: 0,
      createdAt: yesterday,
      createdBy: ownerId,
      createdByName: "Demo Owner",
      updatedAt: yesterday,
      updatedBy: ownerId,
      updatedByName: "Demo Owner",
      subtasks: [],
      comments: [],
    },
  ];

  return { version: 2, projects, tasks };
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "todo" || value === "in_progress" || value === "done";
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return (
    value === "urgent" ||
    value === "important" ||
    value === "medium" ||
    value === "low"
  );
}

function isTaskBucket(value: unknown): value is TaskBucket {
  return (
    value === "initiating" ||
    value === "planning" ||
    value === "executing" ||
    value === "monitoring" ||
    value === "closing"
  );
}

function isValidProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Record<string, unknown>;
  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    (typeof project.customProjectId === "string" ||
      project.customProjectId === undefined) &&
    typeof project.description === "string" &&
    typeof project.ownerId === "string" &&
    Array.isArray(project.permittedUserIds) &&
    project.permittedUserIds.every((id) => typeof id === "string") &&
    typeof project.createdAt === "string" &&
    typeof project.updatedAt === "string"
  );
}

function isValidSubtask(value: unknown): value is Subtask {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.taskId === "string" &&
    typeof item.title === "string" &&
    typeof item.isCompleted === "boolean"
  );
}

function isValidComment(value: unknown): value is TaskComment {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.taskId === "string" &&
    typeof item.userId === "string" &&
    typeof item.content === "string" &&
    typeof item.createdAt === "string"
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isValidTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false;
  const task = value as Record<string, unknown>;
  const subtasksOk =
    task.subtasks === undefined ||
    (Array.isArray(task.subtasks) && task.subtasks.every(isValidSubtask));
  const commentsOk =
    task.comments === undefined ||
    (Array.isArray(task.comments) && task.comments.every(isValidComment));

  return (
    typeof task.id === "string" &&
    typeof task.projectId === "string" &&
    typeof task.title === "string" &&
    typeof task.description === "string" &&
    isTaskStatus(task.status) &&
    isTaskPriority(task.priority) &&
    isTaskBucket(task.bucket) &&
    isNullableString(task.assigneeId) &&
    typeof task.assigneeName === "string" &&
    isNullableString(task.initialStartDate) &&
    isNullableString(task.initialDueDate) &&
    isNullableString(task.updatedStartDate) &&
    isNullableString(task.updatedDueDate) &&
    isNullableString(task.actualStartDate) &&
    isNullableString(task.actualCompletionDate) &&
    typeof task.progress === "number" &&
    typeof task.sortOrder === "number" &&
    typeof task.createdAt === "string" &&
    typeof task.createdBy === "string" &&
    typeof task.createdByName === "string" &&
    typeof task.updatedAt === "string" &&
    typeof task.updatedBy === "string" &&
    typeof task.updatedByName === "string" &&
    subtasksOk &&
    commentsOk
  );
}

function isValidStore(value: unknown): value is AppStore {
  if (!value || typeof value !== "object") return false;
  const store = value as Record<string, unknown>;
  if (store.version !== 2) return false;
  if (!Array.isArray(store.projects) || !Array.isArray(store.tasks)) return false;
  return store.projects.every(isValidProject) && store.tasks.every(isValidTask);
}

function persistStore(store: AppStore): void {
  if (!isBrowser()) {
    throw new StorageError("LocalStorage is only available in the browser.");
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

let memoryStore: AppStore | null = null;
const storeListeners = new Set<() => void>();

function notifyStoreListeners(): void {
  for (const listener of storeListeners) {
    listener();
  }
}

/** Subscribe to Wave 1 store mutations (for useSyncExternalStore). */
export function subscribeStore(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

export function getStoreSnapshot(): AppStore {
  if (!isBrowser()) return SERVER_SNAPSHOT;
  if (!memoryStore) {
    memoryStore = loadStoreFromDisk();
  }
  return memoryStore;
}

export function getServerStoreSnapshot(): AppStore {
  return SERVER_SNAPSHOT;
}

function loadStoreFromDisk(): AppStore {
  if (!isBrowser()) return SERVER_SNAPSHOT;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    const seeded = createSeedStore();
    try {
      persistStore(seeded);
    } catch {
      // Keep in-memory seed if persist fails.
    }
    return seeded;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidStore(parsed)) {
      const seeded = createSeedStore();
      persistStore(seeded);
      return seeded;
    }
    return {
      ...parsed,
      projects: parsed.projects.map((project) => ({
        ...project,
        customProjectId: project.customProjectId ?? "",
      })),
    };
  } catch {
    const seeded = createSeedStore();
    try {
      persistStore(seeded);
    } catch {
      // ignore
    }
    return seeded;
  }
}

export function loadStore(): AppStore {
  return getStoreSnapshot();
}

function saveStore(store: AppStore): void {
  // New object identity so useSyncExternalStore subscribers re-render.
  memoryStore = {
    version: 2,
    projects: [...store.projects],
    tasks: [...store.tasks],
  };
  persistStore(memoryStore);
  notifyStoreListeners();
}

function touchProject(store: AppStore, projectId: string, now: string): void {
  const project = store.projects.find((item) => item.id === projectId);
  if (project) project.updatedAt = now;
}

export function getProjects(): Project[] {
  return [...loadStore().projects].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getProjectById(id: string): Project | null {
  return loadStore().projects.find((project) => project.id === id) ?? null;
}

export function getTasksByProjectId(projectId: string): Task[] {
  return loadStore().tasks.filter((task) => task.projectId === projectId);
}

export function updateTaskStatus(taskId: string, status: TaskStatus): Task {
  const store = loadStore();
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task) throw new NotFoundError("Task", taskId);

  const now = new Date().toISOString();
  task.status = status;
  task.updatedAt = now;

  if (status === "in_progress" && !task.actualStartDate) {
    task.actualStartDate = now.slice(0, 10);
  }
  if (status === "done" && !task.actualCompletionDate) {
    task.actualCompletionDate = now.slice(0, 10);
  }

  touchProject(store, task.projectId, now);
  saveStore(store);
  return { ...task, subtasks: [...(task.subtasks ?? [])], comments: [...(task.comments ?? [])] };
}

export function updateTaskFields(
  taskId: string,
  patch: Partial<Task>,
): Task {
  const store = loadStore();
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task) throw new NotFoundError("Task", taskId);

  const now = new Date().toISOString();
  const protectedKeys = new Set([
    "id",
    "projectId",
    "createdAt",
    "subtasks",
    "comments",
  ]);
  const safePatch: Partial<Task> = {};
  for (const [key, value] of Object.entries(patch) as Array<
    [keyof Task, Task[keyof Task]]
  >) {
    if (protectedKeys.has(key)) continue;
    (safePatch as Record<string, unknown>)[key] = value;
  }

  Object.assign(task, safePatch, { updatedAt: now });

  if (safePatch.status === "in_progress" && !task.actualStartDate) {
    task.actualStartDate = now.slice(0, 10);
  }
  if (safePatch.status === "done" && !task.actualCompletionDate) {
    task.actualCompletionDate = now.slice(0, 10);
  }

  touchProject(store, task.projectId, now);
  saveStore(store);
  return {
    ...task,
    subtasks: [...(task.subtasks ?? [])],
    comments: [...(task.comments ?? [])],
  };
}

export function toggleSubtask(
  taskId: string,
  subtaskId: string,
  isCompleted: boolean,
): Task {
  const store = loadStore();
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task) throw new NotFoundError("Task", taskId);

  const subtasks = [...(task.subtasks ?? [])];
  const index = subtasks.findIndex((item) => item.id === subtaskId);
  if (index < 0) throw new NotFoundError("Subtask", subtaskId);

  const now = new Date().toISOString();
  subtasks[index] = {
    ...subtasks[index],
    isCompleted,
    updatedAt: now,
  };
  task.subtasks = subtasks;
  task.updatedAt = now;
  touchProject(store, task.projectId, now);
  saveStore(store);
  return {
    ...task,
    subtasks: [...subtasks],
    comments: [...(task.comments ?? [])],
  };
}

export function addSubtask(taskId: string, title: string): Task {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Checklist item title is required.");

  const store = loadStore();
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task) throw new NotFoundError("Task", taskId);

  const now = new Date().toISOString();
  const subtasks = [...(task.subtasks ?? [])];
  const next: Subtask = {
    id: crypto.randomUUID(),
    taskId,
    title: trimmed,
    isCompleted: false,
    sortOrder: subtasks.length,
    createdAt: now,
    updatedAt: now,
  };
  subtasks.push(next);
  task.subtasks = subtasks;
  task.updatedAt = now;
  touchProject(store, task.projectId, now);
  saveStore(store);
  return {
    ...task,
    subtasks: [...subtasks],
    comments: [...(task.comments ?? [])],
  };
}

/** Local Wave 1 comment post (Wave 3 will move this to the cloud). */
export function addComment(
  taskId: string,
  content: string,
  userId = "wave1-local-owner",
): Task {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Comment content is required.");

  const store = loadStore();
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task) throw new NotFoundError("Task", taskId);

  const now = new Date().toISOString();
  const comments = [...(task.comments ?? [])];
  comments.push({
    id: crypto.randomUUID(),
    taskId,
    userId,
    content: trimmed,
    createdAt: now,
  });
  task.comments = comments;
  task.updatedAt = now;
  touchProject(store, task.projectId, now);
  saveStore(store);
  return {
    ...task,
    subtasks: [...(task.subtasks ?? [])],
    comments: [...comments],
  };
}

export function createTask(input: {
  projectId: string;
  title: string;
  description?: string;
}): Task {
  const store = loadStore();
  const project = store.projects.find((item) => item.id === input.projectId);
  if (!project) throw new NotFoundError("Project", input.projectId);

  const title = input.title.trim();
  if (!title) throw new Error("Task title is required.");

  const now = new Date().toISOString();
  const task: Task = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    title,
    description: (input.description ?? "").trim(),
    status: "todo",
    priority: "medium",
    bucket: "executing",
    assigneeId: null,
    assigneeName: "",
    initialStartDate: null,
    initialDueDate: null,
    updatedStartDate: null,
    updatedDueDate: null,
    actualStartDate: null,
    actualCompletionDate: null,
    progress: 0,
    sortOrder: 0,
    createdAt: now,
    createdBy: project.ownerId,
    createdByName: "Demo Owner",
    updatedAt: now,
    updatedBy: project.ownerId,
    updatedByName: "Demo Owner",
    subtasks: [],
    comments: [],
  };

  store.tasks.push(task);
  touchProject(store, project.id, now);
  saveStore(store);
  return { ...task, subtasks: [], comments: [] };
}
