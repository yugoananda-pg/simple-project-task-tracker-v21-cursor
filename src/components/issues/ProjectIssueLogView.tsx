"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";

import IssueDetailDrawer from "@/src/components/issues/IssueDetailDrawer";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
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

type ProjectIssueLogViewProps = {
  projectId: string;
  initialIssues: Issue[];
  memberUsers: ProjectMemberUser[];
  milestones: Milestone[];
  holidayDateKeys: string[];
  canRaise: boolean;
  canManage: boolean;
  currentUserId: string | null;
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

export default function ProjectIssueLogView({
  projectId,
  initialIssues,
  memberUsers,
  milestones,
  holidayDateKeys,
  canRaise,
  canManage,
  currentUserId,
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
  const [picId, setPicId] = useState("");
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");

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
        picId: picId || null,
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
      setPicId("");
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
          <p className="text-sm text-zinc-500">
            Unplanned impediments — excluded from task weights and Project PS.
          </p>
        </div>
        <p className="text-sm text-zinc-500">
          {issues.length === 1 ? "1 issue" : `${issues.length} issues`}
        </p>
      </div>

      {canRaise ? (
        <form
          onSubmit={handleCreate}
          className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900 sm:grid-cols-2 lg:grid-cols-6"
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Issue title"
            required
            disabled={isPending}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm lg:col-span-2 dark:border-zinc-600 dark:bg-zinc-950"
          />
          <select
            value={severity}
            onChange={(event) =>
              setSeverity(event.target.value as IssueSeverity)
            }
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          >
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as IssueCategory)
            }
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={picId}
            onChange={(event) => setPicId(event.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          >
            <option value="">PIC (optional)</option>
            {memberUsers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
            <label className="min-w-0 flex-1 text-[11px] font-medium text-zinc-500">
              Initial start
              <input
                type="date"
                value={start}
                disabled={isPending}
                onChange={(event) => setStart(event.target.value)}
                className="mt-0.5 w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="min-w-0 flex-1 text-[11px] font-medium text-zinc-500">
              Initial due
              <input
                type="date"
                value={due}
                disabled={isPending}
                min={start || undefined}
                onChange={(event) => setDue(event.target.value)}
                className="mt-0.5 w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <button
              type="submit"
              disabled={isPending}
              className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
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
        <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No issues have been logged for this project.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">PIC</th>
                <th className="px-3 py-2">Progress</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2">Fix flag</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
              {issues.map((issue) => {
                const flag = computeIssueFixFlag(issue, holidayDateKeys);
                const canEditRow =
                  canManage ||
                  (currentUserId != null && issue.picId === currentUserId);
                return (
                  <tr key={issue.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/60">
                    <td className="px-3 py-2 font-mono text-xs">
                      <button
                        type="button"
                        className="font-semibold text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
                        onClick={() => openIssue(issue)}
                      >
                        {issue.displayId}
                      </button>
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2">
                      {issue.title}
                    </td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <select
                          value={issue.severity}
                          disabled={isPending}
                          onChange={(event) =>
                            handleInline(issue, {
                              severity: event.target.value as IssueSeverity,
                            })
                          }
                          className="rounded border border-zinc-300 bg-transparent px-1 py-0.5 text-xs dark:border-zinc-600"
                        >
                          {SEVERITY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        issue.severity
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canEditRow &&
                      issue.status !== "closed" &&
                      issue.status !== "cancelled" ? (
                        <select
                          value={issue.status}
                          disabled={isPending}
                          onChange={(event) =>
                            handleInline(issue, {
                              status: event.target.value as IssueStatus,
                            })
                          }
                          className="rounded border border-zinc-300 bg-transparent px-1 py-0.5 text-xs dark:border-zinc-600"
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        issue.status
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {issue.picName || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {canEditRow ? (
                        <input
                          key={`${issue.id}-${issue.progress}-${issue.status}`}
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={issue.progress}
                          disabled={isPending}
                          className="w-16 rounded border border-zinc-300 bg-transparent px-1 py-0.5 text-xs dark:border-zinc-600"
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
                        `${issue.progress}%`
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                      {formatAu(issue.updatedStartDate)} –{" "}
                      {formatAu(issue.updatedDueDate)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusFlagBadge flag={flag} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canManage ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-700 dark:text-red-300"
                          onClick={() => setDeleteId(issue.id)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <IssueDetailDrawer
        key={selected?.id ?? "issue-drawer"}
        open={drawerOpen}
        issue={selected}
        memberUsers={memberUsers}
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
