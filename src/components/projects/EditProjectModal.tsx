"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";

import {
  listAssignableProjectManagers,
  type CandidatePmDto,
} from "@/src/lib/actions/users";
import {
  listDirectoryUsers,
  reassignProjectOwner,
  updateProject,
  type ProjectMemberUser,
} from "@/src/lib/actions/projects";
import { getRoleLabel } from "@/src/lib/role-labels";
import type { Project } from "@/src/lib/types";

type EditProjectModalProps = {
  open: boolean;
  project: Project;
  memberUsers: ProjectMemberUser[];
  /** When true (Super PM), an owner select is shown among approved PMs. */
  canReassignOwner?: boolean;
  onClose: () => void;
  onSaved: (payload: {
    project: Project;
    memberUsers: ProjectMemberUser[];
  }) => void;
};

export default function EditProjectModal({
  open,
  project,
  memberUsers,
  canReassignOwner = false,
  onClose,
  onSaved,
}: EditProjectModalProps) {
  const [name, setName] = useState(project.name);
  const [customProjectId, setCustomProjectId] = useState(
    project.customProjectId ?? "",
  );
  const [description, setDescription] = useState(project.description);
  const [ownerId, setOwnerId] = useState(project.ownerId);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    memberUsers.map((member) => member.id),
  );
  const [directory, setDirectory] = useState<ProjectMemberUser[]>([]);
  const [candidatePms, setCandidatePms] = useState<CandidatePmDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setCustomProjectId(project.customProjectId ?? "");
    setDescription(project.description);
    setOwnerId(project.ownerId);
    setSelectedIds(memberUsers.map((member) => member.id));
    setError(null);
    void listDirectoryUsers().then((result) => {
      if (result.success) setDirectory(result.data);
    });
    if (canReassignOwner) {
      void listAssignableProjectManagers().then((result) => {
        if (result.success) setCandidatePms(result.data);
      });
    } else {
      setCandidatePms([]);
    }
  }, [open, project, memberUsers, canReassignOwner]);

  if (!open) return null;

  function toggleMember(userId: string) {
    if (userId === ownerId) return;
    setSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      let latestProject = project;
      let latestMembers = memberUsers;

      if (canReassignOwner && ownerId !== project.ownerId) {
        const ownership = await reassignProjectOwner({
          projectId: project.id,
          newOwnerId: ownerId,
        });
        if (!ownership.success) {
          setError(ownership.error);
          return;
        }
        latestProject = ownership.data.project;
        latestMembers = ownership.data.memberUsers;
      }

      const rosterIds = [
        ...new Set([
          canReassignOwner ? ownerId : latestProject.ownerId,
          ...selectedIds,
        ]),
      ];

      const result = await updateProject({
        projectId: project.id,
        name,
        customProjectId,
        description,
        memberUserIds: rosterIds,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSaved(result.data);
      onClose();
    });
  }

  const ownerOptions =
    candidatePms.length > 0
      ? candidatePms
      : directory
          .filter((user) => user.id === project.ownerId)
          .map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            globalRole: "pm" as const,
          }));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/60 px-4"
      role="presentation"
      onClick={isPending ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-project-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="edit-project-title"
          className="shrink-0 px-6 pt-6 text-lg font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Edit project
        </h2>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleSubmit}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isPending}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                required
              />
            </label>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Custom Project ID
              <input
                value={customProjectId ?? ""}
                onChange={(event) => setCustomProjectId(event.target.value)}
                disabled={isPending}
                maxLength={80}
                placeholder="Optional — e.g. CAPEX-2026-014"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-950"
                autoComplete="off"
              />
              <span className="mt-1 block text-xs font-normal text-zinc-500">
                Optional. Leave blank if you do not use an external project code.
              </span>
            </label>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isPending}
                rows={3}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              />
            </label>

            {canReassignOwner ? (
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Project owner (PM)
                <select
                  value={ownerId}
                  onChange={(event) => {
                    const nextOwner = event.target.value;
                    setOwnerId(nextOwner);
                    setSelectedIds((current) =>
                      current.includes(nextOwner)
                        ? current
                        : [...current, nextOwner],
                    );
                  }}
                  disabled={isPending}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                >
                  {ownerOptions.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name} ({pm.email}) · {getRoleLabel(pm.globalRole)}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-zinc-500">
                  Only a Super PM may change the designated PM. The new owner is
                  notified by email.
                </span>
              </label>
            ) : null}

            <fieldset>
              <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Team roster
              </legend>
              <p className="mt-1 text-xs text-zinc-500">
                The project owner always remains on the roster. Super PMs can also
                grant Viewers across many projects under Settings → Viewer project
                visibility.
              </p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                {directory.map((user) => {
                  const checked = selectedIds.includes(user.id);
                  const isOwner = user.id === ownerId;
                  return (
                    <li key={user.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
                        <input
                          type="checkbox"
                          checked={checked || isOwner}
                          disabled={isOwner || isPending}
                          onChange={() => toggleMember(user.id)}
                        />
                        <span className="min-w-0 truncate">
                          {user.name}
                          <span className="ml-1 text-xs text-zinc-500">
                            {user.email}
                            {isOwner ? " · Owner" : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            {error ? (
              <p className="text-sm text-red-700 dark:text-red-300" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-200 bg-white px-6 py-4 dark:border-zinc-700 dark:bg-zinc-900">
            <button
              type="button"
              disabled={isPending}
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            >
              {isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
