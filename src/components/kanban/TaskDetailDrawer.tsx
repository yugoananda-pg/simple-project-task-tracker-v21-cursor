"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import ConfirmDialog from "@/src/components/ui/ConfirmDialog";
import DateField from "@/src/components/ui/DateField";
import AssigneePicField from "@/src/components/tasks/AssigneePicField";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import ProgressPairBadges from "@/src/components/schedule/ProgressPairBadges";
import type { ProjectMemberUser } from "@/src/lib/actions/projects";
import {
  createComment,
  getTaskComments,
  type TaskCommentWithAuthor,
} from "@/src/lib/actions/comments";
import type { TaskScheduleMetrics } from "@/src/lib/analytics/weighted-progress";
import {
  buildProgressStatusPatch,
  isFutureLocalDate,
  restoreBrokenDateChanges,
  restoredFieldsMessage,
  toLocalDateString,
} from "@/src/lib/task-defaults";
import type {
  Subtask,
  Task,
  TaskBucket,
  TaskPriority,
  TaskStatus,
} from "@/src/lib/types";

export type TaskDetailDrawerProps = {
  task: Task | null;
  open: boolean;
  scheduleMetrics?: TaskScheduleMetrics;
  onClose: () => void;
  /** Writes the finished drawer draft. Returns false when the save is rejected. */
  onTaskChange?: (
    taskId: string,
    patch: Partial<Task>,
  ) => void | Promise<boolean>;
  /** Parent calls this to flush before closing or switching tasks. */
  commitRef?: MutableRefObject<(() => Promise<boolean>) | null>;
  /** Shown after close when some fields were restored and the rest were saved. */
  onRestoreNotice?: (message: string) => void;
  onToggleSubtask?: (
    taskId: string,
    subtaskId: string,
    isCompleted: boolean,
  ) => void;
  onAddSubtask?: (taskId: string, title: string) => void;
  readOnly?: boolean;
  canDeleteTask?: boolean;
  onDeleteTask?: (taskId: string) => void;
  isDeletePending?: boolean;
  memberUsers?: ProjectMemberUser[];
  customAssigneeNames?: string[];
  /** Bump after cancelling actual-finish confirm so date fields revert. */
  dateResetToken?: number;
};

const PROCESS_GROUP_OPTIONS: ReadonlyArray<{ value: TaskBucket; label: string }> = [
  { value: "initiating", label: "Initiating" },
  { value: "planning", label: "Planning" },
  { value: "executing", label: "Executing" },
  { value: "monitoring", label: "Monitoring" },
  { value: "closing", label: "Closing" },
];

const PRIORITY_OPTIONS: ReadonlyArray<{ value: TaskPriority; label: string }> =
  [
    { value: "urgent", label: "Urgent" },
    { value: "important", label: "Important" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];

const STATUS_OPTIONS: ReadonlyArray<{ value: TaskStatus; label: string }> = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "Doing" },
  { value: "done", label: "Done" },
];

type DateFieldKey =
  | "initialStartDate"
  | "initialDueDate"
  | "updatedStartDate"
  | "updatedDueDate"
  | "actualStartDate"
  | "actualCompletionDate";

const DATE_FIELDS: ReadonlyArray<{ key: DateFieldKey; label: string }> = [
  { key: "initialStartDate", label: "Initial start" },
  { key: "initialDueDate", label: "Initial due" },
  { key: "updatedStartDate", label: "Updated start" },
  { key: "updatedDueDate", label: "Updated due" },
  { key: "actualStartDate", label: "Actual start" },
  { key: "actualCompletionDate", label: "Actual completion" },
];

