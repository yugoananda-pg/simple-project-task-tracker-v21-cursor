"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/src/components/providers/ToastProvider";
import ConfirmDialog from "@/src/components/ui/ConfirmDialog";
import {
  reopenProject,
  softDeleteProject,
} from "@/src/lib/actions/project-lifecycle";
import type { Project } from "@/src/lib/types";

type CompletedProjectsClientProps = {
  initialProjects: Project[];
  currentUserId: string;
  isSuperPm: boolean;
};

function formatAuDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function CompletedProjectsClient({
  initialProjects,
  currentUserId,
  isSuperPm,
}: CompletedProjectsClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [projects, setProjects] = useState(initialProjects);
  const [reopenId, setReopenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleReopen() {
    if (!reopenId) return;
    startTransition(async () => {
      const result = await reopenProject(reopenId);
      if (!result.success) {
        showToast(result.error, "error");
        setReopenId(null);
        return;
      }
      setProjects((current) => current.filter((row) => row.id !== reopenId));
      setReopenId(null);
      showToast("Project reopened to Active.");
      router.refresh();
    });
  }

  function handleSoftDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await softDeleteProject(deleteTarget.id);
      if (!result.success) {
        showToast(result.error, "error");
        setDeleteTarget(null);
        return;
      }
      setProjects((current) =>
        current.filter((row) => row.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
      showToast("Project moved to Deleted Projects.");
      router.refresh();
    });
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Active projects
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Completed Projects
          </h1>
          <p className="mt-2 w-full text-sm text-zinc-600 dark:text-zinc-400">
            Labelled programmes remain fully readable. Soft-delete moves them to
            the Super PM recycle bin; physical purge follows after five years
            from the Completed label.
          </p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No completed projects are visible to your account.
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900">
          {projects.map((project) => {
            const canManage =
              isSuperPm || project.ownerId === currentUserId;
            return (
              <li
                key={project.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/projects/${project.id}`}
                    className="font-semibold text-zinc-900 hover:underline dark:text-zinc-50"
                  >
                    {project.name}
                  </Link>
                  <p className="mt-1 text-xs text-zinc-500">
                    Completed {formatAuDateTime(project.completedAt)}
                    {project.completionMethod
                      ? ` · ${project.completionMethod === "MANUAL" ? "Manual" : "Auto retention"}`
                      : ""}
                    {project.completedPurgeDueAt
                      ? ` · Purge due ${formatAuDateTime(project.completedPurgeDueAt)}`
                      : ""}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setReopenId(project.id)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-600"
                    >
                      Reopen
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setDeleteTarget(project)}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 dark:border-red-500/40 dark:text-red-300"
                    >
                      Soft-delete
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={reopenId != null}
        title="Reopen project?"
        message="The project returns to Active projects. The five-year completed purge clock is cancelled. If progress is still 100%, the 30-day auto-complete clock restarts."
        confirmLabel="Reopen"
        isPending={isPending}
        onCancel={() => setReopenId(null)}
        onConfirm={handleReopen}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        title="Soft-delete this completed project?"
        message="It leaves Completed Projects. Only a Super PM can restore it. After 30 days it will be permanently purged to the Purged Project Register."
        confirmLabel="Soft-delete"
        isPending={isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleSoftDelete}
      />
    </section>
  );
}
