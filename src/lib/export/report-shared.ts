/**
 * Building blocks shared by the project and portfolio reports: the slide
 * frame, scorecard, takeaways, chart cards, the attention table, workload
 * and the issue slide. Every figure arrives already worked out by the
 * analytics engines. Nothing here recalculates a score.
 */

import { getTaskPicDisplayName, listTaskPics, picLabel } from "@/src/lib/assignee-display";
import type { Insight } from "@/src/lib/analytics/insights";
import {
  noteHtmlToBlocks,
  type NoteBlock,
} from "@/src/lib/analytics/note-html";
import type { IssueIntelligence } from "@/src/lib/analytics/issue-intelligence";
import type { CompositionTask } from "@/src/lib/analytics/schedule-composition";
import { buildScheduleComposition } from "@/src/lib/analytics/schedule-composition";
import type { ScheduleSeries } from "@/src/lib/analytics/schedule-series";
import {
  formatPercent1,
  formatScore2,
  type ProjectScheduleHealth,
  type StatusFlagId,
} from "@/src/lib/analytics/weighted-progress";
import {
  drawBarList,
  drawLegend,
  drawLineChart,
  niceScale,
  type Box,
} from "@/src/lib/export/report-charts";
import {
  auDate,
  auDateTime,
  flagLabel,
  flagTone,
  gapPhrase,
  plural,
  scoreTone,
  TONES,
  type Tone,
} from "@/src/lib/export/report-format";
import {
  drawTable,
  textCell,
  type Cell,
  type Column,
} from "@/src/lib/export/report-table";
import {
  SlideBuilder,
  THEME,
  wrapText,
  type Slide,
} from "@/src/lib/export/slide-kit";
import {
  workingDaysAfter,
  type HolidaySet,
} from "@/src/lib/analytics/working-days";
import { getEffectiveDueDate } from "@/src/lib/task-defaults";

export const LAYOUT = { mx: 72, cw: 1776, top: 214, bottom: 990 } as const;

/** Height of the stat strip at the top of a summary or issue slide. */
export const SCORECARD_H = 256;

// ---------------------------------------------------------------------------
// Frame, headings
// ---------------------------------------------------------------------------

/** Eyebrow and headline. Returns the y where content may begin. */
export function frame(
  b: SlideBuilder,
  options: { eyebrow: string; title: string },
): number {
  b.rect({ x: 0, y: 0, w: 1920, h: 12, fill: THEME.teal });
  b.text({
    x: LAYOUT.mx,
    y: 44,
    w: LAYOUT.cw,
    text: options.eyebrow.toUpperCase(),
    size: 22,
    bold: true,
    colour: THEME.teal,
  });
  b.text({
    x: LAYOUT.mx,
    y: 82,
    w: LAYOUT.cw,
    text: options.title,
    size: 44,
    lh: 54,
    bold: true,
    colour: THEME.ink,
    maxLines: 2,
  });
  return LAYOUT.top;
}

/** First slide of a report: big name, one line of facts. Returns where content starts. */
export function titleFrame(
  b: SlideBuilder,
  options: { eyebrow: string; title: string; meta: string },
): number {
  b.rect({ x: 0, y: 0, w: 1920, h: 12, fill: THEME.teal });
  b.text({
    x: LAYOUT.mx,
    y: 44,
    w: LAYOUT.cw,
    text: options.eyebrow.toUpperCase(),
    size: 22,
    bold: true,
    colour: THEME.teal,
  });
  const title = b.text({
    x: LAYOUT.mx,
    y: 80,
    w: LAYOUT.cw,
    text: options.title,
    size: 52,
    lh: 60,
    bold: true,
    colour: THEME.ink,
    maxLines: 2,
  });
  const metaY = 80 + title.height + 6;
  b.text({
    x: LAYOUT.mx,
    y: metaY,
    w: LAYOUT.cw,
    text: options.meta,
    size: 26,
    lh: 34,
    colour: THEME.muted,
    maxLines: 1,
  });
  return metaY + 34 + 26;
}

/** Working days from one date to another. Negative when `to` is earlier. */
export function signedWorkingDays(
  from: string | null | undefined,
  to: string | null | undefined,
  holidays: HolidaySet,
): number {
  if (!from || !to) return 0;
  if (to >= from) return workingDaysAfter(from, to, holidays);
  return -workingDaysAfter(to, from, holidays);
}

