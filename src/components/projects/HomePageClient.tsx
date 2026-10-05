"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { useToast } from "@/src/components/providers/ToastProvider";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import ProgressPairBadges from "@/src/components/schedule/ProgressPairBadges";
import ConfirmDialog from "@/src/components/ui/ConfirmDialog";
import {
  createProject,
  deleteProject,
  type BrowsableProjectOwner,
  type ProjectListItem,
} from "@/src/lib/actions/projects";
import { markProjectCompleted } from "@/src/lib/actions/project-lifecycle";
import {
  PROJECT_LIST_SCOPE_ALL,
  persistPortfolioScopeClient,
} from "@/src/lib/project-list-scope";

type HomePageClientProps = {
  initialProjects: ProjectListItem[];
  canCreateProject: boolean;
  canViewCompleted: boolean;
  isSignedIn?: boolean;
  loadError?: string | null;
  canBrowsePeerPortfolios?: boolean;
  browsableOwners?: BrowsableProjectOwner[];
  browseOwnerId?: string | null;
  currentUserId?: string | null;
};

export default function HomePageClient({
  initialProjects,
  canCreateProject,
  canViewCompleted,
  isSignedIn = true,
  loadError = null,
  canBrowsePeerPortfolios = false,
  browsableOwners = [],
  browseOwnerId = null,
  currentUserId = null,
}: HomePageClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [projects, setProjects] = useState(initialProjects);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<ProjectListItem | null>(
    null,
  );
  const [projectToComplete, setProjectToComplete] =
    useState<ProjectListItem | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isScopePending, startScopeTransition] = useTransition();
  /** Optimistic select value so the control does not snap back while RSC navigates. */
  const [scopeDraft, setScopeDraft] = useState(browseOwnerId ?? "");

  // Soft navigations (portfolio scope) refresh RSC props; keep local list in sync.
  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  // Mirror the URL scope into the combobox. Bare `/` clears remembered scope so
  // brand / Projects / typed homepage reset to My projects; “Back to projects”
  // keeps the filter by linking to `/?owner=…` instead.
  useEffect(() => {
    const next = browseOwnerId ?? "";
    setScopeDraft(next);
    persistPortfolioScopeClient(next);
  }, [browseOwnerId]);

  function navigatePortfolioScope(next: string) {
    setScopeDraft(next);
    persistPortfolioScopeClient(next);
    startScopeTransition(() => {
      if (!next) {
        router.push("/");
        return;
      }
      router.push(`/?owner=${encodeURIComponent(next)}`);
    });
  }

  function openModal() {
    setName("");
    setDescription("");
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (isPending) return;
    setModalOpen(false);
  }

  function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createProject({ name, description });
      if (!result.success) {
        setError(result.error);
        return;
      }

      setProjects((current) => [
        {
          ...result.data,
          access: "admin",
          taskCount: 0,
          openIssueCount: 0,
          criticalOpenIssueCount: 0,
          projectPs: 100,
          pActualProject: 0,
          pTargetProject: 0,
          statusFlag: "SF-01",
        },
        ...current,
      ]);
      setModalOpen(false);
      router.refresh();
    });
  }

  async function handleDeleteProject() {
    if (!projectToDelete || isDeletingProject) return;

    setIsDeletingProject(true);
    const result = await deleteProject(projectToDelete.id);
    if (!result.success) {
      setIsDeletingProject(false);
      showToast(result.error ?? "Unable to delete this project.", "error");
      return;
    }

    setProjects((current) =>
      current.filter((project) => project.id !== projectToDelete.id),
    );
    setProjectToDelete(null);
    setIsDeletingProject(false);
    showToast("Project moved to Deleted Projects. A Super PM can restore it within 30 days.");
    router.refresh();
  }

  async function handleCompleteProject() {
    if (!projectToComplete || isCompleting) return;
    setIsCompleting(true);
    const result = await markProjectCompleted(projectToComplete.id);
    if (!result.success) {
      setIsCompleting(false);
      showToast(result.error ?? "Unable to complete this project.", "error");
      return;
    }
    setProjects((current) =>
      current.filter((project) => project.id !== projectToComplete.id),
    );
    setProjectToComplete(null);
    setIsCompleting(false);
    showToast("Project moved to Completed Projects.");
    router.refresh();
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Projects
          </h1>
          <p className="mt-2 w-full max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Active programmes only. Completed and soft-deleted work live on
            dedicated surfaces.
          </p>
          {canViewCompleted ? (
            <Link
              href="/projects/completed"
              className="mt-3 inline-flex text-sm font-semibold text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
            >
              View Completed Projects →
            </Link>
          ) : null}
          {canBrowsePeerPortfolios ? (
            <div className="mt-4 max-w-md">
              <label
                htmlFor="browse-owner"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
              >
                Portfolio scope
              </label>
              <select
                id="browse-owner"
                value={scopeDraft}
                disabled={isScopePending}
                aria-busy={isScopePending}
                onChange={(event) => navigatePortfolioScope(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
              >
                <option value="">
                  My projects (owned or with tasks assigned to me)
                </option>
                <option value={PROJECT_LIST_SCOPE_ALL}>All projects</option>
                {browsableOwners
                  .filter((owner) => owner.id !== currentUserId)
                  .map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      Projects owned by {owner.name}
                    </option>
                  ))}
              </select>
              {isScopePending ? (
                <p
                  className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300"
                  aria-live="polite"
                >
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Updating projects…
                </p>
              ) : scopeDraft && scopeDraft !== PROJECT_LIST_SCOPE_ALL ? (
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Peer portfolios are read-only for a non-owning PM. If a task is
                  assigned to you, you can still update that task. Super PM
                  retains full edit rights.
                </p>
              ) : scopeDraft === PROJECT_LIST_SCOPE_ALL ? (
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Showing every Active project. Edit rights are unchanged (own
                  projects for PMs; Super PM retains absolute privileges).
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {canCreateProject ? (
          <button
            type="button"
            onClick={openModal}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            + New Project
          </button>
        ) : null}
      </div>

      <div className="relative mt-8 min-h-[12rem]">
        {isScopePending ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/55 backdrop-blur-[1px] dark:bg-zinc-950/50"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Updating projects…
            </div>
          </div>
        ) : null}

        <div
          className={
            isScopePending ? "pointer-events-none opacity-50" : undefined
          }
        >
        {!isSignedIn ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
            <p className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Sign in to view your projects
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              You are not signed in on this browser. Sign in with an existing
              account, or create a new one to get started.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                Create an account
              </Link>
            </div>
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className={[
              "rounded-xl px-6 py-8 text-center",
              /pending approval/i.test(loadError)
                ? "border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40"
                : "border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40",
            ].join(" ")}
          >
            {/pending approval/i.test(loadError) ? (
              <>
                <p className="text-lg font-semibold tracking-tight text-amber-950 dark:text-amber-100">
                  Awaiting approval
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                  Thanks for registering. After you confirm your email, a Super
                  PM must approve your account. You stay signed out until then;
                  sign in with your registered credentials once approved.
                </p>
                <Link
                  href="/login?notice=awaiting_approval"
                  className="mt-5 inline-flex rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  Go to sign in
                </Link>
              </>
            ) : (
              <>
                <p className="font-medium text-red-800 dark:text-red-200">
                  Unable to load projects
                </p>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                  {loadError}
                </p>
                {/sign in/i.test(loadError) ? (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <Link
                      href="/login"
                      className="inline-flex rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/register"
                      className="inline-flex rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-800 dark:border-red-500/40 dark:text-red-200"
                    >
                      Create an account
                    </Link>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-red-600/90 dark:text-red-400">
                    Your data is still in the database. Restart the Next.js app
                    with{" "}
                    <code className="rounded bg-red-100 px-1 dark:bg-red-900/50">
                      npm run dev
                    </code>{" "}
                    and refresh. You do not need to restart Supabase.
                  </p>
                )}
              </>
            )}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              No projects yet
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {canCreateProject
                ? "Create your first project to get started."
                : "Projects shared with you will appear here."}
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {projects.map((project) => (
              <li key={project.id}>
                <div className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-md dark:shadow-black/25 dark:hover:border-zinc-500 dark:hover:bg-zinc-900/95">
                  <Link
                    href={`/projects/${project.id}`}
                    className="block flex-1 p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100"
                    tabIndex={isScopePending ? -1 : undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                        {project.name}
                      </h2>
                      {project.access === "read" ? (
                        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          Read-only
                        </span>
                      ) : null}
                    </div>
                    {project.description ? (
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {project.description}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm italic text-zinc-400">
                        No description
                      </p>
                    )}
                    <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                      {project.taskCount === 1
                        ? "1 task"
                        : `${project.taskCount} tasks`}
                      {project.openIssueCount > 0 ? (
                        <span
                          className={[
                            "ml-2 font-semibold",
                            project.criticalOpenIssueCount > 0
                              ? "text-rose-700 dark:text-rose-300"
                              : "text-amber-700 dark:text-amber-300",
                          ].join(" ")}
                        >
                          ·{" "}
                          {project.openIssueCount === 1
                            ? "1 open issue"
                            : `${project.openIssueCount} open issues`}
                        </span>
                      ) : null}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusFlagBadge flag={project.statusFlag} />
                      <ProgressPairBadges
                        actual={project.pActualProject}
                        target={project.pTargetProject}
                      />
                    </div>
                  </Link>
                  {project.access === "admin" ? (
                    <div className="flex flex-wrap gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
                      {project.pActualProject >= 100 ? (
                        <button
                          type="button"
                          onClick={() => setProjectToComplete(project)}
                          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        >
                          Move to Completed Projects
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setProjectToDelete(project)}
                        title="Soft-delete project"
                        className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Delete project
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        </div>
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="presentation"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-project-title"
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="new-project-title"
              className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              New project
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Give your project a clear name and optional description.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleCreateProject}>
              <div>
                <label
                  htmlFor="project-name"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Project name
                </label>
                <input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={isPending}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  placeholder="Website redesign"
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="project-description"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Description
                </label>
                <textarea
                  id="project-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={isPending}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  placeholder="Optional project summary"
                />
              </div>

              {error ? (
                <p
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isPending}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !name.trim()}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {isPending ? "Creating…" : "Create project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={projectToDelete !== null}
        title="Soft-delete this project?"
        message="The project leaves Active and Completed views immediately. Only a Super PM can restore it. After 30 days it is permanently purged to the Purged Project Register."
        confirmLabel="Soft-delete"
        isPending={isDeletingProject}
        onCancel={() => {
          if (!isDeletingProject) setProjectToDelete(null);
        }}
        onConfirm={handleDeleteProject}
      />

      <ConfirmDialog
        open={projectToComplete !== null}
        title="Move to Completed Projects?"
        message="The project leaves the Active landing page. Tasks, issues, and history remain. A five-year retention clock starts from this labelling instant."
        confirmLabel="Move to Completed"
        isPending={isCompleting}
        onCancel={() => {
          if (!isCompleting) setProjectToComplete(null);
        }}
        onConfirm={handleCompleteProject}
      />
    </section>
  );
}
