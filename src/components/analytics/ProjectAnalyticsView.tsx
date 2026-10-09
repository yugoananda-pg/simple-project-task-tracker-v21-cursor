"use client";

import { useMemo } from "react";
import { CalendarClock, Lightbulb } from "lucide-react";

import {
  ChartCard,
  Panel,
  ProgressTrack,
  SectionHeading,
  TABLE_HEAD,
  TABLE_ROW,
} from "@/src/components/analytics/panel";
import { PALETTE, TrendChart, type TrendSeries } from "@/src/components/analytics/charts";
import IssueIntelligencePane from "@/src/components/analytics/IssueIntelligencePane";
import ScheduleComposition from "@/src/components/analytics/ScheduleComposition";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import ProjectNote from "@/src/components/analytics/ProjectNote";
import type { IssueIntelActivity } from "@/src/lib/analytics/issue-intelligence";
import { buildIssueIntelligence } from "@/src/lib/analytics/issue-intelligence";
import { buildProjectInsights } from "@/src/lib/analytics/insights";
import {
  buildScheduleSeries,
  milestoneVarianceDays,
  milestoneVarianceLabel,
  type ProgressEventPoint,
} from "@/src/lib/analytics/schedule-series";
import {
  computeProjectScheduleHealth,
  formatPercent1,
  resolveHolidaySet,
} from "@/src/lib/analytics/weighted-progress";
import { formatAuDate } from "@/src/lib/gantt/date-utils";
import { toLocalDateString } from "@/src/lib/task-defaults";
import type { Issue, Milestone, Task } from "@/src/lib/types";

const S_CURVE_SERIES: readonly TrendSeries[] = [
  { key: "target", name: "Target", colour: PALETTE.reference, dashed: true },
  { key: "actual", name: "Actual", colour: PALETTE.actual, filled: true },
];
const BURN_DOWN_SERIES: readonly TrendSeries[] = [
  { key: "remainingDays", name: "Remaining", colour: PALETTE.taskRemaining, filled: true },
  { key: "idealRemainingDays", name: "Ideal", colour: PALETTE.reference, dashed: true },
];

export type ProjectAnalyticsViewProps = {
  projectId: string;
  tasks: Task[];
  issues: Issue[];
  milestones: Milestone[];
  holidayDateKeys: string[];
  events: ProgressEventPoint[];
  activities: IssueIntelActivity[];
  noteHtml: string;
  noteUpdatedAt: string | null;
  noteUpdatedByName: string | null;
  canEditNote: boolean;
  chartsVisible?: boolean;
  onOpenIssueLog: () => void;
  onOpenIssue: (issueId: string) => void;
};