export function cardTitle(
  b: SlideBuilder,
  x: number,
  y: number,
  w: number,
  title: string,
  sub?: string,
): number {
  b.text({ x, y, w, text: title, size: 28, bold: true, colour: THEME.ink, h: 36 });
  if (!sub) return 44;
  const r = b.text({
    x,
    y: y + 38,
    w,
    text: sub,
    size: 22,
    lh: 30,
    colour: THEME.muted,
    maxLines: 2,
  });
  return 44 + r.height + 4;
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

export type StatCol = {
  label: string;
  value?: string;
  valueColour?: string;
  flag?: StatusFlagId | null;
  sub?: string;
  subColour?: string;
};

/** A flag as a soft badge that wraps to two lines instead of cropping. */
export function flagBadge(
  b: SlideBuilder,
  x: number,
  y: number,
  maxW: number,
  flag: StatusFlagId,
  size = 28,
): number {
  const tone = flagTone(flag);
  const pad = 20;
  const lines = wrapText(b.measure, flagLabel(flag), maxW - pad * 2, size, true, 2);
  const lh = Math.round(size * 1.25);
  const textW = Math.max(...lines.map((line) => b.measure(line, size, true)));
  const w = Math.min(maxW, Math.ceil(textW / 0.97) + pad * 2);
  const h = lines.length * lh + 24;
  b.rect({ x, y, w, h, fill: tone.fill, radius: 18 });
  b.text({
    x,
    y: y + 12,
    w,
    text: flagLabel(flag),
    size,
    lh,
    bold: true,
    colour: tone.ink,
    align: "center",
    maxLines: 2,
  });
  return h;
}

export function scorecard(
  b: SlideBuilder,
  box: Box,
  cols: readonly StatCol[],
): void {
  b.card(box.x, box.y, box.w, box.h);
  const colW = box.w / cols.length;
  cols.forEach((col, index) => {
    const x = box.x + index * colW;
    if (index > 0) {
      b.line(x, box.y + 30, x, box.y + box.h - 30, THEME.border, 2);
    }
    const inner = colW - 56;
    const left = x + 28;
    b.text({
      x: left,
      y: box.y + 28,
      w: inner,
      text: col.label.toUpperCase(),
      size: 22,
      bold: true,
      colour: THEME.muted,
    });
    let subTop = box.y + 168;
    if (col.flag) {
      const h = flagBadge(b, left, box.y + 78, inner, col.flag, 28);
      subTop = box.y + 78 + h + 14;
    } else {
      b.text({
        x: left,
        y: box.y + 66,
        w: inner,
        text: col.value ?? "—",
        size: 84,
        lh: 100,
        bold: true,
        colour: col.valueColour ?? THEME.ink,
      });
    }
    if (col.sub) {
      b.text({
        x: left,
        y: subTop,
        w: inner,
        text: col.sub,
        size: 24,
        lh: 32,
        colour: col.subColour ?? THEME.body,
        maxLines: 2,
      });
    }
  });
}

/** Scorecard columns that every schedule report starts with. */
export function scoreColumns(input: {
  hasTasks: boolean;
  health: ProjectScheduleHealth;
}): StatCol[] {
  const { health } = input;
  if (!input.hasTasks) {
    return [
      { label: "Status", value: "—", sub: "No tasks yet" },
      { label: "Punctuality score", value: "—", sub: "Add task dates to score" },
      { label: "Actual progress", value: "—", sub: "No tasks yet" },
    ];
  }
  const gap = gapPhrase(health.delta);
  const tone = scoreTone(health.projectPs);
  return [
    { label: "Status", flag: health.statusFlag },
    {
      label: "Punctuality score",
      value: formatScore2(health.projectPs),
      valueColour: tone.ink,
      sub: "1.00 is right on schedule",
    },
    {
      label: "Actual progress",
      value: formatPercent1(health.pActualProject),
      sub: `Target ${formatPercent1(health.pTargetProject)}, ${gap.text}`,
      subColour: gap.tone.ink,
    },
  ];
}

// ---------------------------------------------------------------------------
// Takeaways
// ---------------------------------------------------------------------------

const INSIGHT_TONE: Record<Insight["tone"], Tone> = {
  good: TONES.emerald,
  watch: TONES.amber,
  urgent: TONES.rose,
  neutral: TONES.sky,
};

export function takeawaysCard(
  b: SlideBuilder,
  box: Box,
  insights: readonly Insight[],
  title = "Key takeaways",
): void {
  b.card(box.x, box.y, box.w, box.h);
  const x = box.x + 32;
  const w = box.w - 64;
  const head = cardTitle(b, x, box.y + 28, w, title);
  const top = box.y + 28 + head + 12;
  const available = box.y + box.h - 28 - top;
  const items = insights.slice(0, 3);
  const textW = w - 30;

  let maxLines = 5;
  const heightFor = (limit: number) =>
    items.reduce(
      (sum, item, index) =>
        sum +
        wrapText(b.measure, item.text, textW, 24, false, limit).length * 32 +
        (index > 0 ? 22 : 0),
      0,
    );
  while (maxLines > 2 && heightFor(maxLines) > available) maxLines -= 1;

  let y = top;
  items.forEach((item, index) => {
    if (index > 0) y += 22;
    const result = b.text({
      x: x + 30,
      y,
      w: textW,
      text: item.text,
      size: 24,
      lh: 32,
      colour: THEME.body,
      maxLines,
    });
    b.rect({
      x,
      y: y + 2,
      w: 8,
      h: Math.max(28, result.height - 4),
      fill: INSIGHT_TONE[item.tone].bar,
      radius: 4,
    });
    y += result.height;
  });
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

export function chartCard(
  b: SlideBuilder,
  box: Box,
  options: {
    title: string;
    reading: string;
    legend: ReadonlyArray<{ label: string; colour: string; dashed?: boolean }>;
    points: ScheduleSeries["points"];
    series: Parameters<typeof drawLineChart>[2]["series"];
    percent: boolean;
    today: string;
    yLabel?: string;
  },
): void {
  b.card(box.x, box.y, box.w, box.h);
  const x = box.x + 32;
  const w = box.w - 64;
  b.text({ x, y: box.y + 28, w, text: options.title, size: 28, bold: true, colour: THEME.ink, h: 36 });
  const reading = b.text({
    x,
    y: box.y + 70,
    w,
    text: options.reading,
    size: 24,
    lh: 32,
    colour: THEME.body,
    maxLines: 2,
  });
  const legendY = box.y + 70 + Math.max(reading.height, 32) + 12;
  drawLegend(b, x, legendY, options.legend);

  const max = options.percent
    ? 100
    : niceScale(
        Math.max(
          1,
          ...options.points.flatMap((point) =>
            options.series.map((series) => {
              const value = (point as unknown as Record<string, unknown>)[series.key];
              return typeof value === "number" ? value : 0;
            }),
          ),
        ),
      ).max;
  const scale = options.percent
    ? { max: 100, ticks: [0, 25, 50, 75, 100] }
    : niceScale(max);

  const plotTop = legendY + 40;
  drawLineChart(
    b,
    { x, y: plotTop, w, h: box.y + box.h - 20 - plotTop },
    {
      points: options.points as unknown as ReadonlyArray<
        { date: string } & Record<string, unknown>
      >,
      series: options.series,
      max: scale.max,
      ticks: scale.ticks,
      yLabel: (value) =>
        options.percent ? `${Math.round(value)}%` : String(Math.round(value)),
      today: options.today,
    },
  );
}

// ---------------------------------------------------------------------------
// Overdue and at-risk tasks, workload
// ---------------------------------------------------------------------------

export type AttentionRow = {
  id: string;
  title: string;
  pic: string;
  projectName?: string;
  due: string | null;
  daysLate: number | null;
  ps: number;
  flag: StatusFlagId;
};

const AT_RISK_FLAGS: ReadonlySet<StatusFlagId> = new Set([
  "SF-02",
  "SF-03",
  "SF-05",
  "SF-06",
]);

export type TaskForReport = CompositionTask & {
  initialStartDate: string | null;
  initialDueDate: string | null;
  updatedStartDate: string | null;
  updatedDueDate: string | null;
  progress: number;
};

export function collectAttention(input: {
  tasks: readonly TaskForReport[];
  health: ProjectScheduleHealth;
  holidayKeys: readonly string[];
  today: string;
}): { rows: AttentionRow[]; overdueCount: number; atRiskCount: number } {
  const composition = buildScheduleComposition({
    tasks: input.tasks,
    holidayKeys: input.holidayKeys,
    today: input.today,
  });
  const byId = new Map(input.tasks.map((task) => [task.id, task]));
  const rows: AttentionRow[] = [];
  const seen = new Set<string>();

  for (const overdue of composition.overdue) {
    const metrics = input.health.byId.get(overdue.id);
    const task = byId.get(overdue.id);
    if (!metrics || !task) continue;
    seen.add(overdue.id);
    rows.push({
      id: overdue.id,
      title: overdue.title,
      pic: overdue.pic,
      projectName: overdue.projectName,
      due: getEffectiveDueDate(task),
      daysLate: overdue.daysLate,
      ps: metrics.ps,
      flag: metrics.statusFlag,
    });
  }
  const overdueCount = rows.length;

  const atRisk = input.tasks
    .filter((task) => task.status !== "done" && !seen.has(task.id))
    .flatMap((task) => {
      const metrics = input.health.byId.get(task.id);
      if (!metrics || !AT_RISK_FLAGS.has(metrics.statusFlag)) return [];
      return [
        {
          id: task.id,
          title: task.title,
          pic: getTaskPicDisplayName(task),
          projectName: task.projectName,
          due: getEffectiveDueDate(task),
          daysLate: null,
          ps: metrics.ps,
          flag: metrics.statusFlag,
        } satisfies AttentionRow,
      ];
    })
    .sort((a, c) => a.ps - c.ps || a.title.localeCompare(c.title));

  return {
    rows: [...rows, ...atRisk],
    overdueCount,
    atRiskCount: atRisk.length,
  };
}

export type WorkloadRow = { name: string; openTasks: number; plannedDays: number };

export function collectWorkload(input: {
  tasks: readonly TaskForReport[];
  health: ProjectScheduleHealth;
}): WorkloadRow[] {
  const byPic = new Map<string, WorkloadRow>();
  for (const task of input.tasks) {
    if (task.status === "done") continue;
    const pics = listTaskPics(task);
    const names = pics.length > 0 ? pics.map(picLabel) : ["Unassigned"];
    const days = input.health.byId.get(task.id)?.dPlanned ?? 0;
    for (const name of names) {
      const row = byPic.get(name) ?? { name, openTasks: 0, plannedDays: 0 };
      row.openTasks += 1;
      row.plannedDays += days;
      byPic.set(name, row);
    }
  }
  return [...byPic.values()].sort(
    (a, c) =>
      c.plannedDays - a.plannedDays ||
      c.openTasks - a.openTasks ||
      a.name.localeCompare(c.name),
  );
}

export function attentionHeadline(input: {
  overdueCount: number;
  atRiskCount: number;
  rows: readonly AttentionRow[];
}): string {
  const { overdueCount, atRiskCount, rows } = input;
  if (overdueCount === 0 && atRiskCount === 0) {
    return "No tasks are overdue or at risk";
  }
  if (overdueCount > 0) {
    const longest = rows[0]?.daysLate ?? 0;
    return `${overdueCount} ${plural(overdueCount, "task is", "tasks are")} overdue, the longest by ${longest} ${plural(longest, "day")}`;
  }
  return `${atRiskCount} ${plural(atRiskCount, "task is", "tasks are")} at risk of slipping`;
}

export function attentionSlide(input: {
  b: SlideBuilder;
  eyebrow: string;
  attention: ReturnType<typeof collectAttention>;
  workload: readonly WorkloadRow[];
  withProject: boolean;
}): Slide {
  const { b, attention, workload } = input;
  const top = frame(b, {
    eyebrow: input.eyebrow,
    title: attentionHeadline({
      overdueCount: attention.overdueCount,
      atRiskCount: attention.atRiskCount,
      rows: attention.rows,
    }),
  });

  const shown = attention.rows.slice(0, 5);
  const rowH = 72;
  const extra = attention.rows.length - shown.length;
  const tableCardH =
    shown.length === 0 ? 150 : 28 + 52 + shown.length * rowH + (extra > 0 ? 54 : 24);
  b.card(LAYOUT.mx, top, LAYOUT.cw, tableCardH);

  if (shown.length === 0) {
    b.text({
      x: LAYOUT.mx + 40,
      y: top,
      w: LAYOUT.cw - 80,
      h: tableCardH,
      text: "Every open task is on or ahead of its plan.",
      size: 30,
      colour: THEME.body,
    });
  } else {
    const inner = LAYOUT.cw - 64;
    const columns: Column[] = input.withProject
      ? [
          { label: "Task", w: 460 },
          { label: "Project", w: 280 },
          { label: "PIC", w: 210 },
          { label: "Due", w: 160 },
          { label: "Late", w: 110, align: "right" },
          { label: "PS", w: 100, align: "right" },
        ]
      : [
          { label: "Task", w: 620 },
          { label: "PIC", w: 280 },
          { label: "Due", w: 180 },
          { label: "Late", w: 130, align: "right" },
          { label: "PS", w: 110, align: "right" },
        ];
    const used = columns.reduce((sum, column) => sum + column.w, 0);
    columns.push({ label: "Status", w: inner - used });

    const rows: Cell[][] = shown.map((row) => {
      const tone = flagTone(row.flag);
      const score = scoreTone(row.ps);
      const cells: Cell[] = [
        textCell(row.title, { bold: true, colour: THEME.ink }),
      ];
      if (input.withProject) cells.push(textCell(row.projectName ?? "—"));
      cells.push(
        textCell(row.pic, { maxLines: 2 }),
        textCell(auDate(row.due), { maxLines: 1 }),
        textCell(
          row.daysLate == null ? "—" : String(row.daysLate),
          {
            align: "right",
            bold: true,
            colour: row.daysLate != null ? THEME.rose : THEME.muted,
            maxLines: 1,
          },
        ),
        textCell(formatScore2(row.ps), {
          align: "right",
          bold: true,
          colour: score.ink,
          maxLines: 1,
        }),
        { kind: "pill", text: flagLabel(row.flag), tone },
      );
      return cells;
    });
    drawTable(
      b,
      { x: LAYOUT.mx + 32, y: top + 28, w: inner, h: 0 },
      columns,
      rows,
      { rowH },
    );
    if (extra > 0) {
      b.text({
        x: LAYOUT.mx + 32,
        y: top + tableCardH - 40,
        w: inner,
        text: `Plus ${extra} more ${plural(extra, "task")} on the Analytics screen.`,
        size: 22,
        colour: THEME.muted,
        h: 30,
      });
    }
  }

  // Workload by PIC.
  const wTop = top + tableCardH + 24;
  const wH = LAYOUT.bottom - wTop;
  b.card(LAYOUT.mx, wTop, LAYOUT.cw, wH);
  cardTitle(
    b,
    LAYOUT.mx + 32,
    wTop + 24,
    LAYOUT.cw - 64,
    "Workload by PIC",
  );
  b.text({
    x: LAYOUT.mx + 520,
    y: wTop + 28,
    w: LAYOUT.cw - 520 - 32,
    text:
      workload.length > 6
        ? `Open tasks and planned days. Top 6 of ${workload.length} shown.`
        : "Open tasks and the planned days still attached to them",
    size: 22,
    colour: THEME.muted,
    align: "right",
    h: 30,
  });
  if (workload.length === 0) {
    b.text({
      x: LAYOUT.mx + 32,
      y: wTop + 84,
      w: LAYOUT.cw - 64,
      text: "No open tasks.",
      size: 26,
      colour: THEME.muted,
    });
  } else {
    const shownPics = workload.slice(0, 6);
    const colW = (LAYOUT.cw - 64) / 6;
    const maxDays = Math.max(1, ...shownPics.map((row) => row.plannedDays));
    shownPics.forEach((row, index) => {
      const cx = LAYOUT.mx + 32 + index * colW;
      const innerW = colW - 28;
      b.text({
        x: cx,
        y: wTop + 70,
        w: innerW,
        text: row.name,
        size: 24,
        bold: true,
        colour: THEME.ink,
        h: 32,
      });
      b.text({
        x: cx,
        y: wTop + 104,
        w: innerW,
        text: String(row.plannedDays),
        size: 48,
        lh: 56,
        bold: true,
        colour: THEME.teal,
      });
      b.text({
        x: cx,
        y: wTop + 162,
        w: innerW,
        text: `planned days, ${row.openTasks} open ${plural(row.openTasks, "task")}`,
        size: 22,
        lh: 28,
        colour: THEME.muted,
        maxLines: 2,
      });
      b.rect({ x: cx, y: wTop + 230, w: innerW, h: 10, fill: THEME.track, radius: 5 });
      b.rect({
        x: cx,
        y: wTop + 230,
        w: Math.max(10, (row.plannedDays / maxDays) * innerW),
        h: 10,
        fill: THEME.teal,
        radius: 5,
      });
    });
  }
  return b.slide();
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

const SEVERITY_COLOUR: Record<string, string> = {
  critical: "#e11d48",
  high: "#f59e0b",
  medium: "#0ea5e9",
  low: "#a1a1aa",
};

export function issuesHeadline(intel: IssueIntelligence): string {
  const active = intel.statusCounts
    .filter((slice) => ["open", "in_progress", "blocked"].includes(slice.key))
    .reduce((sum, slice) => sum + slice.count, 0);
  if (active === 0) return "No issues are active";
  const parts = [`${active} ${plural(active, "issue is", "issues are")} active`];
  if (intel.criticalActive > 0) {
    parts.push(`${intel.criticalActive} ${plural(intel.criticalActive, "is", "are")} critical`);
  }
  return parts.join(", ");
}

export function activeIssueCount(intel: IssueIntelligence): number {
  return intel.statusCounts
    .filter((slice) => ["open", "in_progress", "blocked"].includes(slice.key))
    .reduce((sum, slice) => sum + slice.count, 0);
}

export function issuesSlide(input: {
  b: SlideBuilder;
  eyebrow: string;
  intel: IssueIntelligence;
  withProject: boolean;
}): Slide {
  const { b, intel } = input;
  const top = frame(b, { eyebrow: input.eyebrow, title: issuesHeadline(intel) });
  const active = activeIssueCount(intel);
  const count = (key: string) =>
    intel.statusCounts.find((slice) => slice.key === key)?.count ?? 0;

  scorecard(b, { x: LAYOUT.mx, y: top, w: LAYOUT.cw, h: SCORECARD_H }, [
    {
      label: "Active issues",
      value: String(active),
      sub: `${count("open")} open, ${count("in_progress")} in progress, ${count("blocked")} blocked`,
    },
    {
      label: "Critical and active",
      value: String(intel.criticalActive),
      valueColour: intel.criticalActive > 0 ? THEME.rose : THEME.ink,
      sub: intel.criticalActive > 0 ? "Needs attention first" : "None right now",
    },
    {
      label: "Past due date",
      value: String(intel.overdue),
      valueColour: intel.overdue > 0 ? THEME.amber : THEME.ink,
      sub: "Active issues past their updated due date",
    },
    {
      label: "Mean fix progress",
      value: formatPercent1(intel.meanProgress),
      sub: "Across active issues",
    },
    {
      label: "Closure rate",
      value: formatPercent1(intel.closureRate),
      sub: `${intel.totalNonCancelled} ${plural(intel.totalNonCancelled, "issue")} counted, ${intel.cancelled} cancelled`,
    },
  ]);

  const lowerTop = top + SCORECARD_H + 24;
  const lowerH = LAYOUT.bottom - lowerTop;
  const widths = [540, 540, LAYOUT.cw - 540 * 2 - 48];
  const xs = [LAYOUT.mx, LAYOUT.mx + 540 + 24, LAYOUT.mx + 540 * 2 + 48];

  // Severity.
  b.card(xs[0], lowerTop, widths[0], lowerH);
  cardTitle(b, xs[0] + 32, lowerTop + 24, widths[0] - 64, "By severity", "All counted issues");
  drawBarList(
    b,
    { x: xs[0] + 32, y: lowerTop + 100, w: widths[0] - 64, h: 0 },
    intel.severityStack.map((slice) => ({
      label: slice.label,
      value: slice.count,
      valueText: String(slice.count),
      colour: SEVERITY_COLOUR[slice.key] ?? THEME.zinc,
    })),
    { labelW: 140, valueW: 56, rowH: 60 },
  );

  // Category.
  b.card(xs[1], lowerTop, widths[1], lowerH);
  cardTitle(b, xs[1] + 32, lowerTop + 24, widths[1] - 64, "By category", "Most common first");
  const categories = [...intel.categoryStack].sort(
    (a, c) => c.count - a.count || a.label.localeCompare(c.label),
  );
  const shownCategories = categories.slice(0, 6);
  const rest = categories.slice(6).reduce((sum, slice) => sum + slice.count, 0);
  if (rest > 0) shownCategories.push({ key: "other", label: "Other", count: rest });
  drawBarList(
    b,
    { x: xs[1] + 32, y: lowerTop + 100, w: widths[1] - 64, h: 0 },
    shownCategories.map((slice) => ({
      label: slice.label,
      value: slice.count,
      valueText: String(slice.count),
      colour: THEME.sky,
    })),
    { labelW: 180, valueW: 56, rowH: 56, max: Math.max(1, ...shownCategories.map((s) => s.count)) },
  );

  // Recent activity.
  b.card(xs[2], lowerTop, widths[2], lowerH);
  cardTitle(b, xs[2] + 32, lowerTop + 24, widths[2] - 64, "Recent activity");
  const stream = intel.stream.slice(0, 4);
  if (stream.length === 0) {
    b.text({
      x: xs[2] + 32,
      y: lowerTop + 84,
      w: widths[2] - 64,
      text: "No activity recorded yet.",
      size: 24,
      colour: THEME.muted,
    });
  }
  const itemH = Math.min(116, (lowerH - 100) / Math.max(stream.length, 1));
  stream.forEach((item, index) => {
    const y = lowerTop + 84 + index * itemH;
    if (index > 0) b.line(xs[2] + 32, y - 8, xs[2] + widths[2] - 32, y - 8, THEME.border, 2);
    const head = input.withProject && item.projectName
      ? `${item.displayId}, ${item.projectName}`
      : item.displayId;
    b.text({
      x: xs[2] + 32,
      y,
      w: widths[2] - 64 - 150,
      text: head,
      size: 24,
      bold: true,
      colour: THEME.ink,
      h: 30,
    });
    b.text({
      x: xs[2] + widths[2] - 32 - 150,
      y,
      w: 150,
      text: auDate(item.at),
      size: 22,
      colour: THEME.muted,
      align: "right",
      h: 30,
    });
    b.text({
      x: xs[2] + 32,
      y: y + 34,
      w: widths[2] - 64,
      text: item.summary,
      size: 22,
      lh: 28,
      colour: THEME.body,
      maxLines: 2,
    });
  });
  return b.slide();
}

// ---------------------------------------------------------------------------
// Footers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Written note
// ---------------------------------------------------------------------------

/** A note already on the screen. An empty one is left out of the deck. */
export type ReportNote = {
  title: string;
  html: string;
  updatedAt: string | null;
  updatedByName: string | null;
};

const NOTE_SLIDE_CAP = 1;
const NOTE_SIZE = 26;
const NOTE_LH = 36;
const NOTE_HEAD = 30;
const NOTE_HEAD_LH = 40;

function noteStamp(note: ReportNote): string {
  const who = note.updatedByName?.trim();
  const when = note.updatedAt ? auDate(note.updatedAt) : "";
  if (who && when && when !== "-") return `Updated by ${who}  ·  ${when}`;
  if (who) return `Updated by ${who}`;
  return "";
}

/** How many wrapped lines fit, and the words that spill onto the next slide. */
function splitNoteText(
  measure: SlideBuilder["measure"],
  text: string,
  width: number,
  size: number,
  bold: boolean,
  lh: number,
  maxH: number,
): { taken: string; rest: string; height: number } {
  const all = wrapText(measure, text, width, size, bold, 400);
  const room = Math.max(1, Math.floor(maxH / lh));
  if (all.length <= room) {
    return { taken: text, rest: "", height: all.length * lh };
  }
  return {
    taken: all.slice(0, room).join(" "),
    rest: all.slice(room).join(" "),
    height: room * lh,
  };
}

type NotePiece = { block: NoteBlock; gapBefore: number; height: number };

/**
 * A long written note, on one slide of its own after the summary.
 * Anything that still does not fit stays on the screen.
 */
export function noteSlides(input: {
  measure: SlideBuilder["measure"];
  eyebrow: string;
  note: ReportNote | null | undefined;
}): Slide[] {
  if (!input.note) return [];
  const blocks = noteHtmlToBlocks(input.note.html);
  if (blocks.length === 0) return [];

  const stamp = noteStamp(input.note);
  const padX = 44;
  const padY = 36;
  const textW = LAYOUT.cw - padX * 2;
  const itemW = textW - 40;
  const stampH = stamp ? 44 : 0;
  const moreH = 40;

  const queue: NoteBlock[] = [...blocks];
  const pages: NotePiece[][] = [];
  let truncated = false;

  while (queue.length > 0 && pages.length < NOTE_SLIDE_CAP) {
    const lastPage = pages.length === NOTE_SLIDE_CAP - 1;
    const page: NotePiece[] = [];
    let used = 0;
    const limit = LAYOUT.bottom - LAYOUT.top - padY * 2 - stampH - (lastPage ? moreH : 0);

    while (queue.length > 0) {
      const block = queue[0]!;
      const gapBefore = page.length === 0 ? 0 : block.kind === "heading" ? 28 : 16;
      const width = block.kind === "item" ? itemW : textW;
      const size = block.kind === "heading" ? NOTE_HEAD : NOTE_SIZE;
      const lh = block.kind === "heading" ? NOTE_HEAD_LH : NOTE_LH;
      const bold = block.kind === "heading";
      const room = limit - used - gapBefore;
      if (room < lh) break;
      const split = splitNoteText(
        input.measure,
        block.text,
        width,
        size,
        bold,
        lh,
        room,
      );
      // Keep a heading with the line that follows it.
      if (
        block.kind === "heading" &&
        page.length > 0 &&
        queue.length > 1 &&
        room - split.height - 16 < NOTE_LH
      ) {
        break;
      }
      page.push({
        block:
          block.kind === "heading"
            ? { kind: "heading", level: block.level, text: split.taken }
            : block.kind === "item"
              ? { kind: "item", marker: block.marker, text: split.taken }
              : { kind: "paragraph", text: split.taken },
        gapBefore,
        height: split.height,
      });
      used += gapBefore + split.height;
      if (split.rest) {
        queue[0] =
          block.kind === "heading"
            ? { kind: "heading", level: block.level, text: split.rest }
            : block.kind === "item"
              ? { kind: "item", marker: "", text: split.rest }
              : { kind: "paragraph", text: split.rest };
        break;
      }
      queue.shift();
    }
    if (page.length === 0) break;
    pages.push(page);
  }
  truncated = queue.length > 0;
  if (pages.length === 0) return [];

  return pages.map((page, index) => {
    const b = new SlideBuilder(input.measure);
    const continued = index > 0;
    const showStamp = Boolean(stamp) && index === pages.length - 1;
    const showMore = truncated && index === pages.length - 1;
    const top = frame(b, {
      eyebrow: input.eyebrow,
      title: continued ? `${input.note!.title} (continued)` : input.note!.title,
    });
    const used = page.reduce((sum, piece) => sum + piece.gapBefore + piece.height, 0);
    const natural =
      padY + used + 24 + (showMore ? 40 : 0) + (showStamp ? 40 : 0) + padY;
    const cardH = Math.min(LAYOUT.bottom - top, Math.max(natural, 300));
    b.card(LAYOUT.mx, top, LAYOUT.cw, cardH);
    b.rect({
      x: LAYOUT.mx + 22,
      y: top + 28,
      w: 6,
      h: Math.max(48, cardH - 56),
      fill: THEME.teal,
      radius: 3,
    });

    let y = top + padY;
    for (const piece of page) {
      y += piece.gapBefore;
      const heading = piece.block.kind === "heading";
      const item = piece.block.kind === "item";
      const x = LAYOUT.mx + padX + (item ? 40 : 0);
      if (piece.block.kind === "item" && piece.block.marker) {
        b.text({
          x: LAYOUT.mx + padX,
          y,
          w: 36,
          text: piece.block.marker,
          size: NOTE_SIZE,
          lh: NOTE_LH,
          bold: true,
          colour: THEME.teal,
          maxLines: 1,
        });
      }
      const drawn = b.text({
        x,
        y,
        w: item ? itemW : textW,
        text: piece.block.text,
        size: heading ? NOTE_HEAD : NOTE_SIZE,
        lh: heading ? NOTE_HEAD_LH : NOTE_LH,
        bold: heading,
        colour: heading ? THEME.ink : THEME.body,
        maxLines: 40,
      });
      y += drawn.height;
    }

    const foot = top + cardH - padY - 28;
    if (truncated && index === pages.length - 1) {
      b.text({
        x: LAYOUT.mx + padX,
        y: foot - (stamp ? 40 : 0),
        w: textW,
        text: "The rest of this note is on the screen.",
        size: 22,
        colour: THEME.muted,
        maxLines: 1,
      });
    }
    if (stamp && index === pages.length - 1) {
      b.text({
        x: LAYOUT.mx + padX,
        y: foot,
        w: textW,
        text: stamp,
        size: 22,
        colour: THEME.muted,
        maxLines: 1,
      });
    }
    return b.slide();
  });
}

const SUMMARY_NOTE_MAX = 240;
const SUMMARY_NOTE_LEFT = 40;
const SUMMARY_NOTE_RIGHT = 32;
const SUMMARY_NOTE_TOP = 22;
const SUMMARY_NOTE_TITLE_LH = 32;
const SUMMARY_NOTE_BODY = 22;
const SUMMARY_NOTE_LH = 30;
const SUMMARY_NOTE_GAP = 8;
const SUMMARY_NOTE_STAMP_GAP = 12;
const SUMMARY_NOTE_STAMP_LH = 28;
const SUMMARY_NOTE_BOTTOM = 20;

/** Height of the takeaways card when every point is shown in full. */
export function takeawaysContentHeight(
  measure: SlideBuilder["measure"],
  width: number,
  insights: readonly Insight[],
): number {
  const textW = width - 64 - 30;
  const items = insights.slice(0, 3);
  let body = 0;
  items.forEach((item, index) => {
    body +=
      wrapText(measure, item.text, textW, 24, false, 5).length * 32 +
      (index > 0 ? 22 : 0);
  });
  // Same chrome as takeawaysCard: title block, then a 28px foot.
  return 112 + body;
}

function summaryNoteHeight(
  measure: SlideBuilder["measure"],
  note: ReportNote,
  width: number,
): number {
  const blocks = noteHtmlToBlocks(note.html);
  if (blocks.length === 0) return 0;
  const textW = width - SUMMARY_NOTE_LEFT - SUMMARY_NOTE_RIGHT;
  const itemW = textW - 32;
  let y = SUMMARY_NOTE_TOP + SUMMARY_NOTE_TITLE_LH + 10;
  blocks.forEach((block, index) => {
    if (index > 0) y += block.kind === "heading" ? 14 : SUMMARY_NOTE_GAP;
    const bold = block.kind === "heading";
    const w = block.kind === "item" ? itemW : textW;
    y += wrapText(measure, block.text, w, SUMMARY_NOTE_BODY, bold, 40).length * SUMMARY_NOTE_LH;
  });
  if (noteStamp(note)) y += SUMMARY_NOTE_STAMP_GAP + SUMMARY_NOTE_STAMP_LH;
  return y + SUMMARY_NOTE_BOTTOM;
}

/**
 * Empty: nothing. Short: a card under the takeaways, which keep every point
 * in full. Long: one slide of its own.
 */
export function placeSummaryNote(input: {
  measure: SlideBuilder["measure"];
  eyebrow: string;
  note: ReportNote | null | undefined;
  width: number;
  lowerH: number;
  insights: readonly Insight[];
}): { takeawaysH: number; noteH: number; slides: Slide[] } {
  const full = { takeawaysH: input.lowerH, noteH: 0, slides: [] as Slide[] };
  if (!input.note) return full;
  const noteH = summaryNoteHeight(input.measure, input.note, input.width);
  if (noteH === 0) return full;
  const contentH = takeawaysContentHeight(
    input.measure,
    input.width,
    input.insights,
  );
  const gap = 16;
  const room = input.lowerH - contentH - gap;
  if (noteH <= SUMMARY_NOTE_MAX && noteH <= room) {
    return {
      takeawaysH: input.lowerH - gap - noteH,
      noteH,
      slides: [],
    };
  }
  return {
    ...full,
    slides: noteSlides({
      measure: input.measure,
      eyebrow: input.eyebrow,
      note: input.note,
    }),
  };
}

/** Compact note card. `box.h` must be the height from `placeSummaryNote`. */
export function drawSummaryNote(
  b: SlideBuilder,
  box: Box,
  note: ReportNote,
): void {
  const blocks = noteHtmlToBlocks(note.html);
  if (blocks.length === 0) return;
  b.card(box.x, box.y, box.w, box.h);
  b.rect({
    x: box.x + 18,
    y: box.y + 18,
    w: 6,
    h: Math.max(36, box.h - 36),
    fill: THEME.teal,
    radius: 3,
  });
  const textW = box.w - SUMMARY_NOTE_LEFT - SUMMARY_NOTE_RIGHT;
  const itemW = textW - 32;
  let y = box.y + SUMMARY_NOTE_TOP;
  b.text({
    x: box.x + SUMMARY_NOTE_LEFT,
    y,
    w: textW,
    h: SUMMARY_NOTE_TITLE_LH,
    text: note.title,
    size: 24,
    lh: SUMMARY_NOTE_TITLE_LH,
    bold: true,
    colour: THEME.ink,
    maxLines: 1,
  });
  y += SUMMARY_NOTE_TITLE_LH + 10;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (index > 0) y += block.kind === "heading" ? 14 : SUMMARY_NOTE_GAP;
    const heading = block.kind === "heading";
    const item = block.kind === "item";
    if (item && block.marker) {
      b.text({
        x: box.x + SUMMARY_NOTE_LEFT,
        y,
        w: 28,
        text: block.marker,
        size: SUMMARY_NOTE_BODY,
        lh: SUMMARY_NOTE_LH,
        bold: true,
        colour: THEME.teal,
        maxLines: 1,
      });
    }
    const drawn = b.text({
      x: box.x + SUMMARY_NOTE_LEFT + (item ? 32 : 0),
      y,
      w: item ? itemW : textW,
      text: block.text,
      size: SUMMARY_NOTE_BODY,
      lh: SUMMARY_NOTE_LH,
      bold: heading,
      colour: heading ? THEME.ink : THEME.body,
      maxLines: 40,
    });
    y += drawn.height;
  }
  const stamp = noteStamp(note);
  if (stamp) {
    b.text({
      x: box.x + SUMMARY_NOTE_LEFT,
      y: y + SUMMARY_NOTE_STAMP_GAP,
      w: textW,
      h: SUMMARY_NOTE_STAMP_LH,
      text: stamp,
      size: 22,
      lh: SUMMARY_NOTE_STAMP_LH,
      colour: THEME.muted,
      maxLines: 1,
    });
  }
}

export function addFooters(
  slides: readonly Slide[],
  input: {
    measure: SlideBuilder["measure"];
    reportName: string;
    scopeLabel: string;
    exportedBy: string;
    exportedAt: Date;
  },
): void {
  const total = slides.length;
  slides.forEach((slide, index) => {
    const b = new SlideBuilder(input.measure);
    b.line(LAYOUT.mx, 1008, LAYOUT.mx + LAYOUT.cw, 1008, THEME.border, 2);
    b.text({
      x: LAYOUT.mx,
      y: 1022,
      w: 860,
      text: `${input.reportName}  |  ${input.scopeLabel}`,
      size: 22,
      lh: 28,
      colour: THEME.muted,
    });
    const who = wrapText(input.measure, input.exportedBy, 340, 22, false, 1)[0];
    b.text({
      x: LAYOUT.mx + 880,
      y: 1022,
      w: 760,
      text: `Exported by ${who}  |  ${auDateTime(input.exportedAt)}`,
      size: 22,
      lh: 28,
      colour: THEME.muted,
      align: "right",
    });
    b.text({
      x: LAYOUT.mx + LAYOUT.cw - 120,
      y: 1022,
      w: 120,
      text: `${index + 1} / ${total}`,
      size: 22,
      lh: 28,
      bold: true,
      colour: THEME.ink,
      align: "right",
    });
    slide.shapes.push(...b.shapes);
  });
}
