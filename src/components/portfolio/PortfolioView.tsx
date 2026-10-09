"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  CalendarRange,
  ChevronDown,
  Lightbulb,
  Users,
} from "lucide-react";

import {
  ChartCard,
  Panel,
  ProgressTrack,
  SectionHeading,
  TABLE_HEAD,
  TABLE_ROW,
} from "@/src/components/analytics/panel";
import {
  PALETTE,
  TrendChart,
  type TrendSeries,
} from "@/src/components/analytics/charts";
import IssueIntelligencePane from "@/src/components/analytics/IssueIntelligencePane";
import ReportNote from "@/src/components/analytics/ReportNote";
import ScheduleComposition from "@/src/components/analytics/ScheduleComposition";
import MacroTimeline, { MacroLegend } from "@/src/components/portfolio/MacroTimeline";
import PmComparison from "@/src/components/portfolio/PmComparison";
import { buildIssueIntelligence } from "@/src/lib/analytics/issue-intelligence";
import {
  buildMacroAxis,
  buildMacroRows,
  buildPmComparison,
  buildPortfolioInsights,
} from "@/src/lib/analytics/portfolio";
import {
  buildScheduleSeries,
  milestoneVarianceLabel,
} from "@/src/lib/analytics/schedule-series";
import {
  computeProjectScheduleHealth,
  formatPercent1,
} from "@/src/lib/analytics/weighted-progress";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import { formatAuDate } from "@/src/lib/gantt/date-utils";
import { savePortfolioNote, type PortfolioDto } from "@/src/lib/actions/portfolio";
import { toLocalDateString } from "@/src/lib/task-defaults";

const S_CURVE_SERIES: readonly TrendSeries[] = [
  { key: "target", name: "Target", colour: PALETTE.reference, dashed: true },
  { key: "actual", name: "Actual", colour: PALETTE.actual, filled: true },
];
const BURN_DOWN_SERIES: readonly TrendSeries[] = [
  { key: "remainingDays", name: "Remaining", colour: PALETTE.taskRemaining, filled: true },
  { key: "idealRemainingDays", name: "Ideal", colour: PALETTE.reference, dashed: true },
];

const STATE_TONE = {
  early: "text-emerald-700 dark:text-emerald-300",
  ontime: "text-zinc-700 dark:text-zinc-200",
  late: "text-amber-700 dark:text-amber-300",
  overdue: "text-rose-700 dark:text-rose-300",
  upcoming: "text-zinc-700 dark:text-zinc-200",
} as const;

function Kpi({
  label,
  value,
  hint,
  tone,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="sptt-card sptt-card-lift px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-1.5 text-3xl font-semibold tabular-nums tracking-tight ${tone ?? "text-zinc-900 dark:text-zinc-50"}`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
      {children}
    </div>
  );
}

