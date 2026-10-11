"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableProvided,
  type DraggableProvidedDragHandleProps,
  type DropResult,
} from "@hello-pangea/dnd";
import { GripVertical, PanelRight, Plus, Trash2, X } from "lucide-react";

import PunctualityScoreTip from "@/src/components/schedule/PunctualityScoreTip";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import ConfirmDialog from "@/src/components/ui/ConfirmDialog";
import DateField from "@/src/components/ui/DateField";
import TaskNameTip from "@/src/components/ui/TaskNameTip";
import {
  plannedWorkingDuration,
  toHolidaySet,
} from "@/src/lib/analytics/working-days";
import {
  formatPercent1,
  formatScore2,
  type TaskScheduleMetrics,
} from "@/src/lib/analytics/weighted-progress";
import {
  actualDateRangeError,
  addDaysToLocalDateString,
  isFutureLocalDate,
  toLocalDateString,
} from "@/src/lib/task-defaults";
import type { Task, TaskBucket, TaskStatus } from "@/src/lib/types";

export type TaskListCreateInput = {
  bucket: TaskBucket;
  listIndex: number;
  title: string;
  initialStartDate: string;
  initialDueDate: string;
};

export type TaskListViewProps = {
  tasks: Task[];
  metricsById?: ReadonlyMap<string, TaskScheduleMetrics>;
  holidayDateKeys?: readonly string[];
  readOnly?: boolean;
  canEditTask?: (task: Task) => boolean;
  canDeleteTask?: (task: Task) => boolean;
  onTaskChange?: (taskId: string, patch: Partial<Task>) => void;
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void;
  onReorderInList?: (
    groups: Array<{ bucket: TaskBucket; orderedTaskIds: string[] }>,
  ) => void;
  /** Persist a finished List draft row. */
  onCreateTask?: (
    input: TaskListCreateInput,
  ) => Promise<{ success: boolean; data?: Task; error?: string }>;
  onDeleteTask?: (taskId: string) => void | Promise<void>;
  onOpenDetails?: (task: Task) => void;
  /** Shown when a date edit is rejected (future actual, missing start, inverted range). */
  onValidationError?: (message: string) => void;
  /** Project-level punctuality score (0–100). Recalculates with `metricsById` / tasks. */
  projectPs?: number;
  /** Bump after cancelling a date confirm so uncontrolled inputs revert. */
  dateResetToken?: number;
};

type ListDraft = {
  localId: string;
  bucket: TaskBucket;
  listIndex: number;
  title: string;
  initialStartDate: string;
  initialDueDate: string;
  touched: boolean;
  saving: boolean;
  /** Order among drafts that share a list slot. Lower renders first. */
  seq: number;
};

const PROCESS_GROUP_ORDER: TaskBucket[] = [
  "initiating",
  "planning",
  "executing",
  "monitoring",
  "closing",
];

const PROCESS_GROUP_LABELS: Record<TaskBucket, string> = {
  initiating: "Initiating",
  planning: "Planning",
  executing: "Executing",
  monitoring: "Monitoring",
  closing: "Closing",
};

const PROCESS_GROUP_INDEX: Record<TaskBucket, number> = {
  initiating: 1,
  planning: 2,
  executing: 3,
  monitoring: 4,
  closing: 5,
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "Doing",
  done: "Done",
};

const COL_COUNT = 17;
const W_DRAG = "2.25rem";
const W_NO = "2.75rem";
const W_TASK = "16rem";
const LEFT_NO = W_DRAG;
const LEFT_TASK = "5rem";
const W_FREEZE = "21rem";
const FREEZE_COL_SPAN = 3;
const SCROLL_COL_SPAN = COL_COUNT - FREEZE_COL_SPAN;

const CELL =
  "box-border border-b border-zinc-200 px-1.5 py-1 align-middle dark:border-zinc-800";
const WD_CELL = `${CELL} text-center`;
const INPUT =
  "w-full min-w-[5.5rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-zinc-800 outline-none transition hover:border-zinc-300 focus:border-slate-400 focus:bg-white dark:text-zinc-100 dark:hover:border-zinc-600 dark:focus:border-slate-500 dark:focus:bg-zinc-950";
const READONLY =
  "px-1 py-0.5 text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300";
const WD_READONLY = `${READONLY} block text-center`;
const STICKY_CELL =
  "isolate bg-white group-hover:bg-zinc-50 [transform:translateZ(0)] dark:bg-zinc-950 dark:group-hover:bg-zinc-900";
const STICKY_HEAD =
  "isolate bg-zinc-50 [transform:translateZ(0)] dark:bg-zinc-900";
const STICKY_FREEZE_EDGE =
  "border-r-2 border-zinc-400 dark:border-zinc-500";

function subscribeNever() {
  return () => {};
}

function sortListTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.listSortOrder !== b.listSortOrder) {
      return a.listSortOrder - b.listSortOrder;
    }
    return a.title.localeCompare(b.title);
  });
}

function formatWd(
  start: string | null,
  end: string | null,
  holidays: ReturnType<typeof toHolidaySet>,
): string {
  if (!start || !end) return "—";
  return String(plannedWorkingDuration(start, end, holidays));
}

function newDraftId() {
  return `draft-${crypto.randomUUID()}`;
}

function draftDefaults(): Pick<
  ListDraft,
  "title" | "initialStartDate" | "initialDueDate" | "touched" | "saving"
> {
  const start = toLocalDateString();
  return {
    title: "",
    initialStartDate: start,
    initialDueDate: addDaysToLocalDateString(start, 7),
    touched: false,
    saving: false,
  };
}

