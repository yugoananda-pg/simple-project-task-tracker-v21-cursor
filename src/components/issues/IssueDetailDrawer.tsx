"use client";

import {
  useEffect,
  useId,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { X } from "lucide-react";

import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import AssigneePicField from "@/src/components/tasks/AssigneePicField";
import DateField from "@/src/components/ui/DateField";
import {
  addIssueComment,
  closeIssue,
  getIssueById,
  updateIssue,
} from "@/src/lib/actions/issues";
import { computeIssueFixFlag } from "@/src/lib/analytics/issue-schedule";
import {
  ISSUE_CATEGORY_LABEL,
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUS_LABEL,
} from "@/src/lib/issue-labels";
import type { ProjectMemberUser } from "@/src/lib/actions/projects";
import {
  isFutureLocalDate,
  toLocalDateString,
} from "@/src/lib/task-defaults";
import type {
  Issue,
  IssueCategory,
  IssueSeverity,
  IssueStatus,
  Milestone,
} from "@/src/lib/types";

type IssueDetailDrawerProps = {
  open: boolean;
  issue: Issue | null;
  memberUsers: ProjectMemberUser[];
  milestones: Milestone[];
  holidayDateKeys: string[];
  canManage: boolean;
  canComment: boolean;
  currentUserId: string | null;
  customAssigneeNames: string[];
  onClose: () => void;
  onUpdated: (issue: Issue) => void;
};

/** Close/cancel require a summary via Close & resolve (not the status dropdown). */
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

const fieldClassName =
  "box-border w-full min-w-0 max-w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-400/40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-500/40";

const labelClassName =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300";

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

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : "";
}