function ProjectFilter({
  projects,
  selected,
  onChange,
}: {
  projects: PortfolioDto["projects"];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const everything = selected.size === projects.length;
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        {everything
          ? `All ${projects.length} projects`
          : `${selected.size} of ${projects.length} projects`}
        <ChevronDown
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="group"
          aria-label="Projects to compare"
          className="absolute left-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Compare projects
            </p>
            <div className="flex gap-3 text-xs font-semibold">
              <button
                type="button"
                onClick={() => onChange(new Set(projects.map((p) => p.id)))}
                className="text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
              >
                Select all
              </button>
            </div>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {projects.map((project) => {
              const checked = selected.has(project.id);
              return (
                <li key={project.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                    <input
                      type="checkbox"
                      checked={checked}
                      // The last project stays ticked so the page always has something to show.
                      disabled={checked && selected.size === 1}
                      onChange={() => {
                        const next = new Set(selected);
                        if (checked) next.delete(project.id);
                        else next.add(project.id);
                        onChange(next);
                      }}
                      className="mt-0.5 size-4 rounded border-zinc-300"
                    />
                    <span className="min-w-0 text-sm text-zinc-800 dark:text-zinc-100">
                      <span className="block truncate">{project.name}</span>
                      <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                        {project.ownerName}
                        {project.lifecycleStatus === "COMPLETED"
                          ? " · Completed"
                          : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function PortfolioView({ dto }: { dto: PortfolioDto }) {
  const today = toLocalDateString();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(dto.projects.map((project) => project.id)),
  );

  const filtered = selected.size !== dto.projects.length;
  const projects = useMemo(
    () => dto.projects.filter((project) => selected.has(project.id)),
    [dto.projects, selected],
  );
  const tasks = useMemo(
    () => dto.tasks.filter((task) => selected.has(task.projectId)),
    [dto.tasks, selected],
  );
  const milestones = useMemo(
    () => dto.milestones.filter((row) => selected.has(row.projectId)),
    [dto.milestones, selected],
  );
  const issues = useMemo(
    () => dto.issues.filter((row) => selected.has(row.projectId)),
    [dto.issues, selected],
  );
  const issueIds = useMemo(() => new Set(issues.map((row) => row.id)), [issues]);
  const activities = useMemo(
    () => dto.activities.filter((row) => issueIds.has(row.issueId)),
    [dto.activities, issueIds],
  );
  const projectNameById = useMemo(
    () => new Map(dto.projects.map((project) => [project.id, project.name])),
    [dto.projects],
  );
  const compositionTasks = useMemo(
    () =>
      tasks.map((task) => ({
        ...task,
        projectName: projectNameById.get(task.projectId),
      })),
    [tasks, projectNameById],
  );

  const rows = useMemo(
    () =>
      buildMacroRows({
        projects,
        tasks,
        milestones,
        issues,
        holidayKeys: dto.holidayDateKeys,
        today,
      }),
    [projects, tasks, milestones, issues, dto.holidayDateKeys, today],
  );
  const axis = useMemo(() => buildMacroAxis(rows, today), [rows, today]);
  const health = useMemo(
    () => computeProjectScheduleHealth(tasks, dto.holidayDateKeys, today),
    [tasks, dto.holidayDateKeys, today],
  );
  const series = useMemo(
    () =>
      buildScheduleSeries({
        tasks,
        events: dto.events,
        holidayKeys: dto.holidayDateKeys,
        today,
      }),
    [tasks, dto.events, dto.holidayDateKeys, today],
  );
  const intel = useMemo(
    () =>
      buildIssueIntelligence({
        issues,
        activities,
        holidayKeys: dto.holidayDateKeys,
        today,
      }),
    [issues, activities, dto.holidayDateKeys, today],
  );
  const pmRows = useMemo(
    () =>
      buildPmComparison({
        rows,
        tasks,
        holidayKeys: dto.holidayDateKeys,
        today,
      }),
    [rows, tasks, dto.holidayDateKeys, today],
  );

  const scopeLabel =
    dto.scope === "all" ? "All projects" : (dto.pm?.name ?? "This PM");
  const insights = useMemo(
    () =>
      buildPortfolioInsights({
        scope: dto.scope,
        scopeLabel,
        rows,
        pmRows,
        taskCount: tasks.length,
        ps: health.projectPs,
        delta: health.delta,
        pActual: health.pActualProject,
        pTarget: health.pTargetProject,
        statusFlag: health.statusFlag,
        issues: intel,
        today,
      }),
    [dto.scope, scopeLabel, rows, pmRows, tasks.length, health, intel, today],
  );

  const latest = useMemo(() => {
    for (let index = series.points.length - 1; index >= 0; index -= 1) {
      if (series.points[index].actual != null) return series.points[index];
    }
    return undefined;
  }, [series.points]);

  const milestoneRows = useMemo(
    () =>
      rows
        .flatMap((row) =>
          row.milestones.map((milestone) => ({ ...milestone, project: row.name })),
        )
        .sort((a, b) => a.target.localeCompare(b.target)),
    [rows],
  );

  const overdueTotal = rows.reduce((sum, row) => sum + row.overdueTasks, 0);
  const completedCount = projects.filter(
    (project) => project.lifecycleStatus === "COMPLETED",
  ).length;
  const deltaTone =
    health.delta >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

  if (dto.projects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {dto.scope === "pm" && dto.pm
            ? `${dto.pm.name} has no projects you can see in this view.`
            : "No projects are in this view yet."}
        </p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          The portfolio only includes Active projects you are allowed to open.
          {dto.canIncludeCompleted && !dto.includeCompleted
            ? " Turn on Include Completed projects above to add finished work."
            : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {dto.scope === "all" && dto.projects.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <ProjectFilter
            projects={dto.projects}
            selected={selected}
            onChange={setSelected}
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {filtered
              ? "Every figure below uses only the ticked projects. The note stays with the whole scope."
              : "Tick fewer projects to compare them side by side."}
          </p>
        </div>
      ) : null}

      <section aria-labelledby="portfolio-overview-heading" className="space-y-5">
        <SectionHeading
          id="portfolio-overview-heading"
          icon={CalendarRange}
          title="Macro timeline"
          description="Three bars for each project: the initial plan, the current plan, and the work actually done. Diamonds are milestones. Hover or focus any bar or diamond for dates."
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi
            label="Projects"
            value={String(projects.length)}
            hint={
              completedCount > 0
                ? `${completedCount} Completed`
                : "All Active"
            }
          />
          <Kpi
            label="Portfolio punctuality"
            value={formatPercent1(health.projectPs)}
            hint="Actual progress as a share of target"
          />
          <Kpi
            label="Actual minus target"
            value={formatPercent1(health.delta)}
            tone={deltaTone}
          >
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
          </Kpi>
          <div className="sptt-card sptt-card-lift px-5 py-4">
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
              {tasks.length === 1 ? "1 task" : `${tasks.length} tasks`} weighted
              by planned working days
            </p>
          </div>
          <Kpi
            label="Overdue tasks"
            value={String(overdueTotal)}
            tone={
              overdueTotal > 0
                ? "text-amber-600 dark:text-amber-400"
                : undefined
            }
            hint="Past due and not Done"
          />
          <Kpi
            label="Active issues"
            value={String(rows.reduce((sum, row) => sum + row.activeIssues, 0))}
            tone={
              intel.criticalActive > 0
                ? "text-rose-600 dark:text-rose-400"
                : undefined
            }
            hint={`${intel.criticalActive} critical`}
          />
        </div>

        <div className="sptt-card overflow-hidden">
          <div className="border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800/80">
            <MacroLegend />
          </div>
          {axis ? (
            <MacroTimeline
              rows={rows}
              axis={axis}
              today={today}
              showOwner={dto.scope === "all"}
            />
          ) : (
            <p className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              None of these projects has dated tasks yet. Add task dates to draw
              the timeline.
            </p>
          )}
        </div>
      </section>

      {dto.scope === "all" && pmRows.length > 0 ? (
        <section aria-labelledby="pm-comparison-heading" className="space-y-5">
          <SectionHeading
            id="pm-comparison-heading"
            icon={Users}
            title="By PM"
            description="How each Project Manager’s projects compare. Open a PM to see that portfolio on its own."
          />
          <PmComparison rows={pmRows} canOpenPmView={dto.access.pm} />
        </section>
      ) : null}

      <section aria-labelledby="portfolio-schedule-heading" className="space-y-5">
        <SectionHeading
          id="portfolio-schedule-heading"
          icon={CalendarClock}
          title="Schedule Intelligence"
          description="Every task in this scope, weighted by planned working days. Issue work is reported in the pane below and does not move these figures."
        />

        <div className="grid gap-4 lg:grid-cols-3">
          <ReportNote
            key={dto.scope === "all" ? "all" : (dto.pm?.id ?? "pm")}
            className="lg:col-span-2"
            title={
              dto.scope === "all"
                ? "All projects note"
                : `${dto.pm?.name ?? "PM"} portfolio note`
            }
            emptyText={
              dto.scope === "all"
                ? "No commentary has been written for the whole portfolio."
                : "No commentary has been written for this PM’s portfolio."
            }
            editHint={
              dto.scope === "all"
                ? "Any Project Manager or Super PM may edit this note. The last save wins, and the page shows who saved it."
                : "This PM and any Super PM may edit this note. The last save wins, and the page shows who saved it."
            }
            html={dto.note.html}
            updatedAt={dto.note.updatedAt}
            updatedByName={dto.note.updatedByName}
            canEdit={dto.canEditNote}
            save={(html) =>
              savePortfolioNote(
                dto.scope === "all"
                  ? { scope: "all" }
                  : { scope: "pm", pmId: dto.pm?.id ?? "" },
                html,
              )
            }
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

        <ScheduleComposition
          tasks={compositionTasks}
          holidayDateKeys={dto.holidayDateKeys}
          today={today}
          chartsVisible
        >
          <Panel title="Milestones" bodyClassName="max-h-[28rem] overflow-auto">
            {milestoneRows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500 dark:text-zinc-400">
                No milestones are set on these projects yet.
              </p>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className={TABLE_HEAD}>
                  <tr>
                    <th className="px-5 py-2 font-semibold">Milestone</th>
                    <th className="px-5 py-2 font-semibold">Project</th>
                    <th className="px-5 py-2 font-semibold">Target</th>
                    <th className="px-5 py-2 font-semibold">Achieved</th>
                    <th className="px-5 py-2 font-semibold">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {milestoneRows.map((milestone) => (
                    <tr key={milestone.id} className={TABLE_ROW}>
                      <td className="px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-50">
                        {milestone.name}
                      </td>
                      <td className="px-5 py-2.5 text-zinc-700 dark:text-zinc-200">
                        {milestone.project}
                      </td>
                      <td className="px-5 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                        {formatAuDate(milestone.target)}
                      </td>
                      <td className="px-5 py-2.5 tabular-nums text-zinc-700 dark:text-zinc-200">
                        {milestone.achieved
                          ? formatAuDate(milestone.achieved)
                          : "—"}
                      </td>
                      <td
                        className={`px-5 py-2.5 ${STATE_TONE[milestone.state]}`}
                      >
                        {milestone.state === "overdue"
                          ? "Past target"
                          : milestone.state === "upcoming"
                            ? "Not yet due"
                            : milestoneVarianceLabel(milestone.varianceDays)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </ScheduleComposition>
      </section>

      <IssueIntelligencePane intel={intel} chartsVisible subject="portfolio" />
    </div>
  );
}