function isDraftComplete(draft: ListDraft): boolean {
  return (
    draft.title.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(draft.initialStartDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(draft.initialDueDate) &&
    draft.initialDueDate >= draft.initialStartDate
  );
}

/**
 * Locally controlled date field. Parent state syncs only on blur so typing
 * day/month/year is never remounted or overwritten mid-edit.
 */
function ListDateInput({
  label,
  value,
  canEdit,
  max,
  min,
  disallowFuture,
  onCommit,
  validate,
  onReject,
  resetToken = 0,
}: {
  label: string;
  value: string | null;
  canEdit: boolean;
  max?: string;
  min?: string;
  disallowFuture?: boolean;
  onCommit: (next: string | null) => void | boolean | Promise<void | boolean>;
  validate?: (next: string | null) => string | null;
  onReject?: (message: string) => void;
  /** Bump to force the uncontrolled input back to `value` (e.g. after cancel). */
  resetToken?: number;
}) {
  const external = value ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);

  // Keep the DOM in sync when parent data changes, but never while focused.
  // Controlled `value` + type="date" clears the field mid-year in Chromium
  // (onChange emits "" for incomplete segments and React re-renders wipe typing).
  useEffect(() => {
    if (!focusedRef.current && inputRef.current) {
      inputRef.current.value = external;
    }
  }, [external]);

  // Cancelled confirms / rejected edits bump resetToken — force the field back.
  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.value = external;
    focusedRef.current = false;
    // Only when the parent asks for a reset — do not re-run on every external change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetToken is the intentional trigger
  }, [resetToken]);

  if (!canEdit) {
    return <span className={READONLY}>{value ?? "—"}</span>;
  }

  async function commit(raw: string) {
    const next = raw === "" ? null : raw;
    // A stored date, even a bad one, is not a new edit. Checking it on
    // focus loss stacks the same error for every field on the page.
    if ((next ?? "") === external) return;
    if (next !== null && !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
      if (inputRef.current) inputRef.current.value = external;
      return;
    }
    const message =
      validate?.(next) ??
      (disallowFuture && next && isFutureLocalDate(next)
        ? "This date cannot be in the future."
        : null);
    if (message) {
      if (inputRef.current) inputRef.current.value = external;
      onReject?.(message);
      return;
    }
    if ((next ?? "") === external) return;
    const accepted = await onCommit(next);
    if (accepted === false && inputRef.current) {
      inputRef.current.value = external;
    }
  }

  return (
    <DateField
      ref={inputRef}
      aria-label={label}
      className={INPUT}
      defaultValue={external}
      max={max}
      min={min}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        commit(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** Thickens the row's own bottom grid line — no extra row, no layout gap. */
const EDGE_HOT =
  "[&>td]:!border-b-[3px] [&>td]:!border-b-slate-400 dark:[&>td]:!border-b-slate-300";

function gridEdgeHot(
  event: { currentTarget: HTMLTableRowElement; clientY: number },
): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  const fromBottom = rect.bottom - event.clientY;
  return fromBottom <= 10 && fromBottom >= -1;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "a,button,input,select,textarea,label,[role='button'],[role='combobox']",
    ),
  );
}

/**
 * + sits on the existing bottom border inside the freeze rail only.
 * Do not use a wide absolute strip — that expands scrollWidth past the table.
 * Full-row edge clicks are handled on the <tr> while the edge is hot.
 */
function GridEdgeControl({
  hot,
  label,
  onInsert,
}: {
  hot: boolean;
  label: string;
  onInsert: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      tabIndex={hot ? 0 : -1}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onInsert();
      }}
      className={[
        "absolute bottom-0 left-1 z-[2] inline-flex size-5 items-center justify-center rounded-full border border-slate-400 bg-white text-slate-700 shadow-sm transition-opacity dark:border-slate-500 dark:bg-zinc-900 dark:text-slate-100",
        hot ? "opacity-100" : "pointer-events-none opacity-0",
      ].join(" ")}
    >
      <Plus className="size-3.5" aria-hidden />
    </button>
  );
}

function GroupHeader({
  label,
  stickyTop,
  onInsert,
}: {
  label: string;
  stickyTop: number;
  onInsert?: () => void;
}) {
  const [hot, setHot] = useState(false);
  return (
    <tr
      className={[
        "bg-zinc-100 dark:bg-zinc-800",
        hot ? EDGE_HOT : "",
      ].join(" ")}
      onMouseMove={
        onInsert
          ? (event) => {
              const next = gridEdgeHot(event);
              setHot((current) => (current === next ? current : next));
            }
          : undefined
      }
      onMouseLeave={onInsert ? () => setHot(false) : undefined}
      onClick={
        onInsert
          ? (event) => {
              if (!hot || isInteractiveTarget(event.target)) return;
              if (!gridEdgeHot(event)) return;
              onInsert();
            }
          : undefined
      }
    >
      <td
        colSpan={FREEZE_COL_SPAN}
        style={{
          top: stickyTop,
          left: 0,
          width: W_FREEZE,
          minWidth: W_FREEZE,
          maxWidth: W_FREEZE,
        }}
        className="sticky z-[28] isolate border-y border-zinc-300 bg-zinc-100 px-3 py-1.5 [transform:translateZ(0)] dark:border-zinc-700 dark:bg-zinc-800"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-200">
          {label}
        </span>
        {onInsert ? (
          <GridEdgeControl
            hot={hot}
            label={`Add row at start of ${label}`}
            onInsert={onInsert}
          />
        ) : null}
      </td>
      <td
        colSpan={SCROLL_COL_SPAN}
        style={{ top: stickyTop }}
        className="sticky z-[24] border-y border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
        aria-hidden
      />
    </tr>
  );
}

