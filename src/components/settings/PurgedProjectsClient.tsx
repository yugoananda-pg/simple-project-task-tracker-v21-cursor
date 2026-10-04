"use client";

import SettingsPageHeader from "@/src/components/settings/SettingsPageHeader";
import type { PurgedProjectSummary } from "@/src/lib/types";

type PurgedProjectsClientProps = {
  initialRows: PurgedProjectSummary[];
};

function formatAu(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function triggerLabel(trigger: PurgedProjectSummary["purgeTrigger"]): string {
  switch (trigger) {
    case "SUPER_PM_MANUAL":
      return "Manual (Super PM)";
    case "SOFT_DELETE_RETENTION_EXPIRED":
      return "Soft-delete expired";
    case "COMPLETED_RETENTION_EXPIRED":
      return "Completed retention expired";
    default:
      return trigger;
  }
}

export default function PurgedProjectsClient({
  initialRows,
}: PurgedProjectsClientProps) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <SettingsPageHeader
        current="Purged Project Register"
        title="Purged Project Register"
        description="Append-only tombstones written before operational rows are physically removed. These records cannot be restored into the live graph."
      />

      {initialRows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No purged projects yet.
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Counts</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Purged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
              {initialRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      {row.name}
                    </p>
                    <p className="font-mono text-[11px] text-zinc-400">
                      {row.originalProjectId}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.ownerName}
                    <br />
                    <span className="text-zinc-500">{row.ownerEmail}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {row.taskCount === 1 ? "1 task" : `${row.taskCount} tasks`} ·{" "}
                    {row.issueCount === 1
                      ? "1 issue"
                      : `${row.issueCount} issues`}{" "}
                    ·{" "}
                    {row.milestoneCount === 1
                      ? "1 milestone"
                      : `${row.milestoneCount} milestones`}{" "}
                    ·{" "}
                    {row.memberCount === 1
                      ? "1 member"
                      : `${row.memberCount} members`}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {triggerLabel(row.purgeTrigger)}
                    {row.purgeReason ? (
                      <p className="mt-1 text-zinc-500">{row.purgeReason}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {formatAu(row.purgedAt)}
                    <br />
                    <span className="text-zinc-500">
                      by {row.purgedByName}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
