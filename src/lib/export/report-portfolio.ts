/**
 * Portfolio report. Same figures as the Portfolio view, one idea per slide.
 * The ticked projects on the screen are the ones that go into the file.
 */

import type { IssueIntelActivity } from "@/src/lib/analytics/issue-intelligence";
import { buildIssueIntelligence } from "@/src/lib/analytics/issue-intelligence";
import {
  buildMacroAxis,
  buildMacroRows,
  buildPmComparison,
  buildPortfolioInsights,
  type PortfolioIssue,
  type PortfolioMilestone,
  type PortfolioProjectMeta,
  type PortfolioTask,
} from "@/src/lib/analytics/portfolio";
import type { ProgressEventPoint } from "@/src/lib/analytics/schedule-series";
import { buildScheduleSeries } from "@/src/lib/analytics/schedule-series";
import {
  computeProjectScheduleHealth,
  formatPercent1,
  formatScore2,
} from "@/src/lib/analytics/weighted-progress";
import {
  drawMilestoneKey,
  drawTimeline,
  drawTimelineLegend,
  type TimelineRowSpec,
} from "@/src/lib/export/report-charts";
import {
  auDate,
  flagLabel,
  flagTone,
  gapPhrase,
  milestoneTone,
  plural,
  scoreTone,
  TONES,
} from "@/src/lib/export/report-format";
import {
  milestoneHeadline,
  milestoneSlides,
  type MilestoneRow,
} from "@/src/lib/export/report-project";
import {
  addFooters,
  attentionSlide,
  chartCard,
  collectAttention,
  collectWorkload,
  frame,
  issuesSlide,
  LAYOUT,
  SCORECARD_H,
  scoreColumns,
  drawSummaryNote,
  placeSummaryNote,
  scorecard,
  takeawaysCard,
  titleFrame,
  type ReportNote,
  type TaskForReport,
} from "@/src/lib/export/report-shared";
import { drawTable, textCell, type Cell } from "@/src/lib/export/report-table";
import {
  SlideBuilder,
  THEME,
  type Measure,
  type Slide,
} from "@/src/lib/export/slide-kit";
import type { BuiltReport } from "@/src/lib/export/report-project";

export type PortfolioReportInput = {
  scope: "pm" | "all";
  scopeLabel: string;
  includeCompleted: boolean;
  projects: readonly PortfolioProjectMeta[];
  tasks: readonly PortfolioTask[];
  milestones: readonly PortfolioMilestone[];
  issues: readonly PortfolioIssue[];
  activities: readonly IssueIntelActivity[];
  events: readonly ProgressEventPoint[];
  holidayDateKeys: readonly string[];
  today: string;
  exportedBy: string;
  exportedAt: Date;
  /** Saved portfolio note for this scope. Omitted from the deck when it has no text. */
  note?: Pick<ReportNote, "html" | "updatedAt" | "updatedByName"> | null;
};

function scheduleHeadline(taskCount: number, actual: number, delta: number): string {
  if (taskCount === 0) return "There are no tasks to score yet";
  return `Actual progress is ${formatPercent1(actual)}, ${gapPhrase(delta).text}`;
}

