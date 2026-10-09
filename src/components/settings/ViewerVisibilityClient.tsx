"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/src/components/providers/ToastProvider";
import SettingsPageHeader from "@/src/components/settings/SettingsPageHeader";
import {
  listViewerProjectGrants,
  setViewerProjectVisibilityMode,
  syncViewerProjectGrants,
  type ViewerDirectoryRow,
  type ViewerGrantProjectRow,
} from "@/src/lib/actions/viewer-visibility";
import type { ProjectVisibilityMode } from "@/src/lib/types";

type ViewerVisibilityClientProps = {
  initialViewers: ViewerDirectoryRow[];
};

export default function ViewerVisibilityClient({
  initialViewers,
}: ViewerVisibilityClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [viewers, setViewers] = useState(initialViewers);
  const [viewerQuery, setViewerQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [selectedViewerId, setSelectedViewerId] = useState<string | null>(
    initialViewers[0]?.id ?? null,
  );
  const [projects, setProjects] = useState<ViewerGrantProjectRow[]>([]);
  const [draftGrantedIds, setDraftGrantedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [baselineGrantedIds, setBaselineGrantedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filteredViewers = useMemo(() => {
    const needle = viewerQuery.trim().toLowerCase();
    if (!needle) return viewers;
    return viewers.filter(
      (viewer) =>
        viewer.name.toLowerCase().includes(needle) ||
        viewer.email.toLowerCase().includes(needle),
    );
  }, [viewerQuery, viewers]);

  const filteredProjects = useMemo(() => {
    const needle = projectQuery.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(needle) ||
        project.ownerName.toLowerCase().includes(needle) ||
        project.ownerEmail.toLowerCase().includes(needle),
    );
  }, [projectQuery, projects]);

  const dirty = useMemo(() => {
    if (draftGrantedIds.size !== baselineGrantedIds.size) return true;
    for (const id of draftGrantedIds) {
      if (!baselineGrantedIds.has(id)) return true;
    }
    return false;
  }, [baselineGrantedIds, draftGrantedIds]);

  const selectedViewer =
    viewers.find((viewer) => viewer.id === selectedViewerId) ?? null;

  useEffect(() => {
    if (!selectedViewerId) {
      setProjects([]);
      setDraftGrantedIds(new Set());
      setBaselineGrantedIds(new Set());
      return;
    }

    let cancelled = false;
    setLoadingProjects(true);
    void listViewerProjectGrants(selectedViewerId).then((result) => {
      if (cancelled) return;
      setLoadingProjects(false);
      if (!result.success) {
        showToast(result.error, "error");
        setProjects([]);
        setDraftGrantedIds(new Set());
        setBaselineGrantedIds(new Set());
        return;
      }
      setProjects(result.data);
      const granted = new Set(
        result.data.filter((row) => row.granted).map((row) => row.id),
      );
      setDraftGrantedIds(granted);
      setBaselineGrantedIds(new Set(granted));
      setProjectQuery("");
    });

    return () => {
      cancelled = true;
    };
  }, [selectedViewerId, showToast]);

  function toggleProject(projectId: string) {
    setDraftGrantedIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function selectAllFiltered() {
    setDraftGrantedIds((current) => {
      const next = new Set(current);
      for (const project of filteredProjects) next.add(project.id);
      return next;
    });
  }

  function clearAllFiltered() {
    setDraftGrantedIds((current) => {
      const next = new Set(current);
      for (const project of filteredProjects) next.delete(project.id);
      return next;
    });
  }

  function handleMode(mode: ProjectVisibilityMode) {
    if (!selectedViewer || selectedViewer.projectVisibilityMode === mode) return;
    const viewerId = selectedViewer.id;
    startTransition(async () => {
      const result = await setViewerProjectVisibilityMode({
        viewerUserId: viewerId,
        mode,
      });
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      setViewers((current) =>
        current.map((viewer) =>
          viewer.id === viewerId
            ? { ...viewer, projectVisibilityMode: mode }
            : viewer,
        ),
      );
      showToast(
        mode === "ALL_ACTIVE"
          ? "This Viewer can now open every Active project."
          : "This Viewer is limited to the selected projects.",
        "success",
      );
      router.refresh();
    });
  }

  function handleSave() {
    if (!selectedViewerId || !dirty) return;
    startTransition(async () => {
      const result = await syncViewerProjectGrants({
        viewerUserId: selectedViewerId,
        projectIds: [...draftGrantedIds],
      });
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      setBaselineGrantedIds(new Set(draftGrantedIds));
      setProjects((current) =>
        current.map((row) => ({
          ...row,
          granted: draftGrantedIds.has(row.id),
        })),
      );
      setViewers((current) =>
        current.map((viewer) =>
          viewer.id === selectedViewerId
            ? {
                ...viewer,
                grantedActiveCount: result.data.grantedActiveCount,
              }
            : viewer,
        ),
      );
      showToast(
        `Visibility updated · ${result.data.grantedActiveCount} Active project${
          result.data.grantedActiveCount === 1 ? "" : "s"
        } granted.`,
        "success",
      );
      router.refresh();
    });
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <SettingsPageHeader
        current="Viewer visibility"
        title="Viewer project visibility"
        description="Choose whether a Viewer opens a saved list of Active projects, or every Active project. Access stays read-only. Dashboard ticks are set separately under Users and privileges."
      />

      {viewers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
          No approved Viewer accounts yet. Approve or provision a Viewer under
          Users &amp; privileges, then return here to grant projects.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 p-3 dark:border-zinc-700">
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Find Viewer
                <input
                  type="search"
                  value={viewerQuery}
                  onChange={(event) => setViewerQuery(event.target.value)}
                  placeholder="Name or email"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
                />
              </label>
            </div>
            <ul className="max-h-[28rem] overflow-y-auto p-2" role="listbox">
              {filteredViewers.map((viewer) => {
                const selected = viewer.id === selectedViewerId;
                return (
                  <li key={viewer.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={isPending && dirty && selected}
                      onClick={() => {
                        if (dirty && selectedViewerId !== viewer.id) {
                          const leave = window.confirm(
                            "You have unsaved visibility changes. Discard them?",
                          );
                          if (!leave) return;
                        }
                        setSelectedViewerId(viewer.id);
                      }}
                      className={[
                        "flex w-full flex-col rounded-lg px-3 py-2 text-left transition",
                        selected
                          ? "bg-slate-100 dark:bg-slate-800/70"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                      ].join(" ")}
                    >
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {viewer.name}
                      </span>
                      <span className="truncate text-[11px] text-zinc-500">
                        {viewer.email}
                      </span>
                      <span className="mt-0.5 text-[11px] text-zinc-500">
                        {viewer.projectVisibilityMode === "ALL_ACTIVE"
                          ? "All Active projects"
                          : `${viewer.grantedActiveCount} Active project${
                              viewer.grantedActiveCount === 1 ? "" : "s"
                            }`}
                      </span>
                    </button>
                  </li>
                );
              })}
              {filteredViewers.length === 0 ? (
                <li className="px-3 py-4 text-sm text-zinc-500">
                  No Viewer matches that search.
                </li>
              ) : null}
            </ul>
          </aside>

          <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
            {!selectedViewer ? (
              <p className="px-4 py-10 text-center text-sm text-zinc-500">
                Select a Viewer to manage their project list.
              </p>
            ) : (
              <>
                <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Which Active projects
                  </p>
                  <div
                    role="radiogroup"
                    aria-label="Viewer project visibility mode"
                    className="mt-2 inline-flex flex-wrap gap-0.5 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-950/70"
                  >
                    {(
                      [
                        ["SELECTED", "Selected projects"],
                        ["ALL_ACTIVE", "All Active projects"],
                      ] as const
                    ).map(([mode, label]) => {
                      const selected =
                        selectedViewer.projectVisibilityMode === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={isPending}
                          onClick={() => handleMode(mode)}
                          className={[
                            "rounded-lg px-3 py-1.5 text-sm font-semibold transition-[color,background-color,box-shadow] duration-150",
                            selected
                              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-white/10"
                              : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100",
                          ].join(" ")}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 max-w-xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {selectedViewer.projectVisibilityMode === "ALL_ACTIVE"
                      ? "This Viewer can open every Active project. Completed and deleted projects stay off the list. The checklist below is kept and applies again on Selected projects."
                      : "This Viewer opens only the ticked Active projects. An owning PM can still add or remove them on one project from Edit Project."}
                  </p>
                </div>

                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-700">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {selectedViewer.name}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {selectedViewer.email}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {draftGrantedIds.size} of {projects.length} Active
                      project{projects.length === 1 ? "" : "s"} selected
                      {dirty ? " · unsaved changes" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!dirty || isPending || loadingProjects}
                    onClick={handleSave}
                    className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    {isPending ? "Saving…" : "Save visibility"}
                  </button>
                </div>

                <div className="flex flex-wrap items-end gap-2 border-b border-zinc-200 p-3 dark:border-zinc-700">
                  <label className="min-w-[12rem] flex-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Filter projects
                    <input
                      type="search"
                      value={projectQuery}
                      onChange={(event) => setProjectQuery(event.target.value)}
                      placeholder="Project or owning PM"
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={loadingProjects || isPending || projects.length === 0}
                    onClick={selectAllFiltered}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Select filtered
                  </button>
                  <button
                    type="button"
                    disabled={loadingProjects || isPending || projects.length === 0}
                    onClick={clearAllFiltered}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Clear filtered
                  </button>
                </div>

                {loadingProjects ? (
                  <p className="px-4 py-8 text-sm text-zinc-500">
                    Loading Active projects…
                  </p>
                ) : projects.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-zinc-500">
                    There are no Active projects to grant yet.
                  </p>
                ) : (
                  <ul className="max-h-[28rem] divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
                    {filteredProjects.map((project) => {
                      const checked = draftGrantedIds.has(project.id);
                      return (
                        <li key={project.id}>
                          <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isPending}
                              onChange={() => toggleProject(project.id)}
                              className="mt-1"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                {project.name}
                              </span>
                              <span className="block text-[11px] text-zinc-500">
                                Owner: {project.ownerName} · {project.ownerEmail}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                    {filteredProjects.length === 0 ? (
                      <li className="px-4 py-6 text-sm text-zinc-500">
                        No projects match that filter.
                      </li>
                    ) : null}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Dashboard access (the Analytics tab, and later the portfolio page) is
        set under Users and privileges. This page only chooses which projects
        a Viewer may open. Access remains read-only.
      </p>
    </section>
  );
}
