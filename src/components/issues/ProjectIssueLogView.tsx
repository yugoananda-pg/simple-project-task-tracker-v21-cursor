"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";

import { Trash2 } from "lucide-react";

import IssueDetailDrawer from "@/src/components/issues/IssueDetailDrawer";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import AssigneePicField from "@/src/components/tasks/AssigneePicField";
import DateField from "@/src/components/ui/DateField";
import { computeIssueFixFlag } from "@/src/lib/analytics/issue-schedule";
import type { ProjectMemberUser } from "@/src/lib/actions/projects";
import {
  createIssue,
  deleteIssue,
  updateIssue,
} from "@/src/lib/actions/issues";
import type {
  Issue,
  IssueCategory,
  IssueSeverity,
  IssueStatus,
  Milestone,
} from "@/src/lib/types";
import ConfirmDialog from "@/src/components/ui/ConfirmDialog";
import {
  ISSUE_CATEGORY_LABEL,
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUS_LABEL,
} from "@/src/lib/issue-labels";

type ProjectIssueLogViewProps = {
  projectId: string;
  initialIssues: Issue[];
  memberUsers: ProjectMemberUser[];
  customAssigneeNames: string[];
  milestones: Milestone[];
  holidayDateKeys: string[];
  canRaise: boolean;
  canManage: boolean;
  currentUserId: string | null;
  focusIssueId?: string | null;
};

/** Row/drawer status edits — close/cancel go through the resolve form (summary required). */
const STATUS_OPTIONS: IssueStatus[] = [
  "open",
  "in_progress",
  "blocked",
  "resolved",
];

const SEVERITY_OPTIONS: IssueSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
];

const CATEGORY_OPTIONS: IssueCategory[] = [
  "technical",
  "scope",
  "schedule",
  "cost",
  "quality",
  "resource",
  "stakeholder",
  "safety",
  "commercial",
  "other",
];

function formatAu(value: string | null): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function dateInputValue(value: string | null): string {
  if (!value) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : "";
}

/** Every inline control in the register is one fixed height, so each row is one line. */
const INLINE_INPUT =
  "h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-transparent px-2 text-xs text-zinc-900 outline-none transition-colors duration-150 hover:border-zinc-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-zinc-600";
const INLINE_SELECT = `${INLINE_INPUT} cursor-pointer pr-6`;

/** Form fields above the register share one look. */
const FORM_FIELD =
  "h-9 w-full rounded-lg border border-zinc-200 bg-transparent px-3 text-sm text-zinc-900 outline-none transition-colors duration-150 hover:border-zinc-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-zinc-600";

const SEVERITY_DOT: Record<IssueSeverity, string> = {
  critical: "#e11d48",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#94a3b8",
};

const TH = "whitespace-nowrap px-2.5 py-2.5 font-semibold";
const TD = "whitespace-nowrap px-2.5 py-1.5 align-middle";