export function buildPortfolioReport(
  input: PortfolioReportInput,
  measure: Measure,
): BuiltReport {
  const { today } = input;
  const keys = [...input.holidayDateKeys];
  const projects = [...input.projects];
  const tasks = [...input.tasks];
  const hasTasks = tasks.length > 0;

  const rows = buildMacroRows({
    projects,
    tasks,
    milestones: input.milestones,
    issues: input.issues,
    holidayKeys: keys,
    today,
  });
  const health = computeProjectScheduleHealth(tasks, keys, today);
  const series = buildScheduleSeries({
    tasks,
    events: [...input.events],
    holidayKeys: keys,
    today,
  });
  const intel = buildIssueIntelligence({
    issues: input.issues,
    activities: input.activities,
    holidayKeys: keys,
    today,
  });
  const pmRows = buildPmComparison({
    rows,
    tasks,
    holidayKeys: keys,
    today,
  });
  const insights = buildPortfolioInsights({
    scope: input.scope,
    scopeLabel: input.scopeLabel,
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
  });

  const numbered: MilestoneRow[] = rows
    .flatMap((row) =>
      row.milestones.map((milestone) => ({
        ...milestone,
        n: 0,
        project: row.name,
      })),
    )
    .sort((a, b) => a.target.localeCompare(b.target) || a.name.localeCompare(b.name))
    .map((milestone, index) => ({ ...milestone, n: index + 1 }));
  const numberById = new Map(numbered.map((milestone) => [milestone.id, milestone]));

  const overdueTotal = rows.reduce((sum, row) => sum + row.overdueTasks, 0);
  const activeIssues = rows.reduce((sum, row) => sum + row.activeIssues, 0);
  const criticalIssues = rows.reduce((sum, row) => sum + row.criticalIssues, 0);
  const completedCount = projects.filter(
    (project) => project.lifecycleStatus === "COMPLETED",
  ).length;

  const eyebrow =
    input.scope === "all"
      ? "Portfolio report  |  All projects"
      : `Portfolio report  |  ${input.scopeLabel}`;
  const slides: Slide[] = [];

  // 1. Summary --------------------------------------------------------------
  {
    const b = new SlideBuilder(measure);
    const top = titleFrame(b, {
      eyebrow,
      title: input.scope === "all" ? "All projects" : input.scopeLabel,
      meta: [
        input.includeCompleted ? "Active and Completed" : "Active projects only",
        `${projects.length} ${plural(projects.length, "project")}`,
        `Report date ${auDate(today)}`,
      ].join("   |   "),
    });
    scorecard(b, { x: LAYOUT.mx, y: top, w: LAYOUT.cw, h: SCORECARD_H }, [
      ...scoreColumns({ hasTasks, health }),
      {
        label: "Projects",
        value: String(projects.length),
        sub:
          completedCount > 0
            ? `${completedCount} completed, ${overdueTotal} overdue ${plural(overdueTotal, "task")}`
            : `${overdueTotal} overdue ${plural(overdueTotal, "task")}`,
        subColour: overdueTotal > 0 ? THEME.amber : THEME.body,
      },
      {
        label: "Active issues",
        value: String(activeIssues),
        valueColour: criticalIssues > 0 ? THEME.rose : THEME.ink,
        sub: `${criticalIssues} critical`,
      },
    ]);

    const lowerTop = top + SCORECARD_H + 24;
    const lowerH = LAYOUT.bottom - lowerTop;
    const note = input.note
      ? {
          title:
            input.scope === "all"
              ? "All projects note"
              : `${input.scopeLabel} portfolio note`,
          ...input.note,
        }
      : null;
    const placed = placeSummaryNote({
      measure,
      eyebrow: `${eyebrow}  |  Note`,
      note,
      width: LAYOUT.cw,
      lowerH,
      insights,
    });
    takeawaysCard(
      b,
      { x: LAYOUT.mx, y: lowerTop, w: LAYOUT.cw, h: placed.takeawaysH },
      insights,
      "What stands out",
    );
    if (note && placed.noteH > 0) {
      drawSummaryNote(
        b,
        {
          x: LAYOUT.mx,
          y: lowerTop + lowerH - placed.noteH,
          w: LAYOUT.cw,
          h: placed.noteH,
        },
        note,
      );
    }
    slides.push(b.slide());
    slides.push(...placed.slides);
  }

  // 2. Macro timeline (paginated) ------------------------------------------
  const extraDates = numbered.map((milestone) => milestone.achieved ?? milestone.target);
  const axis = buildMacroAxis(rows, today, extraDates);
  if (axis && rows.length > 0) {
    const perPage = 5;
    const pages = Math.max(1, Math.ceil(rows.length / perPage));
    for (let page = 0; page < pages; page += 1) {
      const b = new SlideBuilder(measure);
      const slice = rows.slice(page * perPage, (page + 1) * perPage);
      const weakest = [...rows]
        .filter((row) => row.taskCount > 0)
        .sort((a, c) => a.ps - c.ps)[0];
      const title =
        pages > 1
          ? `Macro timeline, ${page + 1} of ${pages}`
          : weakest && weakest.ps < 95
            ? `${weakest.name} has the lowest score, ${formatScore2(weakest.ps)}`
            : "Every project is on track or better";
      const top = frame(b, {
        eyebrow: `${eyebrow}  |  Timeline`,
        title,
      });
      const cardH = LAYOUT.bottom - top;
      b.card(LAYOUT.mx, top, LAYOUT.cw, cardH);

      const specs: TimelineRowSpec[] = slice.map((row) => ({
        name: row.name,
        sub: [
          row.customProjectId.trim() || null,
          input.scope === "all" ? row.ownerName : null,
          row.lifecycleStatus === "COMPLETED" ? "Completed" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        initial: row.initial,
        updated: row.updated,
        actual: row.actual,
        tone: row.tone,
        badges: row.milestones.map((milestone) => {
          const numberedRow = numberById.get(milestone.id);
          return {
            n: numberedRow?.n ?? 0,
            date: milestone.achieved ?? milestone.target,
            tone: milestoneTone(milestone.state),
            hollow: milestone.state === "upcoming",
          };
        }),
        figures: {
          score: formatScore2(row.ps),
          scoreTone: scoreTone(row.ps),
          progress: `${formatPercent1(row.pActual)} / ${formatPercent1(row.pTarget)}`,
          flag: row.statusFlag,
        },
      }));

      const chart = drawTimeline(
        b,
        { x: LAYOUT.mx + 32, y: top + 26, w: LAYOUT.cw - 64, h: 0 },
        {
          rows: specs,
          axis,
          today,
          rowH: 88,
          nameW: 360,
          nameLines: 1,
          nameHeading: "Project",
          withFigures: true,
        },
      );
      let y = chart.bottom + 6;
      y += drawTimelineLegend(b, LAYOUT.mx + 32, y, LAYOUT.cw - 64) + 8;

      const pageIds = new Set(slice.flatMap((row) => row.milestones.map((m) => m.id)));
      const pageKeys = numbered.filter((milestone) => pageIds.has(milestone.id));
      if (pageKeys.length > 0) {
        b.line(LAYOUT.mx + 32, y, LAYOUT.mx + LAYOUT.cw - 32, y, THEME.border, 2);
        y += 12;
        b.text({
          x: LAYOUT.mx + 32,
          y,
          w: 400,
          text: "Milestones on this page",
          size: 22,
          bold: true,
          colour: THEME.muted,
        });
        y += 32;
        drawMilestoneKey(
          b,
          { x: LAYOUT.mx + 32, y, w: LAYOUT.cw - 64, h: LAYOUT.bottom - 16 - y },
          pageKeys.map((milestone) => ({
            n: milestone.n,
            name: milestone.name,
            detail: [
              milestone.project,
              milestone.achieved
                ? `Achieved ${auDate(milestone.achieved)}`
                : `Target ${auDate(milestone.target)}`,
            ]
              .filter(Boolean)
              .join(" · "),
            tone: milestoneTone(milestone.state),
          })),
          2,
        );
      }
      slides.push(b.slide());
    }
  }

  // 3. S-curve and burn-down -----------------------------------------------
  if (hasTasks && series.points.length > 1) {
    const b = new SlideBuilder(measure);
    const top = frame(b, {
      eyebrow: `${eyebrow}  |  Schedule`,
      title: scheduleHeadline(tasks.length, health.pActualProject, health.delta),
    });
    const gap = 24;
    const half = (LAYOUT.cw - gap) / 2;
    const latest = [...series.points].reverse().find((point) => point.actual != null);
    chartCard(
      b,
      { x: LAYOUT.mx, y: top, w: half, h: LAYOUT.bottom - top },
      {
        title: "Schedule S-curve",
        reading: latest
          ? `On ${auDate(latest.date)}, target is ${formatPercent1(latest.target)} and actual is ${formatPercent1(latest.actual ?? 0)}.`
          : "Add task dates to plot the schedule curve.",
        legend: [
          { label: "Target", colour: THEME.zinc, dashed: true },
          { label: "Actual", colour: THEME.emerald },
        ],
        points: series.points,
        series: [
          { key: "target", colour: THEME.zinc, dashed: true, width: 4 },
          { key: "actual", colour: THEME.emerald, area: THEME.emeraldSoft, width: 6 },
        ],
        percent: true,
        today,
      },
    );
    chartCard(
      b,
      { x: LAYOUT.mx + half + gap, y: top, w: half, h: LAYOUT.bottom - top },
      {
        title: "Task burn-down",
        reading: latest
          ? `Remaining effort on ${auDate(latest.date)} is ${latest.remainingDays?.toFixed(1) ?? "-"} working days. Ideal is ${latest.idealRemainingDays.toFixed(1)}.`
          : "Add task dates to plot remaining effort.",
        legend: [
          { label: "Remaining", colour: THEME.sky },
          { label: "Ideal", colour: THEME.zinc, dashed: true },
        ],
        points: series.points,
        series: [
          { key: "idealRemainingDays", colour: THEME.zinc, dashed: true, width: 4 },
          { key: "remainingDays", colour: THEME.sky, area: THEME.skySoft, width: 6 },
        ],
        percent: false,
        today,
      },
    );
    slides.push(b.slide());
  }

  // 4. Ranking --------------------------------------------------------------
  if (input.scope === "all" && pmRows.length > 0) {
    const b = new SlideBuilder(measure);
    const lowest = pmRows[0];
    const top = frame(b, {
      eyebrow: `${eyebrow}  |  By PM`,
      title:
        pmRows.length === 1
          ? `${lowest.pmName} is the only PM in this view`
          : `${lowest.pmName} has the lowest punctuality, ${formatScore2(lowest.ps)}`,
    });
    const shown = pmRows.slice(0, 8);
    const extra = pmRows.length - shown.length;
    const cardH = 28 + 52 + shown.length * 72 + (extra > 0 ? 54 : 24);
    b.card(LAYOUT.mx, top, LAYOUT.cw, Math.min(cardH, LAYOUT.bottom - top));
    const inner = LAYOUT.cw - 64;
    const columns = [
      { label: "PM", w: 360 },
      { label: "Projects", w: 140, align: "right" as const },
      { label: "Tasks", w: 140, align: "right" as const },
      { label: "PS", w: 120, align: "right" as const },
      { label: "Progress", w: 260 },
      { label: "Overdue", w: 140, align: "right" as const },
      { label: "Critical", w: 140, align: "right" as const },
    ];
    const used = columns.reduce((sum, column) => sum + column.w, 0);
    columns.push({ label: "Status", w: inner - used });
    const cells: Cell[][] = shown.map((row) => [
      textCell(row.pmName, { bold: true, colour: THEME.ink }),
      textCell(String(row.projectCount), { align: "right", maxLines: 1 }),
      textCell(String(row.taskCount), { align: "right", maxLines: 1 }),
      textCell(formatScore2(row.ps), {
        align: "right",
        bold: true,
        colour: scoreTone(row.ps).ink,
        maxLines: 1,
      }),
      textCell(`${formatPercent1(row.pActual)} / ${formatPercent1(row.pTarget)}`, {
        maxLines: 1,
      }),
      textCell(String(row.overdueTasks), {
        align: "right",
        colour: row.overdueTasks > 0 ? THEME.amber : THEME.body,
        maxLines: 1,
      }),
      textCell(String(row.criticalIssues), {
        align: "right",
        colour: row.criticalIssues > 0 ? THEME.rose : THEME.body,
        maxLines: 1,
      }),
      { kind: "pill", text: flagLabel(row.statusFlag), tone: flagTone(row.statusFlag) },
    ]);
    drawTable(
      b,
      { x: LAYOUT.mx + 32, y: top + 28, w: inner, h: 0 },
      columns,
      cells,
      { rowH: 72 },
    );
    if (extra > 0) {
      b.text({
        x: LAYOUT.mx + 32,
        y: top + cardH - 40,
        w: inner,
        text: `Plus ${extra} more ${plural(extra, "PM")} on the Portfolio screen.`,
        size: 22,
        colour: THEME.muted,
        h: 30,
      });
    }
    slides.push(b.slide());
  } else if (input.scope === "pm" && rows.length > 0) {
    const b = new SlideBuilder(measure);
    const ranked = [...rows].sort((a, c) => a.ps - c.ps || a.name.localeCompare(c.name));
    const lowest = ranked.find((row) => row.taskCount > 0);
    const top = frame(b, {
      eyebrow: `${eyebrow}  |  Projects`,
      title: lowest
        ? `${lowest.name} needs the most attention, scoring ${formatScore2(lowest.ps)}`
        : "Projects in this portfolio",
    });
    const shown = ranked.slice(0, 8);
    const extra = ranked.length - shown.length;
    const cardH = 28 + 52 + shown.length * 72 + (extra > 0 ? 54 : 24);
    b.card(LAYOUT.mx, top, LAYOUT.cw, Math.min(cardH, LAYOUT.bottom - top));
    const inner = LAYOUT.cw - 64;
    const columns = [
      { label: "Project", w: 520 },
      { label: "ID", w: 180 },
      { label: "PS", w: 120, align: "right" as const },
      { label: "Progress", w: 260 },
      { label: "Overdue", w: 140, align: "right" as const },
      { label: "Issues", w: 140, align: "right" as const },
    ];
    const used = columns.reduce((sum, column) => sum + column.w, 0);
    columns.push({ label: "Status", w: inner - used });
    const cells: Cell[][] = shown.map((row) => [
      textCell(row.name, { bold: true, colour: THEME.ink }),
      textCell(row.customProjectId.trim() || "—", { maxLines: 1 }),
      textCell(formatScore2(row.ps), {
        align: "right",
        bold: true,
        colour: scoreTone(row.ps).ink,
        maxLines: 1,
      }),
      textCell(`${formatPercent1(row.pActual)} / ${formatPercent1(row.pTarget)}`, {
        maxLines: 1,
      }),
      textCell(String(row.overdueTasks), {
        align: "right",
        colour: row.overdueTasks > 0 ? THEME.amber : THEME.body,
        maxLines: 1,
      }),
      textCell(String(row.activeIssues), {
        align: "right",
        colour: row.criticalIssues > 0 ? THEME.rose : THEME.body,
        maxLines: 1,
      }),
      { kind: "pill", text: flagLabel(row.statusFlag), tone: flagTone(row.statusFlag) },
    ]);
    drawTable(
      b,
      { x: LAYOUT.mx + 32, y: top + 28, w: inner, h: 0 },
      columns,
      cells,
      { rowH: 72 },
    );
    if (extra > 0) {
      b.text({
        x: LAYOUT.mx + 32,
        y: top + cardH - 40,
        w: inner,
        text: `Plus ${extra} more ${plural(extra, "project")} on the Portfolio screen.`,
        size: 22,
        colour: THEME.muted,
        h: 30,
      });
    }
    slides.push(b.slide());
  }

  // 5. Milestones ----------------------------------------------------------
  slides.push(
    ...milestoneSlides({
      measure,
      eyebrow,
      rows: numbered,
      today,
      withProject: true,
      title: numbered.length === 0 ? undefined : milestoneHeadline(numbered),
    }),
  );

  // 6. Attention ------------------------------------------------------------
  if (hasTasks) {
    const taskRows: TaskForReport[] = tasks.map((task) => ({
      ...task,
      projectName: projects.find((project) => project.id === task.projectId)?.name,
    }));
    slides.push(
      attentionSlide({
        b: new SlideBuilder(measure),
        eyebrow: `${eyebrow}  |  Tasks`,
        attention: collectAttention({
          tasks: taskRows,
          health,
          holidayKeys: keys,
          today,
        }),
        workload: collectWorkload({ tasks: taskRows, health }),
        withProject: true,
      }),
    );
  }

  // 7. Issues --------------------------------------------------------------
  if (!intel.empty) {
    slides.push(
      issuesSlide({
        b: new SlideBuilder(measure),
        eyebrow: `${eyebrow}  |  Issues`,
        intel,
        withProject: true,
      }),
    );
  }

  const reportName = "Portfolio report";
  addFooters(slides, {
    measure,
    reportName,
    scopeLabel: input.scopeLabel,
    exportedBy: input.exportedBy,
    exportedAt: input.exportedAt,
  });
  return {
    slides,
    reportName,
    scopeLabel: input.scopeLabel,
    fileLabel: input.scopeLabel,
    title: `${reportName}: ${input.scopeLabel}`,
  };
}
