"use client";

import Link from "next/link";

import {
  PALETTE,
} from "@/src/components/analytics/charts";
import {
  Panel,
  ProgressTrack,
  TABLE_HEAD,
  TABLE_ROW,
} from "@/src/components/analytics/panel";
import PunctualityScoreTip from "@/src/components/schedule/PunctualityScoreTip";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import type { PmComparisonRow } from "@/src/lib/analytics/portfolio";
import { formatScore2 } from "@/src/lib/analytics/weighted-progress";

export default function PmComparison({
  rows,
  canOpenPmView,
}: {
  rows: PmComparisonRow[];
  canOpenPmView: boolean;
}) {
  return (
    <Panel title="Comparison by PM" bodyClassName="overflow-x-auto">
      <p className="px-5 pt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        Each PM’s projects are pooled the same way as the portfolio, so a task
        counts by its planned working days. The lowest punctuality is listed
        first.
      </p>
      <table className="mt-3 min-w-full text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-5 py-2 font-semibold">PM</th>
            <th className="px-3 py-2 text-right font-semibold">Projects</th>
            <th className="px-3 py-2 text-right font-semibold">Tasks</th>
            <th className="px-3 py-2 text-right font-semibold">
              <PunctualityScoreTip className="ml-auto inline-flex cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                Punctuality
              </PunctualityScoreTip>
            </th>
            <th className="min-w-[14rem] px-3 py-2 font-semibold">
              Actual and target
            </th>
            <th className="px-3 py-2 text-right font-semibold">Overdue tasks</th>
            <th className="px-3 py-2 text-right font-semibold">
              Critical issues
            </th>
            <th className="px-5 py-2 font-semibold">Status flag</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {rows.map((row) => (
            <tr key={row.pmId} className={TABLE_ROW}>
              <td className="px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-50">
                {canOpenPmView ? (
                  <Link
                    href={`/portfolio?scope=pm&pm=${row.pmId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {row.pmName}
                  </Link>
                ) : (
                  row.pmName
                )}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                {row.projectCount}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                {row.taskCount}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {formatScore2(row.ps)}
              </td>
              <td className="px-3 py-2.5">
                <div className="space-y-1">
                  <ProgressTrack
                    label="Actual"
                    value={row.pActual}
                    colour={PALETTE.actual}
                  />
                  <ProgressTrack
                    label="Target"
                    value={row.pTarget}
                    colour={PALETTE.reference}
                  />
                </div>
              </td>
              <td
                className={`px-3 py-2.5 text-right tabular-nums ${
                  row.overdueTasks > 0
                    ? "font-medium text-amber-700 dark:text-amber-300"
                    : "text-zinc-700 dark:text-zinc-200"
                }`}
              >
                {row.overdueTasks}
              </td>
              <td
                className={`px-3 py-2.5 text-right tabular-nums ${
                  row.criticalIssues > 0
                    ? "font-medium text-rose-700 dark:text-rose-300"
                    : "text-zinc-700 dark:text-zinc-200"
                }`}
              >
                {row.criticalIssues}
              </td>
              <td className="px-5 py-2.5">
                <StatusFlagBadge
                  flag={row.statusFlag}
                  className="whitespace-nowrap"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