export default function IssueDetailDrawer({
  open,
  issue,
  memberUsers,
  milestones,
  holidayDateKeys,
  canManage,
  canComment,
  currentUserId,
  customAssigneeNames,
  onClose,
  onUpdated,
}: IssueDetailDrawerProps) {
  const titleId = useId();
  const [detail, setDetail] = useState<Issue | null>(issue);
  const [comment, setComment] = useState("");
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    setDetail(issue);
    setComment("");
    setResolution(issue?.resolutionSummary ?? "");
    setError(null);
    if (!open || !issue) return;

    let cancelled = false;
    setLoadingDetail(true);
    void getIssueById(issue.id).then((result) => {
      if (cancelled) return;
      setLoadingDetail(false);
      if (result.success) {
        setDetail(result.data);
        onUpdated(result.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, issue?.id]);

  if (!open || !issue || !detail) return null;

  const isPic =
    currentUserId != null && detail.picId === currentUserId;
  const canEditCore = canManage;
  const canEditProgress = canManage || isPic;
  const flag = computeIssueFixFlag(detail, holidayDateKeys);

  function patch(fields: Parameters<typeof updateIssue>[0]) {
    if (
      fields.actualStartDate !== undefined &&
      isFutureLocalDate(fields.actualStartDate)
    ) {
      setError("Actual start date cannot be in the future.");
      return;
    }
    if (
      fields.actualResolutionDate !== undefined &&
      isFutureLocalDate(fields.actualResolutionDate)
    ) {
      setError("Actual resolution date cannot be in the future.");
      return;
    }
    startTransition(async () => {
      const result = await updateIssue(fields);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDetail(result.data);
      onUpdated(result.data);
      setError(null);
      // Refresh activity trail after mutation.
      const refreshed = await getIssueById(result.data.id);
      if (refreshed.success) {
        setDetail(refreshed.data);
        onUpdated(refreshed.data);
      }
    });
  }

  function handleComment(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addIssueComment({
        issueId: detail!.id,
        content: comment,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setComment("");
      setError(null);
      const refreshed = await getIssueById(detail!.id);
      if (refreshed.success) {
        setDetail(refreshed.data);
        onUpdated(refreshed.data);
      }
    });
  }

  function handleResolve(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await closeIssue({
        id: detail!.id,
        resolutionSummary: resolution,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDetail(result.data);
      onUpdated(result.data);
      setError(null);
      const refreshed = await getIssueById(result.data.id);
      if (refreshed.success) {
        setDetail(refreshed.data);
        onUpdated(refreshed.data);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close issue details"
        className="absolute inset-0 bg-zinc-950/40 dark:bg-black/60"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-zinc-500">
              {detail.displayId}
            </p>
            <h2
              id={titleId}
              className="mt-1 break-words text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              {detail.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusFlagBadge flag={flag} />
              <span className="text-xs text-zinc-500">
                {detail.progress}% · {ISSUE_STATUS_LABEL[detail.status]}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="text-sm text-red-700 dark:text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <section className="space-y-3">
            <label className="block">
              <span className={labelClassName}>Title</span>
              <input
                className={fieldClassName}
                value={detail.title}
                disabled={!canEditCore || isPending}
                onChange={(event) =>
                  setDetail({ ...detail, title: event.target.value })
                }
                onBlur={(event) => {
                  if (!canEditCore) return;
                  const next = event.target.value.trim();
                  // Compare to parent-synced issue (local detail already mirrors the input).
                  if (!next || next === issue.title) return;
                  patch({ id: detail.id, title: next });
                }}
              />
            </label>

            <label className="block">
              <span className={labelClassName}>Description</span>
              <textarea
                rows={3}
                className={fieldClassName}
                value={detail.description}
                disabled={!canEditCore || isPending}
                onChange={(event) =>
                  setDetail({ ...detail, description: event.target.value })
                }
                onBlur={(event) => {
                  if (!canEditCore) return;
                  if (event.target.value === issue.description) return;
                  patch({ id: detail.id, description: event.target.value });
                }}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClassName}>Severity</span>
                <select
                  className={fieldClassName}
                  value={detail.severity}
                  disabled={!canEditCore || isPending}
                  onChange={(event) =>
                    patch({
                      id: detail.id,
                      severity: event.target.value as IssueSeverity,
                    })
                  }
                >
                  {SEVERITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {ISSUE_SEVERITY_LABEL[option]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClassName}>Category</span>
                <select
                  className={fieldClassName}
                  value={detail.category}
                  disabled={!canEditCore || isPending}
                  onChange={(event) =>
                    patch({
                      id: detail.id,
                      category: event.target.value as IssueCategory,
                    })
                  }
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {ISSUE_CATEGORY_LABEL[option]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClassName}>Status</span>
                {detail.status === "closed" || detail.status === "cancelled" ? (
                  <input
                    className={fieldClassName}
                    value={ISSUE_STATUS_LABEL[detail.status]}
                    disabled
                    readOnly
                  />
                ) : (
                  <select
                    className={fieldClassName}
                    value={detail.status}
                    disabled={!canEditProgress || isPending}
                    onChange={(event) =>
                      patch({
                        id: detail.id,
                        status: event.target.value as IssueStatus,
                      })
                    }
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {ISSUE_STATUS_LABEL[option]}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="block">
                <span className={labelClassName}>Progress %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={fieldClassName}
                  value={detail.progress}
                  disabled={!canEditProgress || isPending}
                  onChange={(event) => {
                    if (!canEditProgress) return;
                    const raw = Number(event.target.value);
                    if (Number.isNaN(raw)) return;
                    const value = Math.min(100, Math.max(0, Math.round(raw)));
                    setDetail({ ...detail, progress: value });
                    // Commit immediately (same as status/dates) so edits are not lost if
                    // the field never receives a reliable blur in the session.
                    if (value === issue.progress) return;
                    patch({ id: detail.id, progress: value });
                  }}
                />
              </label>
            </div>

            <AssigneePicField
              task={{
                id: `${detail.id}-drawer`,
                assigneeId: detail.picId,
                assigneeName: detail.picName,
                assignees:
                  detail.picId || detail.picName
                    ? [{ userId: detail.picId, name: detail.picName }]
                    : [],
              }}
              members={memberUsers}
              suggestions={customAssigneeNames}
              disabled={!canEditCore || isPending}
              label="PIC"
              single
              labelClassName={labelClassName}
              fieldClassName={fieldClassName}
              onCommit={(next) =>
                patch({
                  id: detail.id,
                  picId: next.assigneeId ?? null,
                  picName: next.assigneeName ?? "",
                })
              }
            />

            <label className="block">
              <span className={labelClassName}>Related milestone</span>
              <select
                className={fieldClassName}
                value={detail.relatedMilestoneId ?? ""}
                disabled={!canEditCore || isPending}
                onChange={(event) =>
                  patch({
                    id: detail.id,
                    relatedMilestoneId: event.target.value || null,
                  })
                }
              >
                <option value="">None</option>
                {milestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="grid grid-cols-2 gap-3">
            {(
              [
                ["updatedStartDate", "Updated start", false],
                ["updatedDueDate", "Updated due", false],
                ["actualStartDate", "Actual start", true],
                ["actualResolutionDate", "Actual resolution", true],
              ] as const
            ).map(([key, label, disallowFuture]) => (
              <label key={key} className="block">
                <span className={labelClassName}>{label}</span>
                <DateField
                  aria-label={label}
                  className={fieldClassName}
                  value={toDateInputValue(detail[key])}
                  max={disallowFuture ? toLocalDateString() : undefined}
                  disabled={!canEditProgress || isPending}
                  onChange={(event) =>
                    patch({
                      id: detail.id,
                      [key]: event.target.value || null,
                    })
                  }
                />
              </label>
            ))}
          </section>

          <section className="space-y-2">
            <label className="block">
              <span className={labelClassName}>Impact summary</span>
              <textarea
                rows={2}
                className={fieldClassName}
                value={detail.impactSummary}
                disabled={!canEditCore || isPending}
                onChange={(event) =>
                  setDetail({ ...detail, impactSummary: event.target.value })
                }
                onBlur={(event) => {
                  if (!canEditCore) return;
                  if (event.target.value === issue.impactSummary) return;
                  patch({ id: detail.id, impactSummary: event.target.value });
                }}
              />
            </label>
          </section>

          {canManage && detail.status !== "closed" ? (
            <form onSubmit={handleResolve} className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Close & resolve
              </p>
              <textarea
                rows={2}
                required
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                placeholder="Resolution summary"
                className={fieldClassName}
                disabled={isPending}
              />
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Mark closed
              </button>
            </form>
          ) : null}

          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Comments
            </h3>
            <ul className="mt-2 space-y-2">
              {(detail.comments ?? []).length === 0 ? (
                <li className="text-sm text-zinc-500">No comments yet.</li>
              ) : (
                (detail.comments ?? []).map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                  >
                    <p className="font-medium text-zinc-800 dark:text-zinc-100">
                      {entry.authorName}
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        {formatAuDateTime(entry.createdAt)}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                      {entry.content}
                    </p>
                  </li>
                ))
              )}
            </ul>
            {canComment ? (
              <form onSubmit={handleComment} className="mt-3 flex gap-2">
                <input
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Add a comment"
                  required
                  disabled={isPending}
                  className={fieldClassName}
                />
                <button
                  type="submit"
                  disabled={isPending}
                  className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  Post
                </button>
              </form>
            ) : null}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Activity
              {loadingDetail ? (
                <span className="ml-2 text-xs font-normal text-zinc-400">
                  Loading…
                </span>
              ) : null}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {(detail.activities ?? []).length === 0 ? (
                <li className="text-sm text-zinc-500">No activity yet.</li>
              ) : (
                (detail.activities ?? []).map((activity) => (
                  <li
                    key={activity.id}
                    className="border-l-2 border-zinc-300 pl-3 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
                  >
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {activity.eventType}
                    </span>
                    {" · "}
                    {activity.summary}
                    <div className="text-[11px] text-zinc-400">
                      {activity.createdByName} ·{" "}
                      {formatAuDateTime(activity.createdAt)}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}