/** Format an ISO date (or YYYY-MM-DD) as DD/MM/YYYY without timezone shifts. */
function formatAuDate(value: string | null | undefined): string {
  if (!value) return "—";
  const datePart = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** Format an ISO datetime as DD/MM/YYYY, HH:mm (Australian English). */
function formatAuDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const datePart = new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${datePart}, ${timePart}`;
}

function authorInitial(name: string): string {
  const trimmed = name.trim();
  return (trimmed[0] ?? "?").toUpperCase();
}

function AuthorAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"
    >
      {authorInitial(name)}
    </span>
  );
}

/** Keep only a calendar YYYY-MM-DD string for native date inputs. */
function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : "";
}

const fieldClassName =
  "box-border w-full min-w-0 max-w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-400/40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-500/40";

const labelClassName =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300";

const sectionTitleClassName =
  "text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50";

const sectionClassName = "w-full min-w-0 max-w-full";

const primaryButtonClassName =
  "inline-flex w-full shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white";

/**
 * Instant CSS tooltip for disabled primary actions.
 * Avoids the browser's delayed native `title` tooltip.
 */
function InstantTooltipButton({
  disabled,
  tooltip,
  type = "submit",
  className,
  children,
}: {
  disabled: boolean;
  tooltip: string;
  type?: "button" | "submit" | "reset";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className="group relative inline-flex w-full max-w-full shrink-0 sm:w-auto">
      <button
        type={type}
        disabled={disabled}
        className={className}
        aria-disabled={disabled}
      >
        {children}
      </button>
      {disabled ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md bg-zinc-900 px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug text-white opacity-0 invisible shadow-lg transition-none duration-0 group-hover:visible group-hover:opacity-100 dark:bg-zinc-100 dark:text-zinc-950"
        >
          {tooltip}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Native HTML5 date picker — uncontrolled while editing so keyboard
 * entry of day/month/year is not clobbered by React re-renders.
 * Parent state syncs only on blur.
 */
function AuDateField({
  id,
  label,
  value,
  onCommit,
  disabled = false,
  disallowFuture = false,
  validate,
  resetToken = 0,
  onRevealUpdate,
}: {
  id: string;
  label: string;
  value: string | null;
  onCommit: (next: string | null) => void;
  disabled?: boolean;
  disallowFuture?: boolean;
  validate?: (next: string | null) => string | null;
  resetToken?: number;
  onRevealUpdate?: (work: () => void) => void;
}) {
  const externalValue = toDateInputValue(value);
  const [caption, setCaption] = useState(externalValue);
  const [syncedExternal, setSyncedExternal] = useState(externalValue);
  const [error, setError] = useState<string | null>(null);
  /** Extra remount token when an invalid edit must be discarded. */
  const [epoch, setEpoch] = useState(0);
  const [seenResetToken, setSeenResetToken] = useState(resetToken);

  if (syncedExternal !== externalValue) {
    setSyncedExternal(externalValue);
    setCaption(externalValue);
    setError(null);
  }
  if (seenResetToken !== resetToken) {
    setSeenResetToken(resetToken);
    setCaption(externalValue);
    setError(null);
    setEpoch((n) => n + 1);
  }

  const today = toLocalDateString();

  function rejection(raw: string): string | null {
    if (raw === "") return validate?.(null) ?? null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    return (
      validate?.(raw) ??
      (disallowFuture && isFutureLocalDate(raw)
        ? "Actual dates cannot be in the future."
        : null)
    );
  }

  function revertInvalid(message: string) {
    const apply = () => {
      setError(message);
      setCaption(externalValue);
      setEpoch((n) => n + 1);
    };
    if (onRevealUpdate) onRevealUpdate(apply);
    else apply();
  }

  function applyRaw(raw: string, allowIncompleteRevert: boolean) {
    if (raw === "") {
      const message = rejection("");
      if (message) {
        revertInvalid(message);
        return;
      }
      setCaption("");
      setError(null);
      if (externalValue !== "") onCommit(null);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      if (!allowIncompleteRevert) return;
      setCaption(externalValue);
      setError(null);
      setEpoch((n) => n + 1);
      return;
    }
    const message = rejection(raw);
    if (message) {
      revertInvalid(message);
      return;
    }
    setError(null);
    setCaption(raw);
    // Skip no-op commits so a remount/blur cannot re-queue the same date.
    if (raw !== externalValue) onCommit(raw);
  }

  return (
    <div className="w-full min-w-0 max-w-full">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <DateField
        key={`${id}-${externalValue}-${epoch}`}
        id={id}
        defaultValue={externalValue}
        max={disallowFuture ? today : undefined}
        disabled={disabled}
        onChange={(event) => applyRaw(event.target.value, false)}
        onBlur={(event) => applyRaw(event.target.value, true)}
        className={`${fieldClassName} [color-scheme:light] dark:[color-scheme:dark]`}
      />
      <p className="mt-1 break-words text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
        {caption ? formatAuDate(caption) : "—"}{" "}
        <span className="text-zinc-400 dark:text-zinc-500">(DD/MM/YYYY)</span>
      </p>
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
export default function TaskDetailDrawer({
  task,
  open,
  scheduleMetrics,
  onClose,
  onTaskChange,
  commitRef,
  onRestoreNotice,
  onToggleSubtask,
  onAddSubtask,
  readOnly = false,
  canDeleteTask = false,
  onDeleteTask,
  isDeletePending = false,
  memberUsers = [],
  customAssigneeNames = [],
  dateResetToken = 0,
}: TaskDetailDrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const [checklistDraft, setChecklistDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [comments, setComments] = useState<TaskCommentWithAuthor[]>([]);
  const [commentsTaskId, setCommentsTaskId] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [draftTaskId, setDraftTaskId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [progressDraft, setProgressDraft] = useState("0");
  const [syncedProgress, setSyncedProgress] = useState(0);
  const [isEditingProgress, setIsEditingProgress] = useState(false);
  const [fieldDraft, setFieldDraft] = useState<Partial<Task>>({});
  const [localDateReset, setLocalDateReset] = useState(0);
  const [pendingFinish, setPendingFinish] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const fieldDraftRef = useRef<Partial<Task>>({});
  fieldDraftRef.current = fieldDraft;

  const sourceTask = task;
  const activeTask = sourceTask
    ? { ...sourceTask, ...fieldDraft }
    : sourceTask;
  const isVisible = open && activeTask !== null;
  const activeCommentsTaskId = isVisible && activeTask ? activeTask.id : null;
  const commentsLoading =
    activeCommentsTaskId !== null && commentsTaskId !== activeCommentsTaskId;

  if (activeTask && activeTask.id !== draftTaskId) {
    setDraftTaskId(activeTask.id);
    setTitleDraft(activeTask.title);
    setDescriptionDraft(activeTask.description);
    setProgressDraft(String(activeTask.progress));
    setSyncedProgress(activeTask.progress);
    setIsEditingProgress(false);
    setFieldDraft({});
    fieldDraftRef.current = {};
    setPendingFinish(null);
    setDraftError(null);
    setLocalDateReset(0);
    setChecklistDraft("");
    setCommentDraft("");
    setComments([]);
    setCommentsTaskId(null);
    setCommentsError(null);
    setDeleteDialogOpen(false);
  }
  if (!activeTask && draftTaskId !== null) {
    setDraftTaskId(null);
    setTitleDraft("");
    setDescriptionDraft("");
    setProgressDraft("0");
    setSyncedProgress(0);
    setIsEditingProgress(false);
    setFieldDraft({});
    fieldDraftRef.current = {};
    setPendingFinish(null);
    setDraftError(null);
    setLocalDateReset(0);
    setChecklistDraft("");
    setCommentDraft("");
    setComments([]);
    setCommentsTaskId(null);
    setCommentsError(null);
    setDeleteDialogOpen(false);
  }

  if (
    activeTask &&
    !isEditingProgress &&
    syncedProgress !== activeTask.progress
  ) {
    setSyncedProgress(activeTask.progress);
    setProgressDraft(String(activeTask.progress));
  }

  useEffect(() => {
    if (!activeCommentsTaskId) return;

    let cancelled = false;
    const taskId = activeCommentsTaskId;

    getTaskComments(taskId).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setComments([]);
        setCommentsError(
          result.error ?? "Unable to load comments. Please try again.",
        );
      } else {
        setComments(result.data);
        setCommentsError(null);
      }
      setCommentsTaskId(taskId);
    });

    return () => {
      cancelled = true;
    };
  }, [activeCommentsTaskId]);

  const onCloseRef = useRef(onClose);
  const requestCloseRef = useRef<() => Promise<boolean>>(async () => true);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isVisible) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void requestCloseRef.current();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isVisible]);

  const subtasks: Subtask[] = useMemo(() => {
    const items = activeTask?.subtasks ?? [];
    return [...items].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
  }, [activeTask?.subtasks]);

  const completedCount = subtasks.filter((item) => item.isCompleted).length;
  const totalCount = subtasks.length;
  const progressPercent =
    totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const canEdit = !readOnly && Boolean(onTaskChange);
  const canPostComment = !readOnly;
  const hasUnsavedChanges =
    Object.keys(fieldDraft).length > 0 ||
    (sourceTask != null && titleDraft.trim() !== sourceTask.title) ||
    (sourceTask != null && descriptionDraft !== sourceTask.description);

  function patchTask(patch: Partial<Task>) {
    if (!sourceTask || !canEdit) return;
    const synced =
      patch.status !== undefined || patch.progress !== undefined
        ? buildProgressStatusPatch({ ...sourceTask, ...fieldDraftRef.current }, patch)
        : patch;
    setDraftError(null);
    setFieldDraft((current) => {
      const next = { ...current, ...synced };
      fieldDraftRef.current = next;
      return next;
    });
  }

  function collectPendingPatch(): Partial<Task> {
    if (!sourceTask) return {};
    const next: Partial<Task> = { ...fieldDraftRef.current };
    const title = titleDraft.trim();
    if (title && title !== (next.title ?? sourceTask.title)) {
      next.title = title;
    }
    if (descriptionDraft !== (next.description ?? sourceTask.description)) {
      next.description = descriptionDraft;
    }
    if (isEditingProgress) {
      const parsed = Number.parseInt(progressDraft, 10);
      if (!Number.isNaN(parsed)) {
        Object.assign(
          next,
          buildProgressStatusPatch({ ...sourceTask, ...next }, { progress: parsed }),
        );
      }
    }
    for (const field of DATE_FIELDS) {
      const input = document.getElementById(`${field.key}-${sourceTask.id}`);
      if (!(input instanceof HTMLInputElement)) continue;
      const raw = input.value.trim();
      const current =
        next[field.key] !== undefined ? next[field.key] : sourceTask[field.key];
      if (raw === "") {
        if (current != null) next[field.key] = null;
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw === current) continue;
      next[field.key] = raw;
    }
    return next;
  }

  async function flushDraft(): Promise<boolean> {
    if (!sourceTask || !canEdit || !onTaskChange) return true;
    if (pendingFinish) return false;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) {
      const dateIds = DATE_FIELDS.map((field) => `${field.key}-${sourceTask.id}`);
      if (dateIds.includes(focused.id)) focused.blur();
    }
    const patch = collectPendingPatch();
    const restored: Array<{ label: string; reason: string }> = [];
    if (!titleDraft.trim() && sourceTask.title) {
      setTitleDraft(sourceTask.title);
      restored.push({
        label: "Title",
        reason: "A task needs a title.",
      });
    } else if ((patch.title?.length ?? 0) > 200) {
      delete patch.title;
      setTitleDraft(sourceTask.title);
      restored.push({
        label: "Title",
        reason: "A title must be 200 characters or fewer.",
      });
    }

    const dates = restoreBrokenDateChanges(sourceTask, patch);
    for (const item of dates.restored) {
      delete patch[item.key as keyof Task];
    }
    if (dates.restored.length > 0) {
      setFieldDraft((current) => {
        const next = { ...current };
        for (const item of dates.restored) {
          delete next[item.key as keyof Task];
        }
        fieldDraftRef.current = next;
        return next;
      });
      setLocalDateReset((token) => token + 1);
      restored.push(...dates.restored);
    }

    const notice = restoredFieldsMessage(
      restored,
      Object.keys(patch).length > 0,
    );
    if (Object.keys(patch).length === 0) {
      if (notice) onRestoreNotice?.(notice);
      setDraftError(null);
      return true;
    }

    setIsCommitting(true);
    try {
      const result = await onTaskChange(sourceTask.id, patch);
      if (result === false) {
        if (notice) setDraftError(notice);
        return false;
      }
      setFieldDraft({});
      fieldDraftRef.current = {};
      setDraftError(null);
      if (notice) onRestoreNotice?.(notice);
      return true;
    } finally {
      setIsCommitting(false);
    }
  }

  async function requestClose(): Promise<boolean> {
    const ok = await flushDraft();
    if (!ok) return false;
    onCloseRef.current();
    return true;
  }
  requestCloseRef.current = requestClose;

  useEffect(() => {
    if (!commitRef) return;
    commitRef.current = flushDraft;
  });

  function commitProgressValue(raw: string | number) {
    if (!activeTask) return;
    const parsed =
      typeof raw === "number" ? raw : Number.parseInt(String(raw).trim(), 10);
    if (Number.isNaN(parsed)) {
      setProgressDraft(String(activeTask.progress));
      return;
    }
    const progress = Math.max(0, Math.min(100, Math.round(parsed)));
    setProgressDraft(String(progress));
    setSyncedProgress(progress);
    patchTask({ progress });
  }

  function commitDateField(key: DateFieldKey, next: string | null) {
    if (
      key === "actualCompletionDate" &&
      next &&
      (activeTask?.status !== "done" || (activeTask?.progress ?? 0) < 100)
    ) {
      setPendingFinish(next);
      return;
    }
    patchTask({ [key]: next });
  }

  function handleAddChecklistItem(event: FormEvent) {
    event.preventDefault();
    if (!activeTask) return;
    const title = checklistDraft.trim();
    if (!title) return;
    onAddSubtask?.(activeTask.id, title);
    setChecklistDraft("");
  }

  async function handlePostComment(event: FormEvent) {
    event.preventDefault();
    if (!activeTask || !canPostComment || commentSubmitting) return;
    const content = commentDraft.trim();
    if (!content) return;

    setCommentSubmitting(true);
    setCommentsError(null);

    const result = await createComment(activeTask.id, content);
    if (!result.success) {
      setCommentsError(result.error ?? "Unable to post comment. Please try again.");
      setCommentSubmitting(false);
      return;
    }

    setCommentDraft("");
    setComments((current) => [...current, result.data]);
    setCommentsError(null);
    setCommentSubmitting(false);
  }

  if (!open && !activeTask) {
    return null;
  }

  return (
    <div
      className={[
        "fixed inset-0 z-50",
        isVisible ? "pointer-events-auto" : "pointer-events-none",
      ].join(" ")}
      aria-hidden={!isVisible}
      inert={!isVisible ? true : undefined}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close task details"
        tabIndex={isVisible ? 0 : -1}
        onClick={() => {
          void requestClose();
        }}
        className={[
          "absolute inset-0 bg-zinc-950/55 transition-opacity duration-300 ease-out dark:bg-black/70",
          isVisible ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />

      {/* Slide-over panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={[
          "absolute inset-y-0 right-0 flex w-full max-w-lg flex-col overflow-x-hidden",
          "border-l border-zinc-200 bg-white shadow-2xl outline-none",
          "dark:border-zinc-700 dark:bg-zinc-950 dark:shadow-black/50",
          "transition-transform duration-300 ease-out",
          "sm:max-w-xl",
          isVisible ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {activeTask ? (
          <div
            key={activeTask.id}
            className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col"
          >
            <header className="flex w-full min-w-0 max-w-full items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Task details
                  {readOnly ? (
                    <span className="ml-2 rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      Read-only
                    </span>
                  ) : hasUnsavedChanges ? (
                    <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                      Unsaved
                    </span>
                  ) : null}
                </p>
                <h2
                  id={titleId}
                  className="mt-1 truncate text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
                >
                  {activeTask.title || "Untitled task"}
                </h2>
                {scheduleMetrics ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusFlagBadge flag={scheduleMetrics.statusFlag} />
                    <ProgressPairBadges
                      actual={scheduleMetrics.pActual}
                      target={scheduleMetrics.pTarget}
                    />
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  void requestClose();
                }}
                disabled={isCommitting}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:focus-visible:outline-zinc-100"
                aria-label="Close"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            {draftError ? (
              <div className="border-b border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-500/40 dark:bg-red-950/40 sm:px-5">
                <p className="text-xs font-medium text-red-800 dark:text-red-200">
                  {draftError}
                </p>
              </div>
            ) : null}

            {readOnly ? (
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/80 sm:px-5">
                <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  You are viewing this task in read-only mode. Editing fields,
                  checklist items, and comments is disabled for your role on
                  this project.
                </p>
              </div>
            ) : null}

            <div className="min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
              {/* Title & description */}
              <section className={`${sectionClassName} space-y-4`}>
                <div className="w-full min-w-0 max-w-full">
                  <label
                    htmlFor={`title-${activeTask.id}`}
                    className={labelClassName}
                  >
                    Title
                  </label>
                  <input
                    id={`title-${activeTask.id}`}
                    type="text"
                    value={titleDraft}
                    disabled={!canEdit}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={(event) => {
                      const trimmed = event.currentTarget.value.trim();
                      setTitleDraft(trimmed);
                      if (trimmed && trimmed !== activeTask.title) {
                        patchTask({ title: trimmed });
                      }
                    }}
                    className={fieldClassName}
                    placeholder="Task title"
                  />
                </div>

                <div className="w-full min-w-0 max-w-full">
                  <label
                    htmlFor={`description-${activeTask.id}`}
                    className={labelClassName}
                  >
                    Description
                  </label>
                  <textarea
                    id={`description-${activeTask.id}`}
                    value={descriptionDraft}
                    disabled={!canEdit}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                    onBlur={(event) => {
                      const next = event.currentTarget.value;
                      setDescriptionDraft(next);
                      if (next !== activeTask.description) {
                        patchTask({ description: next });
                      }
                    }}
                    rows={4}
                    className={`${fieldClassName} min-h-24 resize-y`}
                    placeholder="Add a description…"
                  />
                </div>
              </section>

              {/* Planner controls */}
              <section
                className={`${sectionClassName} mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2`}
              >
                <div className="w-full min-w-0 max-w-full">
                  <label
                    htmlFor={`process-group-${activeTask.id}`}
                    className={labelClassName}
                  >
                    Process group
                  </label>
                  <select
                    id={`process-group-${activeTask.id}`}
                    value={activeTask.bucket}
                    disabled={!canEdit}
                    onChange={(event) =>
                      patchTask({ bucket: event.target.value as TaskBucket })
                    }
                    className={fieldClassName}
                  >
                    {PROCESS_GROUP_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full min-w-0 max-w-full">
                  <label
                    htmlFor={`priority-${activeTask.id}`}
                    className={labelClassName}
                  >
                    Priority
                  </label>
                  <select
                    id={`priority-${activeTask.id}`}
                    value={activeTask.priority}
                    disabled={!canEdit}
                    onChange={(event) =>
                      patchTask({
                        priority: event.target.value as TaskPriority,
                      })
                    }
                    className={fieldClassName}
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full min-w-0 max-w-full">
                  <label
                    htmlFor={`status-${activeTask.id}`}
                    className={labelClassName}
                  >
                    Status
                  </label>
                  <select
                    id={`status-${activeTask.id}`}
                    value={activeTask.status}
                    disabled={!canEdit}
                    onChange={(event) =>
                      patchTask({ status: event.target.value as TaskStatus })
                    }
                    className={fieldClassName}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full min-w-0 max-w-full sm:col-span-2">
                  <label
                    htmlFor={`progress-${activeTask.id}`}
                    className={labelClassName}
                  >
                    Progress
                  </label>
                  <div className="flex items-center gap-3 overflow-visible p-2">
                    <input
                      id={`progress-${activeTask.id}`}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Number.parseInt(progressDraft, 10) || 0}
                      disabled={!canEdit}
                      onPointerDown={() => setIsEditingProgress(true)}
                      onChange={(event) => {
                        setIsEditingProgress(true);
                        setProgressDraft(event.target.value);
                      }}
                      onPointerUp={(event) => {
                        setIsEditingProgress(false);
                        commitProgressValue(Number(event.currentTarget.value));
                      }}
                      onKeyUp={(event) => {
                        commitProgressValue(Number(event.currentTarget.value));
                        setIsEditingProgress(false);
                      }}
                      className="h-2 w-full min-w-0 cursor-pointer accent-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:accent-zinc-100"
                    />
                    <div className="relative w-24 shrink-0">
                      <input
                        id={`progress-number-${activeTask.id}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={progressDraft}
                        disabled={!canEdit}
                        onFocus={() => setIsEditingProgress(true)}
                        onChange={(event) => {
                          const next = event.target.value.replace(/[^\d]/g, "");
                          if (next.length > 3) return;
                          setProgressDraft(next);
                        }}
                        onBlur={(event) => {
                          setIsEditingProgress(false);
                          const raw = event.currentTarget.value.trim();
                          setProgressDraft(raw === "" ? "0" : raw);
                          commitProgressValue(raw === "" ? 0 : raw);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            (event.target as HTMLInputElement).blur();
                          }
                        }}
                        className={`${fieldClassName} pr-8 text-center tabular-nums`}
                        aria-label="Progress percent"
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-zinc-500 dark:text-zinc-400"
                      >
                        %
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                    {activeTask.progress}% ·{" "}
                    {activeTask.status === "todo"
                      ? "To Do"
                      : activeTask.status === "in_progress"
                        ? "Doing"
                        : "Done"}
                  </p>
                  {canEdit ? (
                    <p className="mt-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                      Field changes stay here until you close the panel. A value that
                      breaks a rule returns to its previous value. Every other
                      change is saved. Checklist items and comments still save
                      as you add them.
                    </p>
                  ) : null}
                  {draftError ? (
                    <p className="mt-2 text-[11px] font-medium text-red-600 dark:text-red-400">
                      {draftError}
                    </p>
                  ) : null}
                </div>

                <AssigneePicField
                  key={activeTask.id}
                  task={activeTask}
                  members={memberUsers}
                  suggestions={customAssigneeNames}
                  disabled={!canEdit}
                  labelClassName={labelClassName}
                  fieldClassName={fieldClassName}
                  onCommit={(patch) => patchTask(patch)}
                />
              </section>

              {/* Multi-date grid */}
              <section className={`${sectionClassName} mt-6`}>
                <h3 className={sectionTitleClassName}>Dates</h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Use the date picker, or type a calendar date. Shown below as
                  DD/MM/YYYY (Australian English). Start and end dates are
                  checked together when you close the panel. Each date that
                  breaks a rule returns to its previous value.
                </p>
                <div className="mt-3 grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  {DATE_FIELDS.map((field) => (
                    <AuDateField
                      key={`${activeTask.id}-${field.key}`}
                      id={`${field.key}-${activeTask.id}`}
                      label={field.label}
                      value={activeTask[field.key]}
                      disabled={!canEdit}
                      disallowFuture={
                        field.key === "actualStartDate" ||
                        field.key === "actualCompletionDate"
                      }
                      resetToken={dateResetToken + localDateReset}
                      onCommit={(next) => commitDateField(field.key, next)}
                    />
                  ))}
                </div>
              </section>

              {/* Checklist */}
              <section className={`${sectionClassName} mt-8`}>
                <div className="flex w-full min-w-0 max-w-full items-end justify-between gap-3">
                  <h3 className={`${sectionTitleClassName} min-w-0`}>
                    Checklist
                  </h3>
                  <p className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {totalCount === 0
                      ? "No items yet"
                      : `${completedCount} of ${totalCount} items completed`}
                  </p>
                </div>

                <div
                  className="mt-3 h-2 w-full max-w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                  aria-label="Checklist progress"
                >
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300 dark:bg-emerald-400"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <ul className="mt-4 w-full min-w-0 max-w-full space-y-2">
                  {subtasks.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                      No checklist items yet. Add one below.
                    </li>
                  ) : (
                    subtasks.map((item) => (
                      <li
                        key={item.id}
                        className="flex w-full min-w-0 max-w-full items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/80"
                      >
                        <input
                          id={`subtask-${item.id}`}
                          type="checkbox"
                          checked={item.isCompleted}
                          disabled={!canEdit || !onToggleSubtask}
                          onChange={(event) =>
                            onToggleSubtask?.(
                              activeTask.id,
                              item.id,
                              event.target.checked,
                            )
                          }
                          className="mt-0.5 size-4 shrink-0 rounded border-zinc-400 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-500 dark:bg-zinc-950"
                        />
                        <label
                          htmlFor={`subtask-${item.id}`}
                          className={[
                            "min-w-0 flex-1 break-words text-sm leading-snug",
                            item.isCompleted
                              ? "text-zinc-500 line-through dark:text-zinc-500"
                              : "text-zinc-900 dark:text-zinc-100",
                          ].join(" ")}
                        >
                          {item.title}
                        </label>
                      </li>
                    ))
                  )}
                </ul>

                <form
                  onSubmit={handleAddChecklistItem}
                  className="mt-3 flex w-full min-w-0 max-w-full flex-col gap-2 sm:flex-row"
                >
                  <input
                    type="text"
                    value={checklistDraft}
                    onChange={(event) => setChecklistDraft(event.target.value)}
                    className={`${fieldClassName} flex-1`}
                    placeholder="Add checklist item"
                    aria-label="New checklist item"
                  />
                  <InstantTooltipButton
                    type="submit"
                    disabled={!checklistDraft.trim() || !onAddSubtask}
                    tooltip={
                      !onAddSubtask
                        ? "Checklist updates are unavailable right now"
                        : "Please enter a checklist item name first"
                    }
                    className={primaryButtonClassName}
                  >
                    Add checklist item
                  </InstantTooltipButton>
                </form>
              </section>

              {/* Comments */}
              <section className={`${sectionClassName} mt-8 pb-2`}>
                <div className="flex w-full min-w-0 max-w-full items-end justify-between gap-3">
                  <h3 className={`${sectionTitleClassName} min-w-0`}>
                    Comments
                  </h3>
                  <p className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {commentsLoading
                      ? "Loading…"
                      : comments.length === 1
                        ? "1 comment"
                        : `${comments.length} comments`}
                  </p>
                </div>

                {commentsError ? (
                  <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
                    {commentsError}
                  </p>
                ) : null}

                <ul className="mt-4 w-full min-w-0 max-w-full space-y-3">
                  {commentsLoading ? (
                    <li className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                      Loading comments…
                    </li>
                  ) : comments.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                      No comments yet. Be the first to add one below.
                    </li>
                  ) : (
                    comments.map((comment) => (
                      <li
                        key={comment.id}
                        className="flex w-full min-w-0 max-w-full gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900/80"
                      >
                        <AuthorAvatar name={comment.author.name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex w-full min-w-0 items-baseline justify-between gap-2">
                            <p className="min-w-0 truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                              {comment.author.name}
                            </p>
                            <time
                              dateTime={comment.createdAt}
                              className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400"
                            >
                              {formatAuDateTime(comment.createdAt)}
                            </time>
                          </div>
                          <p className="mt-1.5 break-words whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                            {comment.content}
                          </p>
                        </div>
                      </li>
                    ))
                  )}
                </ul>

                {canPostComment ? (
                  <form
                    onSubmit={handlePostComment}
                    className="mt-3 w-full min-w-0 max-w-full space-y-2"
                  >
                    <label
                      htmlFor={`comment-${activeTask.id}`}
                      className={labelClassName}
                    >
                      New comment
                    </label>
                    <textarea
                      id={`comment-${activeTask.id}`}
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                      rows={3}
                      disabled={commentSubmitting}
                      className={`${fieldClassName} resize-y disabled:opacity-60`}
                      placeholder="Write a comment…"
                    />
                    <InstantTooltipButton
                      type="submit"
                      disabled={
                        !commentDraft.trim() || commentSubmitting
                      }
                      tooltip="Please enter comment text first"
                      className={primaryButtonClassName}
                    >
                      {commentSubmitting ? "Posting…" : "Post comment"}
                    </InstantTooltipButton>
                  </form>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/70 dark:text-zinc-400">
                    Read-only access — you can view comments but cannot post new
                    ones on this project.
                  </p>
                )}
              </section>

              {canDeleteTask && onDeleteTask && activeTask ? (
                <section className={`${sectionClassName} mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800`}>
                  <h3 className={sectionTitleClassName}>Danger zone</h3>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Permanently remove this task, including its checklist and
                    comments.
                  </p>
                  <button
                    type="button"
                    onClick={() => setDeleteDialogOpen(true)}
                    disabled={isDeletePending}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70"
                  >
                    Delete task
                  </button>
                </section>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>

      <ConfirmDialog
        open={pendingFinish != null}
        title="Mark task as Done?"
        message="Entering an actual finish date will set Status to Done and Actual progress to 100%. Project and task punctuality scores will recalculate. Continue?"
        confirmLabel="Mark as Done"
        cancelLabel="Cancel"
        tone="primary"
        onCancel={() => {
          setPendingFinish(null);
          setLocalDateReset((n) => n + 1);
        }}
        onConfirm={() => {
          if (!pendingFinish) return;
          const finish = pendingFinish;
          setPendingFinish(null);
          patchTask({
            actualCompletionDate: finish,
            status: "done",
            progress: 100,
          });
          setProgressDraft("100");
          setSyncedProgress(100);
        }}
      />

      <ConfirmDialog
        open={deleteDialogOpen && activeTask !== null}
        title="Delete task?"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmLabel="Delete task"
        isPending={isDeletePending}
        onCancel={() => {
          if (!isDeletePending) setDeleteDialogOpen(false);
        }}
        onConfirm={() => {
          if (!activeTask || !onDeleteTask || isDeletePending) return;
          onDeleteTask(activeTask.id);
        }}
      />
    </div>
  );
}