function TaskTableRow({
  className,
  provided,
  edgeEnabled,
  onEdgeInsert,
  children,
}: {
  className: string;
  provided?: DraggableProvided | null;
  edgeEnabled: boolean;
  onEdgeInsert?: () => void;
  children: (edgeHot: boolean) => ReactNode;
}) {
  const [hot, setHot] = useState(false);
  return (
    <tr
      ref={provided?.innerRef}
      {...provided?.draggableProps}
      onMouseMove={
        edgeEnabled
          ? (event) => {
              const next = gridEdgeHot(event);
              setHot((current) => (current === next ? current : next));
            }
          : undefined
      }
      onMouseLeave={edgeEnabled ? () => setHot(false) : undefined}
      onClick={
        edgeEnabled && onEdgeInsert
          ? (event) => {
              if (!hot || isInteractiveTarget(event.target)) return;
              if (!gridEdgeHot(event)) return;
              onEdgeInsert();
            }
          : undefined
      }
      className={[
        className,
        hot ? EDGE_HOT : "",
        hot ? "cursor-pointer" : "",
      ].join(" ")}
    >
      {children(edgeEnabled && hot)}
    </tr>
  );
}

function AddRow({
  onInsert,
  emphasize = false,
}: {
  onInsert: () => void;
  emphasize?: boolean;
}) {
  return (
    <tr className="bg-white dark:bg-zinc-950">
      <td
        colSpan={FREEZE_COL_SPAN}
        style={{
          left: 0,
          width: W_FREEZE,
          minWidth: W_FREEZE,
          maxWidth: W_FREEZE,
        }}
        className="sticky z-[20] isolate border-b border-dashed border-zinc-200 bg-white px-2 py-1 [transform:translateZ(0)] dark:border-zinc-700 dark:bg-zinc-950"
      >
        <button
          type="button"
          onClick={onInsert}
          className={[
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition",
            emphasize
              ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-200",
          ].join(" ")}
        >
          <Plus className="size-3" aria-hidden />
          Add row
        </button>
      </td>
      <td
        colSpan={SCROLL_COL_SPAN}
        className="border-b border-dashed border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950"
        aria-hidden
      />
    </tr>
  );
}

function ProgressCell({
  taskId,
  progress,
  updatedAt,
  canEdit,
  label,
  onTaskChange,
}: {
  taskId: string;
  progress: number;
  updatedAt: string;
  canEdit: boolean;
  label: string;
  onTaskChange?: TaskListViewProps["onTaskChange"];
}) {
  const [draft, setDraft] = useState(String(progress));

  useEffect(() => {
    setDraft(String(progress));
  }, [progress, updatedAt]);

  function commit(raw: string) {
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed)) {
      setDraft(String(progress));
      return;
    }
    const next = Math.max(0, Math.min(100, parsed));
    setDraft(String(next));
    if (next !== progress) {
      onTaskChange?.(taskId, { progress: next });
    }
  }

  if (!canEdit) {
    return <span className={READONLY}>{progress}</span>;
  }

  return (
    <input
      type="number"
      min={0}
      max={100}
      step={1}
      aria-label={label}
      className={`${INPUT} w-[4.25rem] tabular-nums`}
      value={draft}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        if (raw.trim() === "") return;
        const parsed = Math.round(Number(raw));
        if (!Number.isFinite(parsed)) return;
        const next = Math.max(0, Math.min(100, parsed));
        if (next !== progress) {
          onTaskChange?.(taskId, { progress: next });
        }
      }}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function DraftRow({
  draft,
  refNo,
  holidays,
  showFreezeEdge,
  onChange,
  onRequestCommit,
  onDiscard,
  insertEdge,
}: {
  draft: ListDraft;
  refNo: string;
  holidays: ReturnType<typeof toHolidaySet>;
  showFreezeEdge: boolean;
  onChange: (patch: Partial<ListDraft>) => void;
  onRequestCommit: () => void;
  onDiscard: () => void;
  insertEdge: { label: string; onInsert: () => void } | null;
}) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLTableRowElement>(null);
  const [edgeHot, setEdgeHot] = useState(false);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <tr
      ref={rootRef}
      data-draft-id={draft.localId}
      className={[
        "bg-sky-50/50 text-[11px] dark:bg-sky-950/30",
        edgeHot ? EDGE_HOT : "",
      ].join(" ")}
      onMouseMove={
        insertEdge
          ? (event) => {
              const next = gridEdgeHot(event);
              setEdgeHot((current) => (current === next ? current : next));
            }
          : undefined
      }
      onMouseLeave={insertEdge ? () => setEdgeHot(false) : undefined}
      onClick={
        insertEdge
          ? (event) => {
              if (!edgeHot || isInteractiveTarget(event.target)) return;
              if (!gridEdgeHot(event)) return;
              insertEdge.onInsert();
            }
          : undefined
      }
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && rootRef.current?.contains(next)) return;
        // Native date pickers blur without a relatedTarget; wait a tick.
        window.setTimeout(() => {
          if (rootRef.current?.contains(document.activeElement)) return;
          onRequestCommit();
        }, 120);
      }}
    >
      <td
        style={{ left: 0, width: W_DRAG, minWidth: W_DRAG, maxWidth: W_DRAG }}
        className={`${CELL} sticky z-[26] isolate bg-sky-50/80 [transform:translateZ(0)] dark:bg-sky-950/50`}
      >
        <button
          type="button"
          aria-label="Discard draft row"
          disabled={draft.saving}
          onClick={onDiscard}
          className="flex items-center justify-center p-0.5 text-zinc-400 transition hover:text-red-600 disabled:opacity-50"
        >
          <X className="size-3.5" aria-hidden />
        </button>
        {insertEdge ? (
          <GridEdgeControl
            hot={edgeHot}
            label={insertEdge.label}
            onInsert={insertEdge.onInsert}
          />
        ) : null}
      </td>
      <td
        style={{
          left: LEFT_NO,
          width: W_NO,
          minWidth: W_NO,
          maxWidth: W_NO,
        }}
        className={`${CELL} sticky z-[26] tabular-nums text-zinc-500 isolate bg-sky-50/80 [transform:translateZ(0)] dark:bg-sky-950/50`}
      >
        {refNo}
      </td>
      <td
        style={{
          left: LEFT_TASK,
          width: W_TASK,
          minWidth: W_TASK,
          maxWidth: W_TASK,
          boxShadow: showFreezeEdge
            ? "4px 0 0 0 var(--freeze-fill, #f0f9ff), 6px 0 10px -3px rgba(0,0,0,0.22)"
            : undefined,
        }}
        className={`${CELL} sticky z-[26] isolate bg-sky-50/80 [transform:translateZ(0)] dark:bg-sky-950/50 ${showFreezeEdge ? STICKY_FREEZE_EDGE : ""} [--freeze-fill:#f0f9ff] dark:[--freeze-fill:#082f49]`}
      >
        <textarea
          ref={titleRef}
          aria-label={`Title for ${refNo}`}
          rows={2}
          placeholder="Task title (required)"
          disabled={draft.saving}
          className={`${INPUT} min-h-[2.5rem] resize-y whitespace-pre-wrap break-words font-medium leading-snug text-zinc-900 dark:text-zinc-50`}
          value={draft.title}
          onChange={(event) =>
            onChange({ title: event.target.value, touched: true })
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onRequestCommit();
            }
          }}
        />
        <p className="px-1 text-[10px] text-sky-800 dark:text-sky-200">
          {draft.saving ? "Saving…" : "Draft — title & initial dates required"}
        </p>
      </td>
      <td className={CELL}>
        <span className={READONLY}>To Do</span>
      </td>
      <td className={CELL}>
        <span className={READONLY}>0</span>
      </td>
      <td className={CELL}>
        <span className={READONLY}>—</span>
      </td>
      <td className={CELL}>
        <ListDateInput
          label={`Initial start for ${refNo}`}
          value={draft.initialStartDate || null}
          canEdit={!draft.saving}
          onCommit={(next) =>
            onChange({
              initialStartDate: next ?? "",
              touched: true,
            })
          }
        />
      </td>
      <td className={CELL}>
        <ListDateInput
          label={`Initial due for ${refNo}`}
          value={draft.initialDueDate || null}
          canEdit={!draft.saving}
          onCommit={(next) =>
            onChange({
              initialDueDate: next ?? "",
              touched: true,
            })
          }
        />
      </td>
      <td className={WD_CELL}>
        <span className={WD_READONLY}>
          {formatWd(
            draft.initialStartDate || null,
            draft.initialDueDate || null,
            holidays,
          )}
        </span>
      </td>
      {Array.from({ length: 8 }).map((_, index) => (
        <td key={index} className={CELL}>
          <span className={READONLY}>—</span>
        </td>
      ))}
    </tr>
  );
}

