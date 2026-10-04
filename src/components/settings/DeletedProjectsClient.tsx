"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/src/components/providers/ToastProvider";
import SettingsPageHeader from "@/src/components/settings/SettingsPageHeader";
import ConfirmDialog from "@/src/components/ui/ConfirmDialog";
import {
  purgeProject,
  restoreProject,
  runProjectRetentionJob,
} from "@/src/lib/actions/project-lifecycle";
import type { Project } from "@/src/lib/types";

type DeletedProjectsClientProps = {
  initialProjects: Project[];
};

function formatAu(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function DeletedProjectsClient({
  initialProjects,
}: DeletedProjectsClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [projects, setProjects] = useState(initialProjects);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Project | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [retentionConfirmOpen, setRetentionConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRestore() {
    if (!restoreId) return;
    startTransition(async () => {
      const result = await restoreProject(restoreId);
      if (!result.success) {
        showToast(result.error, "error");
        setRestoreId(null);
        return;
      }
      setProjects((current) => current.filter((row) => row.id !== restoreId));
      setRestoreId(null);
      showToast("Project restored.");
      router.refresh();
    });
  }

  function handlePurge() {
    if (!purgeTarget) return;
    startTransition(async () => {
      const result = await purgeProject({
        projectId: purgeTarget.id,
        confirmName,
        reason,
      });
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      setProjects((current) =>
        current.filter((row) => row.id !== purgeTarget.id),
      );
      setPurgeTarget(null);
      setConfirmName("");
      setReason("");
      showToast("Project permanently purged.");
      router.refresh();
    });
  }

  function handleRetention() {
    startTransition(async () => {
      const result = await runProjectRetentionJob();
      if (!result.success) {
        showToast(result.error, "error");
        setRetentionConfirmOpen(false);
        return;
      }
      setRetentionConfirmOpen(false);
      showToast(
        `Retention job: ${result.data.autoCompleted} auto-completed, ${result.data.purgedSoftDeleted} soft-delete purged, ${result.data.purgedCompleted} completed purged, ${result.data.usersWarned} user purge warning(s), ${result.data.usersPurged} user(s) purged.`,
      );
      router.refresh();
    });
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <SettingsPageHeader
        current="Deleted Projects"
        title="Deleted Projects"
        description="Soft-deleted programmes. Restore returns them to Active or Completed. Unrestored rows purge after 30 days."
        actions={
          <button
            type="button"
            disabled={isPending}
            onClick={() => setRetentionConfirmOpen(true)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold dark:border-zinc-600"
          >
            {isPending && retentionConfirmOpen
              ? "Running…"
              : "Run retention job"}
          </button>
        }
      />

      {projects.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No soft-deleted projects.
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {project.name}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Deleted {formatAu(project.deletedAt)} · Purge due{" "}
                  {formatAu(project.purgeDueAt)} · Was{" "}
                  {project.lifecycleStatus.toLowerCase()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setRestoreId(project.id)}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-600"
                >
                  Restore
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setPurgeTarget(project);
                    setConfirmName("");
                    setReason("");
                  }}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 dark:border-red-500/40 dark:text-red-300"
                >
                  Permanently delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={restoreId != null}
        title="Restore project?"
        message="Clears the soft-delete flags. The project returns to its prior Active or Completed status."
        confirmLabel="Restore"
        isPending={isPending}
        onCancel={() => setRestoreId(null)}
        onConfirm={handleRestore}
      />

      <ConfirmDialog
        open={retentionConfirmOpen}
        title="Run retention job?"
        message="Processes due auto-completes, soft-delete purges, five-year completed purges, and deactivated-user retention. This cannot be undone for rows that are already past their due dates."
        confirmLabel="Run job"
        isPending={isPending}
        onCancel={() => setRetentionConfirmOpen(false)}
        onConfirm={handleRetention}
      />

      {purgeTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/60 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Permanently delete?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This writes a Purged Project Register tombstone, then removes the
              operational graph. Type{" "}
              <span className="font-semibold">{purgeTarget.name}</span> to
              confirm.
            </p>
            <input
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              placeholder="Project name"
              disabled={isPending}
            />
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              placeholder="Optional reason"
              disabled={isPending}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setPurgeTarget(null)}
                className="rounded-lg px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || confirmName.trim() !== purgeTarget.name}
                onClick={handlePurge}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isPending ? "Purging…" : "Purge forever"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