export default function ProjectAnalyticsView({
  projectId,
  tasks,
  issues,
  milestones,
  holidayDateKeys,
  events,
  activities,
  noteHtml,
  noteUpdatedAt,
  noteUpdatedByName,
  canEditNote,
  chartsVisible = true,
  onOpenIssueLog,
  onOpenIssue,
}: ProjectAnalyticsViewProps) {
  const today = toLocalDateString();
  const health = useMemo(
    () => computeProjectScheduleHealth(tasks, holidayDateKeys, today),
    [tasks, holidayDateKeys, today],
  );
  const series = useMemo(
    () =>
      buildScheduleSeries({
        tasks,
        events,
        holidayKeys: holidayDateKeys,
        today,
      }),
    [tasks, events, holidayDateKeys, today],
  );
  const intel = useMemo(
    () =>
      buildIssueIntelligence({
        issues: issues.map((issue) => ({
          id: issue.id,
          issueNumber: issue.issueNumber,
          displayId: issue.displayId,
          status: issue.status,
          severity: issue.severity,
          category: issue.category,
          progress: issue.progress,
          picName: issue.picName,
          updatedStartDate: issue.updatedStartDate,
          updatedDueDate: issue.updatedDueDate,
          actualStartDate: issue.actualStartDate,
          actualResolutionDate: issue.actualResolutionDate,
          raisedAt: issue.raisedAt,
          updatedAt: issue.updatedAt,
        })),
        activities,
        holidayKeys: holidayDateKeys,
        today,
      }),
    [issues, activities, holidayDateKeys, today],
  );
  const insights = useMemo(
    () =>
      buildProjectInsights({
        taskCount: tasks.length,
        projectPs: health.projectPs,
        delta: health.delta,
        statusFlag: health.statusFlag,
        pActual: health.pActualProject,
        pTarget: health.pTargetProject,
        issues: intel,
      }),
    [tasks.length, health, intel],
  );
  const holidays = useMemo(
    () => resolveHolidaySet(holidayDateKeys),
    [holidayDateKeys],
  );
  const latest = useMemo(() => {
    for (let index = series.points.length - 1; index >= 0; index -= 1) {
      if (series.points[index].actual != null) return series.points[index];
    }
    return undefined;
  }, [series.points]);
  const sortedMilestones = useMemo(
    () =>
      [...milestones].sort((a, b) =>
        a.updatedTarget.localeCompare(b.updatedTarget),
      ),
    [milestones],
  );
  const deltaTone =
    health.delta >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

  return (
    <div className="space-y-12">
      <section aria-labelledby="schedule-intelligence-heading" className="space-y-5">
        <SectionHeading
          id="schedule-intelligence-heading"
          icon={CalendarClock}
          title="Schedule Intelligence"
          description="Task weights only. Issue work is reported in the pane below and does not move these figures."
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sptt-card sptt-card-lift px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Project punctuality
            </p>
            <p className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
              {formatPercent1(health.projectPs)}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Actual progress as a share of target
            </p>
          </div>
          <div className="sptt-card sptt-card-lift px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Actual minus target
            </p>
            <p
              className={`mt-1.5 text-3xl font-semibold tabular-nums tracking-tight ${deltaTone}`}
            >
              {formatPercent1(health.delta)}
            </p>
            <div className="mt-2 space-y-1">
              <ProgressTrack
                label="Actual"
                value={health.pActualProject}
                colour={PALETTE.actual}
              />
              <ProgressTrack
                label="Target"
                value={health.pTargetProject}
                colour={PALETTE.reference}
              />
            </div>
          </div>
          <div className="sptt-card sptt-card-lift px-5 py-4 sm:col-span-2 lg:col-span-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Status flag
            </p>
            <div className="mt-3">
              <StatusFlagBadge
                flag={health.statusFlag}
                className="px-2.5 py-1 text-xs"
              />
            </div>
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              {tasks.length === 1 ? "1 task" : `${tasks.length} tasks`} weighted by planned working days
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ProjectNote
            projectId={projectId}
            html={noteHtml}
            updatedAt={noteUpdatedAt}
            updatedByName={noteUpdatedByName}
            canEdit={canEditNote}
            className="lg:col-span-2"
          />
          <Panel title="Key takeaways">
            <ul className="space-y-3 px-5 py-4">
              {insights.map((insight) => (
                <li
                  key={insight.id}
                  className="flex gap-2.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200"
                >
                  <Lightbulb
                    className="mt-0.5 size-4 shrink-0 text-amber-500"
                    aria-hidden
                  />
                  <span>{insight.text}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {chartsVisible ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Schedule S-Curve"
              summary={
                (latest
                  ? `On ${formatAuDate(latest.date)}, target is ${formatPercent1(latest.target)} and actual is ${formatPercent1(latest.actual ?? 0)}.`
                  : "Add task dates to plot the schedule curve.") +
                (series.usesBackfill
                  ? " Earlier actuals include an approximation from actual dates, labelled where history was not yet recorded."
                  : "")
              }
            >
              <TrendChart data={series.points} series={S_CURVE_SERIES} percent />
            </ChartCard>
            <ChartCard
              title="Task burn-down"
              summary={
                latest
                  ? `Remaining effort on ${formatAuDate(latest.date)} is ${latest.remainingDays?.toFixed(1) ?? "—"} working days. The ideal line on that date is ${latest.idealRemainingDays.toFixed(1)}.`
                  : "Add task dates to plot remaining effort."
              }
            >
              <TrendChart data={series.points} series={BURN_DOWN_SERIES} />
            </ChartCard>
          </div>
        ) : null}

        <ScheduleComposition
          tasks={tasks}
          holidayDateKeys={holidayDateKeys}
          today={today}
          chartsVisible={chartsVisible}
        >
          <Panel title="Milestones" bodyClassName="overflow-x-auto">
          {sortedMilestones.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-500 dark:text-zinc-400">
              No milestones on this project yet.
            </p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className="px-5 py-2 font-semibold">Name</th>
                  <th className="px-5 py-2 font-semibold">Target</th>
                  <th className="px-5 py-2 font-semibold">Achieved</th>
                  <th className="px-5 py-2 font-semibold">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {sortedMilestones.map((milestone) => {
                  const variance = milestoneVarianceDays(
                    milestone.updatedTarget,
                    milestone.actualAchieved,
                    holidays,
                  );
                  const varianceLabel = milestoneVarianceLabel(variance);
                  const varianceTone =
                    variance == null || variance === 0
                      ? "text-zinc-700 dark:text-zinc-200"
                      : variance > 0
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-emerald-700 dark:text-emerald-300";
                  return (
                    <tr key={milestone.id} className={TABLE_ROW}>
                      <td className="px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-50">
                        {milestone.name}
                      </td>
                      <td className="px-5 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                        {formatAuDate(milestone.updatedTarget)}
                      </td>
                      <td className="px-5 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                        {milestone.actualAchieved
                          ? formatAuDate(milestone.actualAchieved)
                          : "—"}
                      </td>
                      <td className={`px-5 py-2.5 ${varianceTone}`}>
                        {varianceLabel}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          </Panel>
        </ScheduleComposition>
      </section>

      <IssueIntelligencePane
        intel={intel}
        chartsVisible={chartsVisible}
        onOpenIssueLog={onOpenIssueLog}
        onOpenIssue={onOpenIssue}
      />
    </div>
  );
}