type RowCellsProps = {
  task: Task;
  refNo: string;
  metrics: TaskScheduleMetrics | undefined;
  canEdit: boolean;
  canDelete: boolean;
  holidays: ReturnType<typeof toHolidaySet>;
  showDragHandle: boolean;
  showFreezeEdge: boolean;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  onTaskChange?: TaskListViewProps["onTaskChange"];
  onStatusChange?: TaskListViewProps["onStatusChange"];
  onOpenDetails?: TaskListViewProps["onOpenDetails"];
  onRequestDelete?: () => void;
  onValidationError?: (message: string) => void;
  dateResetToken?: number;
  insertEdge?: { hot: boolean; label: string; onInsert: () => void } | null;
};

function RowCells({
  task,
  refNo,
  metrics,
  canEdit,
  canDelete,
  holidays,
  showDragHandle,
  showFreezeEdge,
  dragHandleProps,
  onTaskChange,
  onStatusChange,
  onOpenDetails,
  onRequestDelete,
  onValidationError,
  dateResetToken = 0,
  insertEdge,
}: RowCellsProps) {
  return (
    <>
      <td
        style={{ left: 0, width: W_DRAG, minWidth: W_DRAG, maxWidth: W_DRAG }}
        className={`${CELL} sticky z-[26] ${STICKY_CELL}`}
      >
        {insertEdge ? (
          <GridEdgeControl
            hot={insertEdge.hot}
            label={insertEdge.label}
            onInsert={insertEdge.onInsert}
          />
        ) : null}
        <div className="flex flex-col items-center gap-0.5">
          {showDragHandle ? (
            <span
              className="flex cursor-grab items-center justify-center p-0.5 text-zinc-400 active:cursor-grabbing"
              {...dragHandleProps}
            >
              <GripVertical className="size-3.5" aria-hidden />
            </span>
          ) : (
            <span className="block w-3.5" />
          )}
          {canDelete && onRequestDelete ? (
            <button
              type="button"
              aria-label={`Delete ${task.title}`}
              title="Delete task"
              onClick={onRequestDelete}
              className="rounded p-0.5 text-zinc-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:text-zinc-600 dark:hover:bg-red-950/40 dark:hover:text-red-300"
            >
              <Trash2 className="size-3" aria-hidden />
            </button>
          ) : null}
        </div>
      </td>
      <td
        style={{
          left: LEFT_NO,
          width: W_NO,
          minWidth: W_NO,
          maxWidth: W_NO,
        }}
        className={`${CELL} sticky z-[26] tabular-nums text-zinc-500 ${STICKY_CELL}`}
      >
        {refNo}
      </td>
      <td
        style={{
          left: LEFT_TASK,
          width: W_TASK,
          minWidth: W_TASK,
          maxWidth: W_TASK,
          boxShadow: showFreezeEdge
            ? "4px 0 0 0 var(--freeze-fill, #fff), 6px 0 10px -3px rgba(0,0,0,0.22)"
            : undefined,
        }}
        className={`${CELL} sticky z-[26] ${STICKY_CELL} ${showFreezeEdge ? STICKY_FREEZE_EDGE : ""} [--freeze-fill:#fff] dark:[--freeze-fill:#09090b]`}
      >
        <div className="flex items-start gap-1 py-0.5">
          <div className="min-w-0 flex-1">
            {canEdit ? (
              <TaskNameTip name={task.title} hoverOnly>
                <textarea
                  aria-label={`Title for ${refNo}`}
                  rows={2}
                  className={`${INPUT} min-h-[2.5rem] resize-y whitespace-pre-wrap break-words font-medium leading-snug text-zinc-900 dark:text-zinc-50`}
                  defaultValue={task.title}
                  key={`title-${task.id}-${task.updatedAt}`}
                  onBlur={(event) => {
                    const next = event.target.value.trim().replace(/\s+/g, " ");
                    if (next && next !== task.title) {
                      onTaskChange?.(task.id, { title: next });
                    } else {
                      event.target.value = task.title;
                    }
                  }}
                />
              </TaskNameTip>
            ) : onOpenDetails ? (
              <TaskNameTip name={task.title}>
                <button
                  type="button"
                  onClick={() => onOpenDetails(task)}
                  className="block w-full whitespace-normal break-words rounded px-1 text-left font-medium leading-snug text-zinc-900 hover:underline dark:text-zinc-50"
                >
                  {task.title}
                </button>
              </TaskNameTip>
            ) : (
              <TaskNameTip name={task.title}>
                <span className="block whitespace-normal break-words px-1 font-medium leading-snug text-zinc-900 dark:text-zinc-50">
                  {task.title}
                </span>
              </TaskNameTip>
            )}
          </div>
          {onOpenDetails ? (
            <button
              type="button"
              aria-label={`Open details for ${task.title}`}
              title="Open task details"
              onClick={() => onOpenDetails(task)}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <PanelRight className="size-3" aria-hidden />
              Details
            </button>
          ) : null}
        </div>
      </td>
      <td className={`${CELL} relative z-0`}>
        <select
          aria-label={`Status for ${task.title}`}
          value={task.status}
          disabled={!canEdit || !onStatusChange}
          onChange={(event) =>
            onStatusChange?.(task.id, event.target.value as TaskStatus)
          }
          className={`${INPUT} min-w-[5rem] font-semibold`}
        >
          {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </td>
      <td className={`${CELL} relative z-0`}>
        <ProgressCell
          taskId={task.id}
          progress={task.progress}
          updatedAt={task.updatedAt}
          canEdit={canEdit}
          label={`Actual progress for ${task.title}`}
          onTaskChange={onTaskChange}
        />
      </td>
      <td className={`${CELL} relative z-0`}>
        <span className={READONLY}>
          {metrics ? formatPercent1(metrics.pTarget) : "—"}
        </span>
      </td>
      {(
        [
          ["initialStartDate", "Initial start"],
          ["initialDueDate", "Initial due"],
        ] as const
      ).map(([field, label]) => (
        <td key={field} className={`${CELL} relative z-0`}>
          <ListDateInput
            label={`${label} for ${task.title}`}
            value={task[field]}
            canEdit={canEdit}
            onCommit={(next) => onTaskChange?.(task.id, { [field]: next })}
          />
        </td>
      ))}
      <td className={WD_CELL}>
        <span className={WD_READONLY}>
          {formatWd(task.initialStartDate, task.initialDueDate, holidays)}
        </span>
      </td>
      {(
        [
          ["updatedStartDate", "Updated start"],
          ["updatedDueDate", "Updated due"],
        ] as const
      ).map(([field, label]) => (
        <td key={field} className={`${CELL} relative z-0`}>
          <ListDateInput
            label={`${label} for ${task.title}`}
            value={task[field]}
            canEdit={canEdit}
            resetToken={dateResetToken}
            onCommit={(next) => onTaskChange?.(task.id, { [field]: next })}
          />
        </td>
      ))}
      <td className={WD_CELL}>
        <span className={WD_READONLY}>
          {formatWd(task.updatedStartDate, task.updatedDueDate, holidays)}
        </span>
      </td>
      {(
        [
          ["actualStartDate", "Actual start"],
          ["actualCompletionDate", "Actual finish"],
        ] as const
      ).map(([field, label]) => (
        <td key={field} className={`${CELL} relative z-0`}>
          <ListDateInput
            label={`${label} for ${task.title}`}
            value={task[field]}
            canEdit={canEdit}
            max={toLocalDateString()}
            min={
              field === "actualCompletionDate"
                ? (task.actualStartDate ?? undefined)
                : undefined
            }
            disallowFuture
            resetToken={dateResetToken}
            validate={(next) =>
              actualDateRangeError(
                field === "actualStartDate" ? next : task.actualStartDate,
                field === "actualCompletionDate"
                  ? next
                  : task.actualCompletionDate,
              )
            }
            onReject={onValidationError}
            onCommit={(next) => onTaskChange?.(task.id, { [field]: next })}
          />
        </td>
      ))}
      <td className={WD_CELL}>
        <span className={WD_READONLY}>
          {formatWd(task.actualStartDate, task.actualCompletionDate, holidays)}
        </span>
      </td>
      <td className={CELL}>
        <span className={READONLY}>
          {metrics
            ? metrics.statusFlag === "SF-01"
              ? ""
              : formatScore2(metrics.ps)
            : "—"}
        </span>
      </td>
      <td className={CELL}>
        {metrics ? (
          <StatusFlagBadge flag={metrics.statusFlag} />
        ) : (
          <span className={READONLY}>—</span>
        )}
      </td>
    </>
  );
}

export default function TaskListView({
  tasks,
  metricsById,
  holidayDateKeys = [],
  readOnly = false,
  canEditTask,
  canDeleteTask,
  onTaskChange,
  onStatusChange,
  onReorderInList,
  onCreateTask,
  onDeleteTask,
  onOpenDetails,
  onValidationError,
  projectPs,
  dateResetToken = 0,
}: TaskListViewProps) {
  const isReady = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const [scrolledX, setScrolledX] = useState(false);
  const [headHeight, setHeadHeight] = useState(32);
  const [drafts, setDrafts] = useState<ListDraft[]>([]);
  const [pendingDiscardId, setPendingDiscardId] = useState<string | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    function onScroll() {
      setScrolledX(root!.scrollLeft > 0);
    }
    onScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [isReady, tasks.length, drafts.length]);

  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const measure = () => {
      setHeadHeight(Math.ceil(head.getBoundingClientRect().height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(head);
    return () => ro.disconnect();
  }, [isReady, tasks.length, drafts.length]);

  const holidays = useMemo(
    () => toHolidaySet(holidayDateKeys),
    [holidayDateKeys],
  );

  const groups = useMemo(() => {
    const map = new Map<TaskBucket, Task[]>();
    for (const bucket of PROCESS_GROUP_ORDER) {
      map.set(bucket, []);
    }
    for (const task of tasks) {
      const list = map.get(task.bucket) ?? [];
      list.push(task);
      map.set(task.bucket, list);
    }
    return PROCESS_GROUP_ORDER.map((bucket) => ({
      bucket,
      label: PROCESS_GROUP_LABELS[bucket],
      tasks: sortListTasks(map.get(bucket) ?? []),
    }));
  }, [tasks]);

  const enableDnd = Boolean(isReady && !readOnly && onReorderInList);
  const canCreate = Boolean(!readOnly && onCreateTask);
  const projectEmpty = tasks.length === 0 && drafts.length === 0;

  function editable(task: Task): boolean {
    if (readOnly || !onTaskChange) return false;
    return canEditTask ? canEditTask(task) : true;
  }

  function startDraft(
    bucket: TaskBucket,
    listIndex: number,
    afterSeq?: number,
  ) {
    if (!canCreate) return;
    setDrafts((current) => {
      const siblings = current.filter(
        (draft) => draft.bucket === bucket && draft.listIndex === listIndex,
      );
      let seq = 0;
      if (afterSeq == null) {
        seq = siblings.length
          ? Math.min(...siblings.map((draft) => draft.seq)) - 1
          : 0;
      } else {
        const later = siblings
          .map((draft) => draft.seq)
          .filter((value) => value > afterSeq);
        seq = later.length
          ? (afterSeq + Math.min(...later)) / 2
          : afterSeq + 1;
      }
      const draft: ListDraft = {
        localId: newDraftId(),
        bucket,
        listIndex,
        seq,
        ...draftDefaults(),
      };
      return [...current, draft];
    });
  }

  function patchDraft(localId: string, patch: Partial<ListDraft>) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.localId === localId ? { ...draft, ...patch } : draft,
      ),
    );
  }

  function removeDraft(localId: string) {
    setDrafts((current) => current.filter((draft) => draft.localId !== localId));
    if (pendingDiscardId === localId) setPendingDiscardId(null);
  }

  async function commitDraft(localId: string) {
    const draft = drafts.find((item) => item.localId === localId);
    if (!draft || !onCreateTask || draft.saving) return;

    if (!isDraftComplete(draft)) {
      if (!draft.touched) {
        removeDraft(localId);
        return;
      }
      setPendingDiscardId(localId);
      return;
    }

    patchDraft(localId, { saving: true });
    const result = await onCreateTask({
      bucket: draft.bucket,
      listIndex: draft.listIndex,
      title: draft.title.trim(),
      initialStartDate: draft.initialStartDate,
      initialDueDate: draft.initialDueDate,
    });
    if (!result.success) {
      patchDraft(localId, { saving: false });
      return;
    }
    removeDraft(localId);
  }

  function handleDragEnd(result: DropResult) {
    if (!onReorderInList || !result.destination) return;
    const sourceBucket = result.source.droppableId as TaskBucket;
    const destBucket = result.destination.droppableId as TaskBucket;
    if (!PROCESS_GROUP_INDEX[sourceBucket] || !PROCESS_GROUP_INDEX[destBucket]) {
      return;
    }

    const sourceTasks = sortListTasks(
      tasks.filter((task) => task.bucket === sourceBucket),
    );
    const destTasks =
      sourceBucket === destBucket
        ? sourceTasks
        : sortListTasks(tasks.filter((task) => task.bucket === destBucket));

    const [moved] = sourceTasks.splice(result.source.index, 1);
    if (!moved) return;

    if (sourceBucket === destBucket) {
      sourceTasks.splice(result.destination.index, 0, moved);
      onReorderInList([
        {
          bucket: sourceBucket,
          orderedTaskIds: sourceTasks.map((task) => task.id),
        },
      ]);
      return;
    }

    destTasks.splice(result.destination.index, 0, moved);
    onReorderInList([
      {
        bucket: sourceBucket,
        orderedTaskIds: sourceTasks.map((task) => task.id),
      },
      {
        bucket: destBucket,
        orderedTaskIds: destTasks.map((task) => task.id),
      },
    ]);
  }

  if (!isReady) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
        Loading task table…
      </div>
    );
  }

  const pendingDiscard = drafts.find((d) => d.localId === pendingDiscardId);

  const table = (
    <div className="space-y-2">
      {projectPs != null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">
            Project punctuality score
          </span>
          <PunctualityScoreTip className="cursor-help rounded-sm tabular-nums text-base font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-zinc-50">
            {formatScore2(projectPs)}
          </PunctualityScoreTip>
        </div>
      ) : null}
      {projectEmpty && canCreate ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300">
          No tasks yet. Use <span className="font-medium">Add row</span> under a
          process group, or hover a grid line to insert. A draft appears
          immediately — add a title and initial dates, then leave the row to
          save.
        </p>
      ) : null}
      <div
        ref={scrollRef}
        className="max-h-[min(70vh,calc(100dvh-11rem))] overflow-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
      >
        <table className="min-w-[88rem] w-full border-separate border-spacing-0 text-left">
          <thead ref={headRef} className="sticky top-0 z-30">
            <tr
              className={`text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 ${STICKY_HEAD}`}
            >
              <th
                style={{
                  left: 0,
                  width: W_DRAG,
                  minWidth: W_DRAG,
                  maxWidth: W_DRAG,
                }}
                className={`${CELL} sticky z-40 ${STICKY_HEAD}`}
                aria-label="Drag"
              />
              <th
                style={{
                  left: LEFT_NO,
                  width: W_NO,
                  minWidth: W_NO,
                  maxWidth: W_NO,
                }}
                className={`${CELL} sticky z-40 ${STICKY_HEAD}`}
              >
                No.
              </th>
              <th
                style={{
                  left: LEFT_TASK,
                  width: W_TASK,
                  minWidth: W_TASK,
                  maxWidth: W_TASK,
                  boxShadow: scrolledX
                    ? "4px 0 0 0 var(--freeze-fill, #fafafa), 6px 0 10px -3px rgba(0,0,0,0.22)"
                    : undefined,
                }}
                className={`${CELL} sticky z-40 ${STICKY_HEAD} ${scrolledX ? STICKY_FREEZE_EDGE : ""} [--freeze-fill:#fafafa] dark:[--freeze-fill:#18181b]`}
              >
                Task
              </th>
              <th className={`${CELL} min-w-[6.5rem] ${STICKY_HEAD}`}>Status</th>
              <th className={`${CELL} min-w-[4.5rem] ${STICKY_HEAD}`}>Actual %</th>
              <th className={`${CELL} min-w-[4.5rem] ${STICKY_HEAD}`}>Target %</th>
              <th className={`${CELL} min-w-[7rem] ${STICKY_HEAD}`}>
                Initial start
              </th>
              <th className={`${CELL} min-w-[7rem] ${STICKY_HEAD}`}>
                Initial due
              </th>
              <th className={`${WD_CELL} min-w-[4rem] ${STICKY_HEAD}`}>
                Initial WD
              </th>
              <th className={`${CELL} min-w-[7rem] ${STICKY_HEAD}`}>
                Updated start
              </th>
              <th className={`${CELL} min-w-[7rem] ${STICKY_HEAD}`}>
                Updated due
              </th>
              <th className={`${WD_CELL} min-w-[4rem] ${STICKY_HEAD}`}>
                Updated WD
              </th>
              <th className={`${CELL} min-w-[7rem] ${STICKY_HEAD}`}>
                Actual start
              </th>
              <th className={`${CELL} min-w-[7rem] ${STICKY_HEAD}`}>
                Actual finish
              </th>
              <th className={`${WD_CELL} min-w-[4rem] ${STICKY_HEAD}`}>
                Actual WD
              </th>
              <th className={`${CELL} min-w-[3.5rem] ${STICKY_HEAD}`}>
                <PunctualityScoreTip className="inline-flex cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                  PS
                </PunctualityScoreTip>
              </th>
              <th className={`${CELL} min-w-[8rem] ${STICKY_HEAD}`}>
                Status flag
              </th>
            </tr>
          </thead>
          {groups.map((group) => {
            const groupDrafts = drafts
              .filter((draft) => draft.bucket === group.bucket)
              .sort((a, b) => {
                if (a.listIndex !== b.listIndex) {
                  return a.listIndex - b.listIndex;
                }
                return (a.seq ?? 0) - (b.seq ?? 0);
              });

            type VisualItem =
              | { kind: "task"; task: Task; dragIndex: number }
              | { kind: "draft"; draft: ListDraft };

            const visual: VisualItem[] = [];
            let dragIndex = 0;
            for (let i = 0; i <= group.tasks.length; i += 1) {
              for (const draft of groupDrafts.filter((d) => d.listIndex === i)) {
                visual.push({ kind: "draft", draft });
              }
              const task = group.tasks[i];
              if (task) {
                visual.push({ kind: "task", task, dragIndex });
                dragIndex += 1;
              }
            }

            const rows: ReactNode[] = [];
            let displayNo = 0;

            visual.forEach((item) => {
              displayNo += 1;
              const refNo = `${PROCESS_GROUP_INDEX[group.bucket]}.${displayNo}`;

              if (item.kind === "draft") {
                rows.push(
                  <DraftRow
                    key={item.draft.localId}
                    draft={item.draft}
                    refNo={refNo}
                    holidays={holidays}
                    showFreezeEdge={scrolledX}
                    onChange={(patch) => patchDraft(item.draft.localId, patch)}
                    onRequestCommit={() => {
                      void commitDraft(item.draft.localId);
                    }}
                    onDiscard={() => {
                      if (!item.draft.touched) {
                        removeDraft(item.draft.localId);
                        return;
                      }
                      setPendingDiscardId(item.draft.localId);
                    }}
                    insertEdge={
                      canCreate
                        ? {
                            label: `Add row after ${refNo}`,
                            onInsert: () =>
                              startDraft(
                                group.bucket,
                                item.draft.listIndex,
                                item.draft.seq,
                              ),
                          }
                        : null
                    }
                  />,
                );
              } else {
                const { task } = item;
                const canEdit = editable(task);
                const canDelete = Boolean(
                  onDeleteTask &&
                    (canDeleteTask ? canDeleteTask(task) : canEdit),
                );
                const cells = (
                  dragHandleProps: DraggableProvidedDragHandleProps | null,
                  edgeHot: boolean,
                ) => (
                  <RowCells
                    task={task}
                    refNo={refNo}
                    metrics={metricsById?.get(task.id)}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    holidays={holidays}
                    showDragHandle={enableDnd && canEdit}
                    showFreezeEdge={scrolledX}
                    dragHandleProps={dragHandleProps}
                    onTaskChange={onTaskChange}
                    onStatusChange={onStatusChange}
                    onOpenDetails={onOpenDetails}
                    onValidationError={onValidationError}
                    dateResetToken={dateResetToken}
                    onRequestDelete={
                      canDelete
                        ? () => setPendingDeleteTask(task)
                        : undefined
                    }
                    insertEdge={
                      canCreate
                        ? {
                            hot: edgeHot,
                            label: `Add row after ${refNo}`,
                            onInsert: () =>
                              startDraft(group.bucket, item.dragIndex + 1),
                          }
                        : null
                    }
                  />
                );

                const rowClass = "group text-[11px]";

                const edgeInsert = canCreate
                  ? () => startDraft(group.bucket, item.dragIndex + 1)
                  : undefined;

                if (!enableDnd) {
                  rows.push(
                    <TaskTableRow
                      key={task.id}
                      className={`${rowClass} hover:bg-zinc-50 dark:hover:bg-zinc-900`}
                      edgeEnabled={canCreate}
                      onEdgeInsert={edgeInsert}
                    >
                      {(edgeHot) => cells(null, edgeHot)}
                    </TaskTableRow>,
                  );
                } else {
                  rows.push(
                    <Draggable
                      key={task.id}
                      draggableId={task.id}
                      index={item.dragIndex}
                      isDragDisabled={!canEdit}
                    >
                      {(dragProvided, dragSnapshot) => (
                        <TaskTableRow
                          className={[
                            rowClass,
                            dragSnapshot.isDragging
                              ? "bg-white shadow-md dark:bg-zinc-900"
                              : "hover:bg-zinc-50 dark:hover:bg-zinc-900",
                          ].join(" ")}
                          provided={dragProvided}
                          edgeEnabled={canCreate}
                          onEdgeInsert={edgeInsert}
                        >
                          {(edgeHot) =>
                            cells(dragProvided.dragHandleProps, edgeHot)
                          }
                        </TaskTableRow>
                      )}
                    </Draggable>,
                  );
                }
              }
            });

            const body = (
              <>
                <GroupHeader
                  label={group.label}
                  stickyTop={headHeight}
                  onInsert={
                    canCreate
                      ? () => startDraft(group.bucket, 0)
                      : undefined
                  }
                />
                {rows}
                {canCreate ? (
                  <AddRow
                    emphasize={projectEmpty}
                    onInsert={() =>
                      startDraft(group.bucket, group.tasks.length)
                    }
                  />
                ) : null}
              </>
            );

            if (!enableDnd) {
              return <tbody key={group.bucket}>{body}</tbody>;
            }

            return (
              <Droppable droppableId={group.bucket} key={group.bucket}>
                {(provided, snapshot) => (
                  <tbody
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={
                      snapshot.isDraggingOver
                        ? "bg-sky-50/40 dark:bg-sky-950/20"
                        : undefined
                    }
                  >
                    {body}
                    {provided.placeholder}
                  </tbody>
                )}
              </Droppable>
            );
          })}
        </table>
      </div>

      <ConfirmDialog
        open={pendingDiscardId != null}
        title="Finish this row?"
        message="A new task needs a title, initial start date, and initial due date. Continue editing, or discard this row?"
        confirmLabel="Discard row"
        cancelLabel="Continue editing"
        onCancel={() => setPendingDiscardId(null)}
        onConfirm={() => {
          if (pendingDiscard) removeDraft(pendingDiscard.localId);
          else setPendingDiscardId(null);
        }}
      />

      <ConfirmDialog
        open={pendingDeleteTask != null}
        title="Delete task?"
        message={
          pendingDeleteTask
            ? `Permanently delete “${pendingDeleteTask.title}”, including its checklist and comments? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete task"
        cancelLabel="Cancel"
        isPending={isDeleting}
        onCancel={() => {
          if (!isDeleting) setPendingDeleteTask(null);
        }}
        onConfirm={() => {
          if (!pendingDeleteTask || !onDeleteTask || isDeleting) return;
          setIsDeleting(true);
          void Promise.resolve(onDeleteTask(pendingDeleteTask.id)).finally(
            () => {
              setIsDeleting(false);
              setPendingDeleteTask(null);
            },
          );
        }}
      />
    </div>
  );

  if (!enableDnd) return table;
  return <DragDropContext onDragEnd={handleDragEnd}>{table}</DragDropContext>;
}
