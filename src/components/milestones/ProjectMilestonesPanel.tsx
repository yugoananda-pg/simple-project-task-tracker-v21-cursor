"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import ConfirmDialog from "@/src/components/ui/ConfirmDialog";
import DateField from "@/src/components/ui/DateField";
import {
  createMilestone,
  deleteMilestone,
  updateMilestone,
} from "@/src/lib/actions/milestones";
import { isFutureLocalDate } from "@/src/lib/task-defaults";
import type { Milestone } from "@/src/lib/types";

type ProjectMilestonesPanelProps = {
  projectId: string;
  initialMilestones: Milestone[];
  canManage: boolean;
  onChange: (milestones: Milestone[]) => void;
};

type EditorMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; milestone: Milestone }
  | { kind: "list" };

/** Two rows of chips. Further gates stay behind View all. */
const CHIP_MAX_ROWS = 2;

function formatAu(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function todayIso(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function sortByTarget(rows: Milestone[]): Milestone[] {
  return [...rows].sort((a, b) =>
    a.updatedTarget.localeCompare(b.updatedTarget),
  );
}

export default function ProjectMilestonesPanel({
  projectId,
  initialMilestones,
  canManage,
  onChange,
}: ProjectMilestonesPanelProps) {
  const [milestones, setMilestones] = useState(() =>
    sortByTarget(initialMilestones),
  );
  const [editor, setEditor] = useState<EditorMode>({ kind: "closed" });
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [description, setDescription] = useState("");
  const [actualAchieved, setActualAchieved] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const chipListRef = useRef<HTMLUListElement>(null);
  const [visibleCount, setVisibleCount] = useState(initialMilestones.length);
  const [measuredKey, setMeasuredKey] = useState("");

  useEffect(() => {
    setMilestones(sortByTarget(initialMilestones));
  }, [initialMilestones]);

  const pending = useMemo(
    () => milestones.filter((row) => !row.actualAchieved),
    [milestones],
  );
  const nextPending = pending[0] ?? null;
  const milestoneKey = milestones.map((row) => row.id).join("|");
  const showingAll = measuredKey !== milestoneKey;
  const visibleChips = showingAll
    ? milestones
    : milestones.slice(0, visibleCount);
  const hiddenCount = Math.max(0, milestones.length - visibleChips.length);

  useLayoutEffect(() => {
    const list = chipListRef.current;
    if (!list || milestones.length === 0) {
      setVisibleCount(milestones.length);
      setMeasuredKey(milestoneKey);
      return;
    }
    if (measuredKey === milestoneKey) return;

    const chips = [
      ...list.querySelectorAll<HTMLElement>("[data-milestone-chip]"),
    ];
    if (chips.length === 0) return;

    const gap = 6;
    const rowHeight = chips[0]!.offsetHeight;
    const firstTop = chips[0]!.offsetTop;
    const limitBottom =
      firstTop + CHIP_MAX_ROWS * rowHeight + (CHIP_MAX_ROWS - 1) * gap;
    const moreWidth = 118;

    let fit = chips.length;
    for (let index = 0; index < chips.length; index += 1) {
      const chip = chips[index]!;
      if (chip.offsetTop + chip.offsetHeight > limitBottom + 1) {
        fit = index;
        break;
      }
    }

    if (fit < chips.length) {
      const width = list.clientWidth;
      while (fit > 0) {
        const last = chips[fit - 1]!;
        const rowEnd = last.offsetLeft + last.offsetWidth;
        if (rowEnd + gap + moreWidth <= width + 1) break;
        fit -= 1;
      }
    }

    setVisibleCount(fit);
    setMeasuredKey(milestoneKey);
  }, [milestoneKey, measuredKey, milestones]);

  useEffect(() => {
    const list = chipListRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    let lastWidth = list.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = list.clientWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      setMeasuredKey("");
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const summary =
    milestones.length === 0
      ? "No stage gates yet"
      : nextPending
        ? `Next ${formatAu(nextPending.updatedTarget)} · ${nextPending.name}`
        : "All achieved";

  function sync(next: Milestone[]) {
    const sorted = sortByTarget(next);
    setMilestones(sorted);
    onChange(sorted);
  }

  function closeEditor() {
    if (isPending) return;
    setEditor({ kind: "closed" });
    setError(null);
  }

  function openCreate() {
    setName("");
    setTarget("");
    setDescription("");
    setActualAchieved("");
    setError(null);
    setEditor({ kind: "create" });
  }

  function openEdit(milestone: Milestone) {
    setName(milestone.name);
    setTarget(milestone.updatedTarget);
    setDescription(milestone.description ?? "");
    setActualAchieved(milestone.actualAchieved ?? "");
    setError(null);
    setEditor({ kind: "edit", milestone });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (editor.kind === "create") {
      startTransition(async () => {
        const result = await createMilestone({
          projectId,
          name,
          description,
          initialTarget: target,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        sync([...milestones, result.data]);
        setEditor({ kind: "closed" });
        setError(null);
      });
      return;
    }

    if (editor.kind === "edit") {
      const milestone = editor.milestone;
      if (actualAchieved.trim() && isFutureLocalDate(actualAchieved)) {
        setError("Achieved date cannot be in the future.");
        return;
      }
      startTransition(async () => {
        const result = await updateMilestone({
          id: milestone.id,
          name,
          description,
          updatedTarget: target,
          actualAchieved: actualAchieved.trim() ? actualAchieved : null,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        sync(
          milestones.map((row) =>
            row.id === milestone.id ? result.data : row,
          ),
        );
        setEditor({ kind: "closed" });
        setError(null);
      });
    }
  }

  function confirmDelete() {
    if (!deleteId) return;
    startTransition(async () => {
      const result = await deleteMilestone(deleteId);
      if (!result.success) {
        setError(result.error);
        setDeleteId(null);
        return;
      }
      sync(milestones.filter((row) => row.id !== deleteId));
      setDeleteId(null);
      setEditor({ kind: "closed" });
      setError(null);
    });
  }

  const formOpen = editor.kind === "create" || editor.kind === "edit";
  const editing =
    editor.kind === "edit" ? editor.milestone : null;
  const readOnlyDetail = formOpen && !canManage && editor.kind === "edit";

  return (
    <section className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
              Milestones
            </h2>
            <span className="text-[11px] text-zinc-500">
              {milestones.length}
            </span>
            <span className="truncate text-[11px] text-zinc-500">
              {summary}
            </span>
          </div>

          {milestones.length > 0 ? (
            <ul ref={chipListRef} className="mt-1.5 flex flex-wrap gap-1.5">
              {visibleChips.map((milestone) => {
                const achieved = Boolean(milestone.actualAchieved);
                return (
                  <li key={milestone.id} data-milestone-chip="">
                    <button
                      type="button"
                      onClick={() => openEdit(milestone)}
                      className={[
                        "rounded-md border px-2 py-1 text-left text-[11px] transition",
                        achieved
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100 dark:hover:bg-emerald-950"
                          : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800",
                      ].join(" ")}
                    >
                      <span className="font-medium">{milestone.name}</span>
                      <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">
                        {formatAu(
                          achieved
                            ? milestone.actualAchieved!
                            : milestone.updatedTarget,
                        )}
                        {achieved ? " ✓" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
              {hiddenCount > 0 && !showingAll ? (
                <li data-milestone-more="">
                  <button
                    type="button"
                    onClick={() => setEditor({ kind: "list" })}
                    className="rounded-md border border-dashed border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    View all ({milestones.length})
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={openCreate}
            className="shrink-0 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            + Add
          </button>
        ) : null}
      </div>

      {editor.kind === "list" ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/60 px-4"
          role="presentation"
          onClick={closeEditor}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="milestone-list-title"
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3
                id="milestone-list-title"
                className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
              >
                All milestones
              </h3>
              <button
                type="button"
                onClick={closeEditor}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                Close
              </button>
            </div>
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
              {milestones.map((milestone) => (
                <li key={milestone.id}>
                  <button
                    type="button"
                    onClick={() => openEdit(milestone)}
                    className="flex w-full items-start justify-between gap-3 px-1 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {milestone.name}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        Target {formatAu(milestone.updatedTarget)}
                        {milestone.actualAchieved
                          ? ` · Achieved ${formatAu(milestone.actualAchieved)}`
                          : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-zinc-500">
                      {canManage ? "Edit" : "View"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/60 px-4"
          role="presentation"
          onClick={closeEditor}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="milestone-editor-title"
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="milestone-editor-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {editor.kind === "create"
                ? "Add milestone"
                : canManage
                  ? "Edit milestone"
                  : "Milestone"}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Stage gates appear as vertical markers on the project Gantt.
            </p>

            <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={isPending || readOnlyDetail}
                  required
                  maxLength={120}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                />
              </label>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Target date
                <DateField
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  disabled={isPending || readOnlyDetail}
                  required
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                />
              </label>
              {editor.kind === "edit" ? (
                <p className="text-[11px] text-zinc-500">
                  Initial target {formatAu(editing!.initialTarget)} (set on
                  create; updated target is what the Gantt uses when pending).
                </p>
              ) : null}
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Description{" "}
                <span className="font-normal text-zinc-500">(optional)</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={isPending || readOnlyDetail}
                  rows={3}
                  maxLength={500}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                />
              </label>
              {editor.kind === "edit" ? (
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Achieved date{" "}
                  <span className="font-normal text-zinc-500">
                    (blank = pending)
                  </span>
                  <DateField
                    value={actualAchieved}
                    max={todayIso()}
                    onChange={(event) => setActualAchieved(event.target.value)}
                    disabled={isPending || readOnlyDetail}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  />
                </label>
              ) : null}

              {error ? (
                <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap gap-2">
                  {canManage && editor.kind === "edit" ? (
                    <>
                      {!actualAchieved ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setActualAchieved(todayIso())}
                          className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-200"
                        >
                          Mark achieved today
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setActualAchieved("")}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200"
                        >
                          Clear achieved
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setDeleteId(editing!.id)}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300"
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={closeEditor}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200"
                  >
                    {readOnlyDetail ? "Close" : "Cancel"}
                  </button>
                  {canManage ? (
                    <button
                      type="submit"
                      disabled={isPending}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
                    >
                      {isPending
                        ? "Saving…"
                        : editor.kind === "create"
                          ? "Add milestone"
                          : "Save changes"}
                    </button>
                  ) : null}
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteId != null}
        title="Delete milestone?"
        message="This stage gate will be removed from the project and Gantt. Related issues keep their other fields; any milestone link is cleared."
        confirmLabel="Delete milestone"
        isPending={isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </section>
  );
}
