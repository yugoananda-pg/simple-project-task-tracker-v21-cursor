/**
 * Project report. Mirrors the project Analytics tab, one idea per slide.
 * Every score comes from the same pure functions the screen calls.
 */

import { buildProjectInsights } from "@/src/lib/analytics/insights";
import {
  buildIssueIntelligence,
  type IssueIntelActivity,
} from "@/src/lib/analytics/issue-intelligence";
import {
  buildMacroAxis,
  buildMacroRows,
  buildProcessGroupRows,
  type MacroMilestone,
  type MacroRow,
} from "@/src/lib/analytics/portfolio";
import { buildScheduleComposition, calendarDaysLate } from "@/src/lib/analytics/schedule-composition";
import {
  buildScheduleSeries,
  milestoneVarianceLabel,
  type ProgressEventPoint,
} from "@/src/lib/analytics/schedule-series";
import {
  computeProjectScheduleHealth,
  formatPercent1,
  formatScore2,
  resolveHolidaySet,
} from "@/src/lib/analytics/weighted-progress";
import {
  drawBarList,
  drawMilestoneKey,
  drawTimeline,
  drawTimelineLegend,
  type LineMarker,
  type TimelineRowSpec,
} from "@/src/lib/export/report-charts";
import {
  auDate,
  gapPhrase,
  milestoneTone,
  MILESTONE_STATE_LABEL,
  plural,
  scoreTone,
  TONES,
} from "@/src/lib/export/report-format";
import {
  addFooters,
  attentionSlide,
  cardTitle,
  chartCard,
  collectAttention,
  collectWorkload,
  frame,
  issuesSlide,
  LAYOUT,
  SCORECARD_H,
  scoreColumns,
  scorecard,
  signedWorkingDays,
  drawSummaryNote,
  placeSummaryNote,
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
import type { Issue, Milestone, Task } from "@/src/lib/types";

export type ProjectReportInput = {
  project: {
    name: string;
    customProjectId: string;
    ownerName: string | null;
    lifecycleStatus: "ACTIVE" | "COMPLETED";
  };
  tasks: readonly Task[];
  issues: readonly Issue[];
  milestones: readonly Milestone[];
  activities: readonly IssueIntelActivity[];
  events: readonly ProgressEventPoint[];
  holidayDateKeys: readonly string[];
  today: string;
  exportedBy: string;
  exportedAt: Date;
  /** Saved project note. Omitted from the deck when it has no text. */
  note?: Pick<ReportNote, "html" | "updatedAt" | "updatedByName"> | null;
};

export type BuiltReport = {
  slides: Slide[];
  reportName: string;
  scopeLabel: string;
  /** Used in the file name. */
  fileLabel: string;
  title: string;
};

const PROJECT_KEY = "project";

export function mapIssues(issues: readonly Issue[]) {
  return issues.map((issue) => ({
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
  }));
}

function scheduleHeadline(
  tasksCount: number,
  actual: number,
  delta: number,
): string {
  if (tasksCount === 0) return "There are no tasks to score yet";
  return `Actual progress is ${formatPercent1(actual)}, ${gapPhrase(delta).text}`;
}

// ---------------------------------------------------------------------------
// Milestone slides (shared with the portfolio report)
// ---------------------------------------------------------------------------

export type MilestoneRow = MacroMilestone & {
  n: number;
  project?: string;
  initialTarget?: string;
};

export function milestoneBreakdown(rows: readonly { state: MacroMilestone["state"] }[]) {
  const count = (states: string[]) =>
    rows.filter((row) => states.includes(row.state)).length;
  return {
    achieved: count(["early", "ontime"]),
    late: count(["late"]),
    overdue: count(["overdue"]),
    upcoming: count(["upcoming"]),
  };
}

export function milestoneHeadline(
  rows: readonly { state: MacroMilestone["state"] }[],
): string {
  const parts = milestoneBreakdown(rows);
  const done = parts.achieved + parts.late;
  const base = `${done} of ${rows.length} ${plural(rows.length, "milestone")} achieved`;
  if (parts.overdue > 0) {
    return `${base}, ${parts.overdue} past target`;
  }
  if (parts.upcoming > 0) return `${base}, ${parts.upcoming} still to come`;
  return base;
}

export function milestoneVarianceText(
  row: MacroMilestone,
  today: string,
): { text: string; colour: string } {
  if (row.state === "overdue") {
    const late = calendarDaysLate(row.target, today);
    return {
      text: `${late} calendar ${plural(late, "day")} past`,
      colour: THEME.rose,
    };
  }
  if (row.state === "upcoming") return { text: "Not yet due", colour: THEME.muted };
  const variance = row.varianceDays ?? 0;
  return {
    text: milestoneVarianceLabel(variance),
    colour: variance > 0 ? THEME.amber : variance < 0 ? THEME.emerald : THEME.body,
  };
}

export function milestoneSlides(input: {
  measure: Measure;
  eyebrow: string;
  rows: readonly MilestoneRow[];
  today: string;
  withProject: boolean;
  /** Most pages to print. */
  maxPages?: number;
  title?: string;
}): Slide[] {
  const { rows } = input;
  if (rows.length === 0) return [];
  const slides: Slide[] = [];
  const firstPageRows = 6;
  const nextPageRows = 8;
  const maxPages = input.maxPages ?? 6;
  let index = 0;
  let page = 0;
  const pageCount = Math.min(
    maxPages,
    1 + Math.ceil(Math.max(0, rows.length - firstPageRows) / nextPageRows),
  );

  while (index < rows.length && page < maxPages) {
    const b = new SlideBuilder(input.measure);
    const perPage = page === 0 ? firstPageRows : nextPageRows;
    const slice = rows.slice(index, index + perPage);
    const title = input.title ?? milestoneHeadline(rows);
    const top = frame(b, {
      eyebrow:
        pageCount > 1
          ? `${input.eyebrow}  |  Milestones (${page + 1} of ${pageCount})`
          : `${input.eyebrow}  |  Milestones`,
      title,
    });
    let y = top;

    if (page === 0) {
      const parts = milestoneBreakdown(rows);
      const stats = [
        { label: "Achieved", value: parts.achieved, tone: TONES.emerald },
        { label: "Achieved late", value: parts.late, tone: TONES.amber },
        { label: "Past target", value: parts.overdue, tone: TONES.rose },
        { label: "Upcoming", value: parts.upcoming, tone: TONES.sky },
      ];
      b.card(LAYOUT.mx, y, LAYOUT.cw, 130);
      const colW = LAYOUT.cw / stats.length;
      stats.forEach((stat, i) => {
        const x = LAYOUT.mx + i * colW;
        if (i > 0) b.line(x, y + 24, x, y + 106, THEME.border, 2);
        b.text({
          x: x + 32,
          y,
          w: 110,
          h: 130,
          text: String(stat.value),
          size: 64,
          lh: 76,
          bold: true,
          colour: stat.value > 0 ? stat.tone.ink : THEME.muted,
        });
        b.text({
          x: x + 150,
          y,
          w: colW - 180,
          h: 130,
          text: stat.label,
          size: 26,
          colour: THEME.body,
          bold: true,
        });
      });
      y += 130 + 24;
    }

    const cardH = 28 + 52 + slice.length * 72 + 24;
    b.card(LAYOUT.mx, y, LAYOUT.cw, cardH);
    const inner = LAYOUT.cw - 64;
    const columns = input.withProject
      ? [
          { label: "No.", w: 80 },
          { label: "Milestone", w: 400 },
          { label: "Project", w: 300 },
          { label: "Target", w: 180 },
          { label: "Achieved", w: 180 },
          { label: "Variance", w: 260 },
        ]
      : [
          { label: "No.", w: 80 },
          { label: "Milestone", w: 500 },
          { label: "Initial", w: 180 },
          { label: "Updated", w: 180 },
          { label: "Achieved", w: 180 },
          { label: "Variance", w: 260 },
        ];
    const used = columns.reduce((sum, column) => sum + column.w, 0);
    columns.push({ label: "Status", w: inner - used });

    const cells: Cell[][] = slice.map((row) => {
      const tone = milestoneTone(row.state);
      const variance = milestoneVarianceText(row, input.today);
      const line: Cell[] = [
        { kind: "badge", n: row.n, tone, hollow: row.state === "upcoming" },
        textCell(row.name, { bold: true, colour: THEME.ink }),
      ];
      if (input.withProject) {
        line.push(textCell(row.project ?? "—"));
        line.push(textCell(auDate(row.target), { maxLines: 1 }));
      } else {
        line.push(textCell(auDate(row.initialTarget), { maxLines: 1 }));
        line.push(textCell(auDate(row.target), { maxLines: 1 }));
      }
      line.push(
        textCell(row.achieved ? auDate(row.achieved) : "—", { maxLines: 1 }),
        textCell(variance.text, { colour: variance.colour }),
        { kind: "pill", text: MILESTONE_STATE_LABEL[row.state], tone },
      );
      return line;
    });
    drawTable(b, { x: LAYOUT.mx + 32, y: y + 28, w: inner, h: 0 }, columns, cells, {
      rowH: 72,
    });

    index += perPage;
    page += 1;
    const remaining = rows.length - index;
    if (page >= maxPages && remaining > 0) {
      b.text({
        x: LAYOUT.mx,
        y: y + cardH + 14,
        w: LAYOUT.cw,
        text: `${remaining} more ${plural(remaining, "milestone")} not shown. See the Analytics screen for the full list.`,
        size: 22,
        colour: THEME.muted,
      });
    }
    slides.push(b.slide());
  }
  return slides;
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export function buildProjectReport(
  input: ProjectReportInput,
  measure: Measure,
): BuiltReport {
  const { today } = input;
  const keys = [...input.holidayDateKeys];
  const holidays = resolveHolidaySet(keys);
  const tasks = input.tasks as Task[];
  const hasTasks = tasks.length > 0;

  const health = computeProjectScheduleHealth(tasks, keys, today);
  const series = buildScheduleSeries({
    tasks,
    events: [...input.events],
    holidayKeys: keys,
    today,
  });
  const intel = buildIssueIntelligence({
    issues: mapIssues(input.issues),
    activities: input.activities,
    holidayKeys: keys,
    today,
  });
  const insights = buildProjectInsights({
    taskCount: tasks.length,
    projectPs: health.projectPs,
    delta: health.delta,
    statusFlag: health.statusFlag,
    pActual: health.pActualProject,
    pTarget: health.pTargetProject,
    issues: intel,
  });

  const [row] = buildMacroRows({
    projects: [
      {
        id: PROJECT_KEY,
        name: input.project.name,
        customProjectId: input.project.customProjectId,
        lifecycleStatus: input.project.lifecycleStatus,
        ownerId: "owner",
        ownerName: input.project.ownerName ?? "Not assigned",
      },
    ],
    tasks: tasks.map((task) => ({ ...task, projectId: PROJECT_KEY })),
    milestones: input.milestones.map((milestone) => ({
      ...milestone,
      projectId: PROJECT_KEY,
    })),
    issues: mapIssues(input.issues).map((issue) => ({ ...issue, projectId: PROJECT_KEY })),
    holidayKeys: keys,
    today,
  }) as [MacroRow];

  const initialByMilestone = new Map(
    input.milestones.map((milestone) => [milestone.id, milestone.initialTarget]),
  );
  const milestoneRows: MilestoneRow[] = row.milestones.map((milestone, index) => ({
    ...milestone,
    n: index + 1,
    initialTarget: initialByMilestone.get(milestone.id),
  }));

  const customId = input.project.customProjectId.trim();
  const eyebrow = customId ? `Project report  |  ${customId}` : "Project report";
  const slides: Slide[] = [];

  // 1. Executive summary ----------------------------------------------------
  {
    const b = new SlideBuilder(measure);
    const done = tasks.filter((task) => task.status === "done").length;
    const top = titleFrame(b, {
      eyebrow,
      title: input.project.name,
      meta: [
        `Project Manager: ${input.project.ownerName ?? "Not assigned"}`,
        input.project.lifecycleStatus === "COMPLETED" ? "Completed" : "Active",
        `Report date ${auDate(today)}`,
      ].join("   |   "),
    });
    scorecard(b, { x: LAYOUT.mx, y: top, w: LAYOUT.cw, h: SCORECARD_H }, [
      ...scoreColumns({ hasTasks, health }),
      {
        label: "Tasks",
        value: String(tasks.length),
        sub: `${done} done, ${row.overdueTasks} overdue`,
        subColour: row.overdueTasks > 0 ? THEME.amber : THEME.body,
      },
      {
        label: "Active issues",
        value: String(row.activeIssues),
        valueColour: row.criticalIssues > 0 ? THEME.rose : THEME.ink,
        sub: `${row.criticalIssues} critical`,
      },
    ]);

    const lowerTop = top + SCORECARD_H + 24;
    const lowerH = LAYOUT.bottom - lowerTop;
    const leftW = 800;
    b.card(LAYOUT.mx, lowerTop, leftW, lowerH);
    cardTitle(b, LAYOUT.mx + 32, lowerTop + 26, leftW - 64, "Progress against plan");
    if (hasTasks) {
      drawBarList(
        b,
        { x: LAYOUT.mx + 32, y: lowerTop + 84, w: leftW - 64, h: 0 },
        [
          {
            label: "Target",
            value: health.pTargetProject,
            valueText: formatPercent1(health.pTargetProject),
            colour: THEME.zinc,
          },
          {
            label: "Actual",
            value: health.pActualProject,
            valueText: formatPercent1(health.pActualProject),
            colour: scoreTone(health.projectPs).bar,
          },
        ],
        { max: 100, labelW: 120, valueW: 120, rowH: 64 },
      );
    } else {
      b.text({
        x: LAYOUT.mx + 32,
        y: lowerTop + 84,
        w: leftW - 64,
        text: "Add tasks with dates to see progress against plan.",
        size: 24,
        colour: THEME.muted,
        maxLines: 2,
        lh: 32,
      });
    }

    // Two plain facts under the bars.
    const nextMilestone = milestoneRows.find(
      (m) => m.state === "upcoming" || m.state === "overdue",
    );
    const finish = row.updated?.end ?? null;
    const shift = signedWorkingDays(row.initial?.end, row.updated?.end, holidays);
    const facts: Array<[string, string]> = [
      [
        "Planned finish",
        finish
          ? shift === 0
            ? `${auDate(finish)}, same as the original plan`
            : `${auDate(finish)}, ${Math.abs(shift)} working ${plural(Math.abs(shift), "day")} ${shift > 0 ? "later" : "earlier"} than the original`
          : "No dates yet",
      ],
      [
        "Next milestone",
        nextMilestone
          ? `${nextMilestone.name}, ${auDate(nextMilestone.target)}${nextMilestone.state === "overdue" ? " (past target)" : ""}`
          : milestoneRows.length > 0
            ? "Every milestone is achieved"
            : "No milestones set",
      ],
    ];
    let fy = lowerTop + 84 + 2 * 64 + 20;
    for (const [label, value] of facts) {
      b.line(LAYOUT.mx + 32, fy - 10, LAYOUT.mx + leftW - 32, fy - 10, THEME.border, 2);
      b.text({ x: LAYOUT.mx + 32, y: fy, w: leftW - 64, text: label.toUpperCase(), size: 22, bold: true, colour: THEME.muted });
      const r = b.text({
        x: LAYOUT.mx + 32,
        y: fy + 32,
        w: leftW - 64,
        text: value,
        size: 24,
        lh: 32,
        colour: THEME.ink,
        maxLines: 2,
      });
      fy += 32 + r.height + 22;
    }

    const note = input.note ? { title: "Project note", ...input.note } : null;
    const noteColW = LAYOUT.cw - leftW - 24;
    const placed = placeSummaryNote({
      measure,
      eyebrow: `${eyebrow}  |  Note`,
      note,
      width: noteColW,
      lowerH,
      insights,
    });
    takeawaysCard(
      b,
      {
        x: LAYOUT.mx + leftW + 24,
        y: lowerTop,
        w: noteColW,
        h: placed.takeawaysH,
      },
      insights,
    );
    if (note && placed.noteH > 0) {
      drawSummaryNote(
        b,
        {
          x: LAYOUT.mx + leftW + 24,
          y: lowerTop + lowerH - placed.noteH,
          w: noteColW,
          h: placed.noteH,
        },
        note,
      );
    }
    slides.push(b.slide());
    slides.push(...placed.slides);
  }

  // 2. Schedule -------------------------------------------------------------
  const latest = [...series.points].reverse().find((point) => point.actual != null);
  if (hasTasks && series.points.length > 1) {
    const b = new SlideBuilder(measure);
    const top = frame(b, {
      eyebrow: `${eyebrow}  |  Schedule`,
      title: scheduleHeadline(tasks.length, health.pActualProject, health.delta),
    });
    const leftW = 1100;
    const reading =
      (latest
        ? `On ${auDate(latest.date)}, target is ${formatPercent1(latest.target)} and actual is ${formatPercent1(latest.actual ?? 0)}.`
        : "Add task dates to plot the schedule curve.") +
      (series.usesBackfill
        ? " Earlier actuals are approximated from actual dates."
        : "");
    chartCard(
      b,
      { x: LAYOUT.mx, y: top, w: leftW, h: LAYOUT.bottom - top },
      {
        title: "Schedule S-curve",
        reading,
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

    const rightX = LAYOUT.mx + leftW + 24;
    const rightW = LAYOUT.cw - leftW - 24;
    const composition = buildScheduleComposition({
      tasks: tasks,
      holidayKeys: keys,
      today,
    });
    const effortH = 392;
    b.card(rightX, top, rightW, effortH);
    cardTitle(
      b,
      rightX + 32,
      top + 26,
      rightW - 64,
      "Planned effort by process group",
      `${composition.plannedDays} planned working days in total`,
    );
    drawBarList(
      b,
      { x: rightX + 32, y: top + 128, w: rightW - 64, h: 0 },
      composition.effortByGroup.map((slice) => ({
        label: slice.label,
        value: slice.plannedDays,
        valueText: String(slice.plannedDays),
        colour: THEME.sky,
      })),
      { labelW: 150, valueW: 70, rowH: 50 },
    );

    const posTop = top + effortH + 24;
    const posH = LAYOUT.bottom - posTop;
    b.card(rightX, posTop, rightW, posH);
    cardTitle(b, rightX + 32, posTop + 26, rightW - 64, "Where the dates sit");
    const startShift = signedWorkingDays(row.updated?.start, row.actual?.start, holidays);
    const finishShift = signedWorkingDays(row.initial?.end, row.updated?.end, holidays);
    const actualEnd = row.actual
      ? row.actual.toToday
        ? today
        : row.actual.solidEnd
      : null;
    const windows: Array<{
      label: string;
      dates: string;
      chip: string;
      tone: { fill: string; ink: string };
    }> = [
      {
        label: "Initial plan",
        dates: row.initial ? `${auDate(row.initial.start)} to ${auDate(row.initial.end)}` : "No dates",
        chip: "Original baseline",
        tone: TONES.zinc,
      },
      {
        label: "Updated plan",
        dates: row.updated ? `${auDate(row.updated.start)} to ${auDate(row.updated.end)}` : "No dates",
        chip:
          finishShift === 0
            ? "Finish unchanged"
            : `Finish ${Math.abs(finishShift)} working ${plural(Math.abs(finishShift), "day")} ${finishShift > 0 ? "later" : "earlier"}`,
        tone: finishShift > 0 ? TONES.amber : finishShift < 0 ? TONES.emerald : TONES.zinc,
      },
      {
        label: "Actual",
        dates: row.actual && actualEnd ? `${auDate(row.actual.start)} to ${row.actual.toToday ? "today" : auDate(actualEnd)}` : "Not started",
        chip: !row.actual
          ? "Work has not started"
          : startShift === 0
            ? "Started on plan"
            : `Started ${Math.abs(startShift)} working ${plural(Math.abs(startShift), "day")} ${startShift > 0 ? "late" : "early"}`,
        tone: !row.actual ? TONES.zinc : startShift > 0 ? TONES.amber : startShift < 0 ? TONES.emerald : TONES.emerald,
      },
    ];
    const blockH = Math.min(110, (posH - 96) / 3);
    windows.forEach((win, i) => {
      const y = posTop + 90 + i * blockH;
      if (i > 0) b.line(rightX + 32, y - 8, rightX + rightW - 32, y - 8, THEME.border, 2);
      b.text({ x: rightX + 32, y, w: 200, text: win.label, size: 24, bold: true, colour: THEME.ink, h: 32 });
      b.text({ x: rightX + 220, y, w: rightW - 252, text: win.dates, size: 24, colour: THEME.body, align: "right", h: 32 });
      b.pill(rightX + 32, y + 40, win.chip, {
        size: 22,
        height: 40,
        fill: win.tone.fill,
        colour: win.tone.ink,
        maxW: rightW - 64,
        padX: 14,
      });
    });
    slides.push(b.slide());
  }

  // 3. Process-group timeline ---------------------------------------------
  const groupRows = buildProcessGroupRows({
    tasks,
    lifecycleStatus: input.project.lifecycleStatus,
    holidayKeys: keys,
    today,
  });
  const markerList = milestoneRows.map((milestone) => ({
    milestone,
    date: milestone.achieved ?? milestone.target,
    achieved: Boolean(milestone.achieved),
  }));
  const axis = buildMacroAxis(
    groupRows,
    today,
    markerList.map((marker) => marker.date),
  );
  if (hasTasks && axis) {
    const b = new SlideBuilder(measure);
    const scored = groupRows.filter((group) => group.ps != null);
    const weakest = [...scored].sort((a, c) => (a.ps ?? 0) - (c.ps ?? 0))[0];
    const title = !weakest
      ? "Schedule by process group"
      : (weakest.ps ?? 0) >= 95
        ? "Every process group is on track or better"
        : `${weakest.name} is the weakest process group, scoring ${formatScore2(weakest.ps ?? 0)}`;
    const top = frame(b, { eyebrow: `${eyebrow}  |  Process groups`, title });
    const cardH = LAYOUT.bottom - top;
    b.card(LAYOUT.mx, top, LAYOUT.cw, cardH);

    const rows: TimelineRowSpec[] = groupRows.map((group) => ({
      name: group.name,
      sub: `${group.taskCount} ${plural(group.taskCount, "task")}`,
      initial: group.initial,
      updated: group.updated,
      actual: group.actual,
      tone: group.tone,
      figures:
        group.ps == null
          ? undefined
          : {
              score: formatScore2(group.ps),
              scoreTone: scoreTone(group.ps),
              progress: `${formatPercent1(group.pActual)} / ${formatPercent1(group.pTarget)}`,
              flag: group.statusFlag,
            },
    }));
    const markers: LineMarker[] = markerList.map(({ milestone, date, achieved }) => ({
      n: milestone.n,
      date,
      tone: achieved ? TONES.emerald : TONES.amber,
    }));
    const chart = drawTimeline(
      b,
      { x: LAYOUT.mx + 32, y: top + 26, w: LAYOUT.cw - 64, h: 0 },
      {
        rows,
        axis,
        today,
        markers,
        rowH: 72,
        nameW: 250,
        nameHeading: "Process group",
        withFigures: true,
      },
    );
    let y = chart.bottom + 6;
    y += drawTimelineLegend(b, LAYOUT.mx + 32, y, LAYOUT.cw - 64) + 10;

    if (milestoneRows.length > 0) {
      b.line(LAYOUT.mx + 32, y, LAYOUT.mx + LAYOUT.cw - 32, y, THEME.border, 2);
      y += 12;
      b.text({
        x: LAYOUT.mx + 32,
        y,
        w: 400,
        text: "Milestones",
        size: 22,
        bold: true,
        colour: THEME.muted,
      });
      y += 32;
      drawMilestoneKey(
        b,
        { x: LAYOUT.mx + 32, y, w: LAYOUT.cw - 64, h: LAYOUT.bottom - 16 - y },
        milestoneRows.map((milestone) => ({
          n: milestone.n,
          name: milestone.name,
          detail: milestone.achieved
            ? `Achieved ${auDate(milestone.achieved)}`
            : milestone.state === "overdue"
              ? `Past target ${auDate(milestone.target)}`
              : `Target ${auDate(milestone.target)}`,
          tone: milestone.achieved ? TONES.emerald : TONES.amber,
        })),
      );
    }
    slides.push(b.slide());
  }

  // 4. Milestones ----------------------------------------------------------
  slides.push(
    ...milestoneSlides({
      measure,
      eyebrow,
      rows: milestoneRows,
      today,
      withProject: false,
    }),
  );

  // 5. Overdue and at-risk -------------------------------------------------
  if (hasTasks) {
    const taskRows = tasks as unknown as TaskForReport[];
    const attention = collectAttention({
      tasks: taskRows,
      health,
      holidayKeys: keys,
      today,
    });
    slides.push(
      attentionSlide({
        b: new SlideBuilder(measure),
        eyebrow: `${eyebrow}  |  Tasks`,
        attention,
        workload: collectWorkload({ tasks: taskRows, health }),
        withProject: false,
      }),
    );
  }

  // 6. Issues --------------------------------------------------------------
  if (!intel.empty) {
    slides.push(
      issuesSlide({
        b: new SlideBuilder(measure),
        eyebrow: `${eyebrow}  |  Issues`,
        intel,
        withProject: false,
      }),
    );
  }

  const reportName = "Project report";
  const scopeLabel = input.project.name;
  addFooters(slides, {
    measure,
    reportName,
    scopeLabel,
    exportedBy: input.exportedBy,
    exportedAt: input.exportedAt,
  });
  return {
    slides,
    reportName,
    scopeLabel,
    fileLabel: input.project.name,
    title: `${reportName}: ${input.project.name}`,
  };
}