export default function ProjectIssueLogView({
  projectId,
  initialIssues,
  memberUsers,
  customAssigneeNames,
  milestones,
  holidayDateKeys,
  canRaise,
  canManage,
  currentUserId,
  focusIssueId = null,
}: ProjectIssueLogViewProps) {
  const [issues, setIssues] = useState(initialIssues);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<IssueSeverity>("medium");
  const [category, setCategory] = useState<IssueCategory>("technical");
  const [pic, setPic] = useState<{
    assigneeId: string | null;
    assigneeName: string;
  }>({ assigneeId: null, assigneeName: "" });
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");

  useEffect(() => {
    if (!focusIssueId) return;
    if (!issues.some((issue) => issue.id === focusIssueId)) return;
    setSelectedId(focusIssueId);
    setDrawerOpen(true);
  }, [focusIssueId, issues]);

  const selected = useMemo(
    () => issues.find((issue) => issue.id === selectedId) ?? null,
    [issues, selectedId],
  );

  function syncIssue(updated: Issue) {
    setIssues((current) => {
      const index = current.findIndex((issue) => issue.id === updated.id);
      if (index < 0) return [...current, updated];
      const next = [...current];
      next[index] = updated;
      return next;
    });
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createIssue({
        projectId,
        title,
        severity,
        category,
        picId: pic.assigneeId,
        picName: pic.assigneeId ? null : pic.assigneeName,
        initialStartDate: start || null,
        initialDueDate: due || null,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setIssues((current) => [...current, result.data]);
      setTitle("");
      setStart("");
      setDue("");
      setPic({ assigneeId: null, assigneeName: "" });
      setError(null);
      setSelectedId(result.data.id);
      setDrawerOpen(true);
    });
  }

  function openIssue(issue: Issue) {
    setSelectedId(issue.id);
    setDrawerOpen(true);
  }

  function handleInline(
    issue: Issue,
    patch: Omit<Parameters<typeof updateIssue>[0], "id">,
  ) {
    startTransition(async () => {
      const result = await updateIssue({ id: issue.id, ...patch });
      if (!result.success) {
        setError(result.error);
        return;
      }
      syncIssue(result.data);
    });
  }

  function confirmDelete() {
    if (!deleteId) return;
    startTransition(async () => {
      const result = await deleteIssue(deleteId);
      if (!result.success) {
        setError(result.error);
        setDeleteId(null);
        return;
      }
      setIssues((current) => current.filter((issue) => issue.id !== deleteId));
      if (selectedId === deleteId) {
        setDrawerOpen(false);
        setSelectedId(null);
      }
      setDeleteId(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Issue Log
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Unplanned impediments — excluded from task weights and Project PS.
          </p>
        </div>
        <p className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300">
          {issues.length === 1 ? "1 issue" : `${issues.length} issues`}
        </p>
      </div>

      {canRaise ? (
        <form
          onSubmit={handleCreate}
          className="sptt-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6"
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Issue title"
            required
            disabled={isPending}
            className={`${FORM_FIELD} lg:col-span-2`}
          />
          <select
            value={severity}
            onChange={(event) =>
              setSeverity(event.target.value as IssueSeverity)
            }
            className={FORM_FIELD}
          >
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {ISSUE_SEVERITY_LABEL[option]}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as IssueCategory)
            }
            className={FORM_FIELD}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {ISSUE_CATEGORY_LABEL[option]}
              </option>
            ))}
          </select>
          <AssigneePicField
            task={{
              id: "new-issue",
              assigneeId: pic.assigneeId,
              assigneeName: pic.assigneeName,
              assignees: pic.assigneeId || pic.assigneeName
                ? [{ userId: pic.assigneeId, name: pic.assigneeName }]
                : [],
            }}
            members={memberUsers}
            suggestions={customAssigneeNames}
            disabled={isPending}
            label="PIC"
            hideHint
            single
            labelClassName="sr-only"
            fieldClassName={FORM_FIELD}
            onCommit={(next) =>
              setPic({
                assigneeId: next.assigneeId ?? null,
                assigneeName: next.assigneeName ?? "",
              })
            }
          />
          <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
            <label className="min-w-0 flex-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Initial start
              <DateField
                value={start}
                disabled={isPending}
                onChange={(event) => setStart(event.target.value)}
                className={`${FORM_FIELD} mt-0.5 font-normal`}
              />
            </label>
            <label className="min-w-0 flex-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Initial due
              <DateField
                value={due}
                disabled={isPending}
                min={start || undefined}
                onChange={(event) => setDue(event.target.value)}
                className={`${FORM_FIELD} mt-0.5 font-normal`}
              />
            </label>
            <button
              type="submit"
              disabled={isPending}
              className="h-9 shrink-0 rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {isPending ? "Saving…" : "Log issue"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {issues.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No issues have been logged for this project.
        </div>
      ) : (
        <div className="sptt-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[79rem] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[4.5rem]" />
                <col />
                <col className="w-[6.5rem]" />
                <col className="w-[7.5rem]" />
                <col className="w-[9.5rem]" />
                <col className="w-[7.5rem]" />
                <col className="w-[16.5rem]" />
                <col className="w-[10.5rem]" />
                <col className="w-11" />
              </colgroup>
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                <tr>
                  <th className={TH}>ID</th>
                  <th className={TH}>Title</th>
                  <th className={TH}>Severity</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>PIC</th>
                  <th className={TH}>Progress</th>
                  <th className={TH}>Updated start – due</th>
                  <th className={TH}>Fix flag</th>
                  <th className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {issues.map((issue) => {
                  const flag = computeIssueFixFlag(issue, holidayDateKeys);
                  const canEditRow =
                    canManage ||
                    (currentUserId != null && issue.picId === currentUserId);
                  return (
                    <tr
                      key={issue.id}
                      className="transition-colors duration-150 hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                    >
                      <td className={`${TD} font-mono text-xs`}>
                        <button
                          type="button"
                          className="font-semibold text-slate-700 underline-offset-2 hover:text-teal-700 hover:underline dark:text-slate-200 dark:hover:text-teal-300"
                          onClick={() => openIssue(issue)}
                        >
                          {issue.displayId}
                        </button>
                      </td>
                      <td className={TD}>
                        {canManage ? (
                          <input
                            key={`${issue.id}-${issue.title}`}
                            aria-label={`Title for ${issue.displayId}`}
                            title={issue.title}
                            defaultValue={issue.title}
                            disabled={isPending}
                            className={`${INLINE_INPUT} truncate`}
                            onBlur={(event) => {
                              const next = event.target.value.trim();
                              if (!next || next === issue.title) {
                                event.target.value = issue.title;
                                return;
                              }
                              handleInline(issue, { title: next });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.currentTarget.blur();
                            }}
                          />
                        ) : (
                          <span
                            className="block truncate text-zinc-900 dark:text-zinc-100"
                            title={issue.title}
                          >
                            {issue.title}
                          </span>
                        )}
                      </td>
                      <td className={TD}>
                        {canManage ? (
                          <select
                            aria-label={`Severity for ${issue.displayId}`}
                            value={issue.severity}
                            disabled={isPending}
                            onChange={(event) =>
                              handleInline(issue, {
                                severity: event.target.value as IssueSeverity,
                              })
                            }
                            className={INLINE_SELECT}
                          >
                            {SEVERITY_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {ISSUE_SEVERITY_LABEL[option]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-flex items-center gap-2 text-xs text-zinc-800 dark:text-zinc-100">
                            <span
                              aria-hidden
                              className="size-2 rounded-full"
                              style={{ backgroundColor: SEVERITY_DOT[issue.severity] }}
                            />
                            {ISSUE_SEVERITY_LABEL[issue.severity]}
                          </span>
                        )}
                      </td>
                      <td className={TD}>
                        {canEditRow &&
                        issue.status !== "closed" &&
                        issue.status !== "cancelled" ? (
                          <select
                            aria-label={`Status for ${issue.displayId}`}
                            value={issue.status}
                            disabled={isPending}
                            onChange={(event) =>
                              handleInline(issue, {
                                status: event.target.value as IssueStatus,
                              })
                            }
                            className={INLINE_SELECT}
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {ISSUE_STATUS_LABEL[option]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-zinc-800 dark:text-zinc-100">
                            {ISSUE_STATUS_LABEL[issue.status]}
                          </span>
                        )}
                      </td>
                      <td className={`${TD} text-xs`}>
                        {canManage ? (
                          <AssigneePicField
                            task={{
                              id: issue.id,
                              assigneeId: issue.picId,
                              assigneeName: issue.picName,
                              assignees:
                                issue.picId || issue.picName
                                  ? [{ userId: issue.picId, name: issue.picName }]
                                  : [],
                            }}
                            members={memberUsers}
                            suggestions={customAssigneeNames}
                            disabled={isPending}
                            label={`PIC for ${issue.displayId}`}
                            hideHint
                            single
                            labelClassName="sr-only"
                            fieldClassName={`${INLINE_INPUT} truncate`}
                            onCommit={(next) =>
                              handleInline(issue, {
                                picId: next.assigneeId ?? null,
                                picName: next.assigneeName ?? "",
                              })
                            }
                          />
                        ) : (
                          <span
                            className="block truncate text-zinc-800 dark:text-zinc-100"
                            title={issue.picName || undefined}
                          >
                            {issue.picName || "—"}
                          </span>
                        )}
                      </td>
                      <td className={TD}>
                        <div className="flex items-center gap-2">
                          {canEditRow ? (
                            <input
                              key={`${issue.id}-${issue.progress}-${issue.status}`}
                              aria-label={`Progress for ${issue.displayId}`}
                              type="number"
                              min={0}
                              max={100}
                              defaultValue={issue.progress}
                              disabled={isPending}
                              className={`${INLINE_INPUT} !w-14 tabular-nums`}
                              onChange={(event) => {
                                const raw = Number(event.target.value);
                                if (Number.isNaN(raw)) return;
                                const value = Math.min(
                                  100,
                                  Math.max(0, Math.round(raw)),
                                );
                                if (value === issue.progress) return;
                                handleInline(issue, { progress: value });
                              }}
                            />
                          ) : (
                            <span className="w-14 text-xs tabular-nums text-zinc-800 dark:text-zinc-100">
                              {issue.progress}%
                            </span>
                          )}
                          <span
                            aria-hidden
                            className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                          >
                            <span
                              className="block h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
                              style={{ width: `${issue.progress}%` }}
                            />
                          </span>
                        </div>
                      </td>
                      <td className={TD}>
                        {canEditRow ? (
                          <div className="flex items-center gap-1.5">
                            <DateField
                              aria-label={`Updated start for ${issue.displayId}`}
                              value={dateInputValue(issue.updatedStartDate)}
                              disabled={isPending}
                              onChange={(event) => {
                                const next = event.target.value;
                                if (next === dateInputValue(issue.updatedStartDate)) {
                                  return;
                                }
                                handleInline(issue, {
                                  updatedStartDate: next || null,
                                });
                              }}
                              className={`${INLINE_INPUT} !w-[7rem] !px-1.5 !pr-7 font-normal`}
                            />
                            <span aria-hidden className="text-zinc-400">
                              –
                            </span>
                            <DateField
                              aria-label={`Updated due for ${issue.displayId}`}
                              value={dateInputValue(issue.updatedDueDate)}
                              disabled={isPending}
                              min={dateInputValue(issue.updatedStartDate) || undefined}
                              onChange={(event) => {
                                const next = event.target.value;
                                if (next === dateInputValue(issue.updatedDueDate)) {
                                  return;
                                }
                                handleInline(issue, {
                                  updatedDueDate: next || null,
                                });
                              }}
                              className={`${INLINE_INPUT} !w-[7rem] !px-1.5 !pr-7 font-normal`}
                            />
                          </div>
                        ) : (
                          <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                            {formatAu(issue.updatedStartDate)} –{" "}
                            {formatAu(issue.updatedDueDate)}
                          </span>
                        )}
                      </td>
                      <td className={TD}>
                        <StatusFlagBadge flag={flag} className="whitespace-nowrap" />
                      </td>
                      <td className={`${TD} text-right`}>
                        {canManage ? (
                          <button
                            type="button"
                            aria-label={`Delete ${issue.displayId}`}
                            title="Delete issue"
                            className="inline-flex size-8 items-center justify-center rounded-md text-zinc-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                            onClick={() => setDeleteId(issue.id)}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <IssueDetailDrawer
        key={selected?.id ?? "issue-drawer"}
        open={drawerOpen}
        issue={selected}
        memberUsers={memberUsers}
        customAssigneeNames={customAssigneeNames}
        milestones={milestones}
        holidayDateKeys={holidayDateKeys}
        canManage={canManage}
        canComment={canRaise || canManage}
        currentUserId={currentUserId}
        onClose={() => setDrawerOpen(false)}
        onUpdated={syncIssue}
      />

      <ConfirmDialog
        open={deleteId != null}
        title="Delete issue?"
        message="This permanently removes the issue, its comments, and activity history."
        confirmLabel="Delete"
        isPending={isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
