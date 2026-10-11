/**
 * Charts for the executive report, drawn from the slide kit's primitives so
 * the PDF and the PowerPoint file show exactly the same picture.
 */

import {
  dayNumber,
  type MacroActual,
  type MacroAxis,
  type MacroSpan,
} from "@/src/lib/analytics/portfolio";
import type { StatusFlagId } from "@/src/lib/analytics/weighted-progress";
import {
  axisDate,
  flagLabel,
  flagTone,
  TONES,
  type Tone,
} from "@/src/lib/export/report-format";
import {
  SlideBuilder,
  THEME,
  safeText,
  wrapText,
  type Point,
} from "@/src/lib/export/slide-kit";

export type Box = { x: number; y: number; w: number; h: number };

const DAY_MS = 86_400_000;

function isoFromDay(day: number): string {
  const date = new Date(day * DAY_MS + DAY_MS / 2);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dom = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${dom}`;
}

/** Round an axis ceiling up to a tidy figure with at most five steps. */
export function niceScale(max: number): { max: number; ticks: number[] } {
  const safe = Number.isFinite(max) && max > 0 ? max : 1;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  let step = steps[steps.length - 1];
  for (const candidate of steps) {
    if (Math.ceil(safe / candidate) <= 5) {
      step = candidate;
      break;
    }
  }
  const top = Math.max(step, Math.ceil(safe / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top + 1e-9; value += step) ticks.push(value);
  return { max: top, ticks };
}

// ---------------------------------------------------------------------------
// Line chart
// ---------------------------------------------------------------------------

export type LineSeries = {
  key: string;
  colour: string;
  dashed?: boolean;
  /** Solid tint filled under the line. */
  area?: string;
  width?: number;
};

export function drawLineChart(
  b: SlideBuilder,
  box: Box,
  options: {
    points: ReadonlyArray<{ date: string } & Record<string, unknown>>;
    series: readonly LineSeries[];
    max: number;
    ticks: readonly number[];
    yLabel: (value: number) => string;
    today?: string | null;
  },
): void {
  const days = options.points
    .map((point) => dayNumber(point.date))
    .filter((day): day is number => day != null);
  if (days.length < 2) {
    b.text({
      x: box.x,
      y: box.y + box.h / 2 - 20,
      w: box.w,
      text: "Add task dates to plot this chart.",
      size: 26,
      colour: THEME.muted,
      align: "center",
    });
    return;
  }

  const plotLeft = box.x + 100;
  const plotRight = box.x + box.w - 28;
  const plotTop = box.y + 40;
  const plotBottom = box.y + box.h - 54;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;
  const first = Math.min(...days);
  const last = Math.max(...days);
  const span = Math.max(1, last - first);
  const px = (day: number) => plotLeft + ((day - first) / span) * plotW;
  const py = (value: number) =>
    plotBottom - (Math.min(Math.max(value, 0), options.max) / options.max) * plotH;

  // Series. Area first so the lines sit on top.
  const stride = Math.max(1, Math.ceil(options.points.length / 180));
  const sample = options.points.filter(
    (_, index) => index % stride === 0 || index === options.points.length - 1,
  );
  const paths = options.series.map((series) => {
    const path: Point[] = [];
    for (const point of sample) {
      const value = point[series.key];
      const day = dayNumber(point.date);
      if (typeof value !== "number" || !Number.isFinite(value) || day == null) {
        if (path.length > 0) break;
        continue;
      }
      path.push([px(day), py(value)]);
    }
    return { series, path };
  });

  for (const { series, path } of paths) {
    if (series.area && path.length >= 2) {
      b.poly({
        points: [
          [path[0][0], plotBottom],
          ...path,
          [path[path.length - 1][0], plotBottom],
        ],
        fill: series.area,
        closed: true,
      });
    }
  }
  // Grid and value labels.
  for (const tick of options.ticks) {
    const y = py(tick);
    b.line(plotLeft, y, plotRight, y, THEME.border, 2);
    b.text({
      x: box.x,
      y: y - 15,
      w: plotLeft - box.x - 16,
      text: options.yLabel(tick),
      size: 22,
      colour: THEME.muted,
      align: "right",
      h: 30,
    });
  }

  // Dates along the bottom.
  const labelCount = Math.max(2, Math.min(6, Math.floor(plotW / 210)));
  for (let index = 0; index < labelCount; index += 1) {
    const day = first + Math.round((index * span) / (labelCount - 1));
    const x = px(day);
    b.line(x, plotBottom, x, plotBottom + 10, THEME.rule, 2);
    const align = index === 0 ? "left" : index === labelCount - 1 ? "right" : "center";
    const width = 190;
    b.text({
      x: align === "left" ? x - 4 : align === "right" ? x - width + 4 : x - width / 2,
      y: plotBottom + 18,
      w: width,
      text: axisDate(isoFromDay(day)),
      size: 22,
      colour: THEME.muted,
      align,
    });
  }

  // Today.
  const todayDay = options.today ? dayNumber(options.today) : null;
  if (todayDay != null && todayDay >= first && todayDay <= last) {
    const x = px(todayDay);
    b.line(x, plotTop - 6, x, plotBottom, THEME.roseBar, 2, true);
    const labelW = 90;
    const left = Math.min(Math.max(x - labelW / 2, plotLeft - 20), plotRight - labelW + 20);
    b.text({
      x: left,
      y: plotTop - 36,
      w: labelW,
      text: "Today",
      size: 22,
      bold: true,
      colour: THEME.rose,
      align: "center",
    });
  }

  for (const { series, path } of paths) {
    b.poly({
      points: path,
      stroke: series.colour,
      strokeWidth: series.width ?? 5,
      dash: series.dashed,
    });
  }
  // Dot on the end of every solid line, so "now" reads at a glance.
  for (const { series, path } of paths) {
    if (series.dashed || path.length < 2) continue;
    const end = path[path.length - 1];
    b.ellipse({
      x: end[0] - 11,
      y: end[1] - 11,
      w: 22,
      h: 22,
      fill: series.colour,
      stroke: THEME.white,
      strokeWidth: 4,
    });
  }
}

export function drawLegend(
  b: SlideBuilder,
  x: number,
  y: number,
  items: ReadonlyArray<{ label: string; colour: string; dashed?: boolean }>,
): void {
  let cursor = x;
  for (const item of items) {
    if (item.dashed) {
      b.line(cursor, y + 14, cursor + 18, y + 14, item.colour, 4);
      b.line(cursor + 26, y + 14, cursor + 44, y + 14, item.colour, 4);
      cursor += 44;
    } else {
      b.line(cursor, y + 14, cursor + 44, y + 14, item.colour, 5);
      cursor += 44;
    }
    cursor += 12;
    const result = b.text({
      x: cursor,
      y,
      w: 400,
      text: item.label,
      size: 22,
      colour: THEME.body,
      h: 28,
    });
    cursor += result.width + 36;
  }
}

// ---------------------------------------------------------------------------
// Bar list
// ---------------------------------------------------------------------------

export type BarRow = {
  label: string;
  value: number;
  valueText: string;
  colour: string;
  /** Small grey line under the label. */
  sub?: string;
};

export function drawBarList(
  b: SlideBuilder,
  box: Box,
  rows: readonly BarRow[],
  options: { max?: number; rowH?: number; labelW?: number; valueW?: number } = {},
): void {
  const rowH = options.rowH ?? 64;
  const labelW = options.labelW ?? 220;
  const valueW = options.valueW ?? 110;
  const max = options.max ?? Math.max(1, ...rows.map((row) => row.value));
  const barX = box.x + labelW + 16;
  const barW = Math.max(40, box.w - labelW - valueW - 32);
  rows.forEach((row, index) => {
    const y = box.y + index * rowH;
    const hasSub = Boolean(row.sub);
    b.text({
      x: box.x,
      y: y + (hasSub ? 2 : 0),
      w: labelW,
      text: row.label,
      size: 24,
      colour: THEME.ink,
      bold: hasSub,
      h: hasSub ? 30 : rowH - 8,
    });
    if (hasSub) {
      b.text({
        x: box.x,
        y: y + 32,
        w: labelW,
        text: row.sub ?? "",
        size: 22,
        colour: THEME.muted,
        h: 28,
      });
    }
    const barY = y + (rowH - 8 - 24) / 2;
    b.rect({ x: barX, y: barY, w: barW, h: 24, fill: THEME.track, radius: 12 });
    const filled = Math.max(0, Math.min(1, row.value / max)) * barW;
    if (filled > 0) {
      b.rect({
        x: barX,
        y: barY,
        w: Math.max(filled, 24),
        h: 24,
        fill: row.colour,
        radius: 12,
      });
    }
    b.text({
      x: barX + barW + 16,
      y,
      w: valueW,
      text: row.valueText,
      size: 24,
      bold: true,
      colour: THEME.ink,
      align: "right",
      h: rowH - 8,
    });
  });
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const BAR_H = 14;
const COLOURS = {
  initial: "#a1a1aa",
  updated: "#0ea5e9",
  actualOn: "#10b981",
  actualLate: "#f59e0b",
};

export type Badge = {
  n: number;
  date: string;
  tone: Tone;
  hollow?: boolean;
};

export type TimelineRowSpec = {
  name: string;
  sub?: string;
  initial: MacroSpan | null;
  updated: MacroSpan | null;
  actual: MacroActual | null;
  tone: "on" | "late";
  /** Numbered milestone badges drawn on the row, as on the portfolio view. */
  badges?: readonly Badge[];
  figures?: {
    score: string;
    scoreTone: Tone;
    progress: string;
    flag: StatusFlagId | null;
  };
};

/** A dashed vertical milestone line across every row, as on the process-group view. */
export type LineMarker = { n: number; date: string; tone: Tone };

export function drawTimeline(
  b: SlideBuilder,
  box: Box,
  options: {
    rows: readonly TimelineRowSpec[];
    axis: MacroAxis;
    today: string;
    markers?: readonly LineMarker[];
    rowH?: number;
    nameW?: number;
    nameLines?: number;
    nameHeading: string;
    withFigures: boolean;
  },
): { bottom: number } {
  const rowH = options.rowH ?? 96;
  const nameW = options.nameW ?? 290;
  const figuresW = options.withFigures ? 640 : 0;
  const trackX = box.x + nameW + 20;
  const trackW = box.w - nameW - 20 - figuresW - (options.withFigures ? 20 : 0);
  const { axis } = options;
  const x = (date: string) => trackX + (axis.pct(date) / 100) * trackW;

  // Milestone circles need a band above the rows. Neighbours stagger.
  const markers = [...(options.markers ?? [])].sort(
    (a, c) => axis.pct(a.date) - axis.pct(c.date),
  );
  const levelsX: number[] = [];
  const placed = markers.map((marker) => {
    const mx = x(marker.date);
    let level = levelsX.findIndex((last) => mx - last >= 40);
    if (level === -1) {
      if (levelsX.length < 3) level = levelsX.length;
      else level = levelsX.indexOf(Math.min(...levelsX));
    }
    levelsX[level] = mx;
    return { marker, mx, level };
  });
  const levels = markers.length === 0 ? 0 : levelsX.length;
  const tickBand = 44;
  const markerBand = levels * 40;
  const rowsTop = box.y + tickBand + markerBand + 6;
  const rowsBottom = rowsTop + options.rows.length * rowH;

  // Column heads.
  b.text({
    x: box.x,
    y: box.y + 4,
    w: nameW,
    text: options.nameHeading,
    size: 22,
    bold: true,
    colour: THEME.muted,
  });
  if (options.withFigures) {
    const fx = trackX + trackW + 20;
    b.text({ x: fx, y: box.y + 4, w: 90, text: "PS", size: 22, bold: true, colour: THEME.muted });
    b.text({ x: fx + 90, y: box.y + 4, w: 250, text: "Progress", size: 22, bold: true, colour: THEME.muted });
    b.text({ x: fx + 350, y: box.y + 4, w: 270, text: "Status", size: 22, bold: true, colour: THEME.muted });
  }

  // Month grid.
  for (const tick of axis.ticks) {
    const tx = trackX + (tick.pct / 100) * trackW;
    b.line(tx, rowsTop - 6, tx, rowsBottom, THEME.border, 2);
    b.text({
      x: tx + 6,
      y: box.y + 4,
      w: 150,
      text: tick.label,
      size: 22,
      colour: THEME.muted,
    });
  }
  b.line(box.x, rowsTop - 6, box.x + box.w, rowsTop - 6, THEME.rule, 2);

  // Rows.
  options.rows.forEach((row, index) => {
    const top = rowsTop + index * rowH;
    if (index > 0) b.line(box.x, top, box.x + box.w, top, THEME.border, 2);
    const nameLines = options.nameLines ?? 1;
    const nameResult = b.text({
      x: box.x,
      y: top + (row.sub ? 14 : 0),
      w: nameW,
      text: row.name,
      size: 26,
      bold: true,
      colour: THEME.ink,
      maxLines: nameLines,
      lh: 32,
      ...(row.sub ? {} : { h: rowH }),
    });
    if (row.sub) {
      b.text({
        x: box.x,
        y: top + 14 + nameResult.height + 2,
        w: nameW,
        text: row.sub,
        size: 22,
        colour: THEME.muted,
      });
    }

    const base = top + (rowH - 62) / 2;
    const barTop = { initial: base, updated: base + 24, actual: base + 48 };
    const bar = (
      span: { start: string; end: string } | null,
      y: number,
      colour: string,
    ) => {
      if (!span) return;
      const left = x(span.start);
      const width = Math.max(x(span.end) - left, 10);
      b.rect({ x: left, y, w: width, h: BAR_H, fill: colour, radius: BAR_H / 2 });
    };
    bar(row.initial, barTop.initial, COLOURS.initial);
    bar(row.updated, barTop.updated, COLOURS.updated);

    if (row.actual) {
      const colour = row.tone === "on" ? COLOURS.actualOn : COLOURS.actualLate;
      const left = x(row.actual.start);
      const solidRight = x(row.actual.solidEnd);
      b.rect({
        x: left,
        y: barTop.actual,
        w: Math.max(solidRight - left, 10),
        h: BAR_H,
        fill: colour,
        radius: BAR_H / 2,
      });
      if (row.actual.toToday) {
        const todayX = x(options.today);
        if (todayX - solidRight > 4) {
          b.rect({
            x: solidRight,
            y: barTop.actual,
            w: todayX - solidRight,
            h: BAR_H,
            fill: row.tone === "on" ? THEME.emeraldSoft : THEME.amberSoft,
            stroke: colour,
            strokeWidth: 2,
            radius: BAR_H / 2,
          });
        }
      }
    }

    for (const badge of row.badges ?? []) {
      const bx = x(badge.date);
      const by = barTop.updated + BAR_H / 2;
      b.ellipse({
        x: bx - 17,
        y: by - 17,
        w: 34,
        h: 34,
        fill: badge.hollow ? THEME.white : badge.tone.bar,
        stroke: badge.hollow ? badge.tone.bar : THEME.white,
        strokeWidth: badge.hollow ? 4 : 3,
      });
      b.text({
        x: bx - 17,
        y: by - 17,
        w: 34,
        h: 34,
        text: String(badge.n),
        size: 20,
        bold: true,
        colour: badge.hollow ? badge.tone.ink : THEME.white,
        align: "center",
      });
    }

    if (options.withFigures) {
      const fx = trackX + trackW + 20;
      if (row.figures) {
        b.text({
          x: fx,
          y: top,
          w: 90,
          h: rowH,
          text: row.figures.score,
          size: 30,
          bold: true,
          colour: row.figures.scoreTone.ink,
        });
        b.text({
          x: fx + 90,
          y: top,
          w: 250,
          h: rowH,
          text: row.figures.progress,
          size: 24,
          colour: THEME.body,
        });
        if (row.figures.flag) {
          const tone = flagTone(row.figures.flag);
          b.pill(fx + 350, top + (rowH - 42) / 2, flagLabel(row.figures.flag), {
            size: 22,
            height: 42,
            fill: tone.fill,
            colour: tone.ink,
            maxW: 270,
            padX: 14,
          });
        }
      } else {
        b.text({
          x: fx,
          y: top,
          w: 500,
          h: rowH,
          text: "No tasks",
          size: 24,
          colour: THEME.muted,
        });
      }
    }
  });
  b.line(box.x, rowsBottom, box.x + box.w, rowsBottom, THEME.border, 2);

  // Milestone lines and their numbered circles.
  for (const { marker, mx, level } of placed) {
    b.line(mx, box.y + tickBand + level * 40 + 34, mx, rowsBottom, marker.tone.bar, 2, true);
  }
  // Today sits above the milestone lines so it is never hidden.
  const todayPct = axis.todayPct;
  if (todayPct != null) {
    const tx = trackX + (todayPct / 100) * trackW;
    b.line(tx, rowsTop - 6, tx, rowsBottom + 4, THEME.roseBar, 3);
    b.text({
      x: tx - 50,
      y: rowsBottom + 8,
      w: 100,
      text: "Today",
      size: 22,
      bold: true,
      colour: THEME.rose,
      align: "center",
    });
  }
  for (const { marker, mx, level } of placed) {
    const cy = box.y + tickBand + level * 40 + 18;
    b.ellipse({
      x: mx - 17,
      y: cy - 17,
      w: 34,
      h: 34,
      fill: marker.tone.bar,
      stroke: THEME.white,
      strokeWidth: 3,
    });
    b.text({
      x: mx - 17,
      y: cy - 17,
      w: 34,
      h: 34,
      text: String(marker.n),
      size: 20,
      bold: true,
      colour: THEME.white,
      align: "center",
    });
  }

  return { bottom: rowsBottom + 8 + 30 };
}

export function drawTimelineLegend(
  b: SlideBuilder,
  x: number,
  y: number,
  maxW: number,
): number {
  const items: Array<{ label: string; fill: string; stroke?: string }> = [
    { label: "Initial plan", fill: COLOURS.initial },
    { label: "Updated plan", fill: COLOURS.updated },
    { label: "Actual, score 0.95 or more", fill: COLOURS.actualOn },
    { label: "Actual, score below 0.95", fill: COLOURS.actualLate },
    { label: "Running to today", fill: THEME.emeraldSoft, stroke: COLOURS.actualOn },
  ];
  let cursor = x;
  let row = 0;
  for (const item of items) {
    const label = b.measure(item.label, 22, false);
    const need = 44 + 12 + label + 40;
    if (cursor + need - 40 > x + maxW && cursor > x) {
      cursor = x;
      row += 1;
    }
    const top = y + row * 36;
    b.rect({
      x: cursor,
      y: top + 8,
      w: 44,
      h: 14,
      fill: item.fill,
      stroke: item.stroke,
      strokeWidth: item.stroke ? 2 : undefined,
      radius: 7,
    });
    b.text({
      x: cursor + 56,
      y: top,
      w: label + 20,
      text: item.label,
      size: 22,
      colour: THEME.body,
      h: 30,
    });
    cursor += need;
  }
  return (row + 1) * 36;
}

export type MilestoneKeyItem = {
  n: number;
  name: string;
  detail: string;
  tone: Tone;
};

/**
 * Numbered milestone key. The date sits just after the name. A long name
 * wraps, and the date moves to the next line under the name.
 */
export function drawMilestoneKey(
  b: SlideBuilder,
  box: Box,
  items: readonly MilestoneKeyItem[],
  cols = 3,
): { shown: number; more: number } {
  if (items.length === 0) return { shown: 0, more: 0 };
  const colGap = 36;
  const colW = (box.w - colGap * (cols - 1)) / cols;
  const badge = 28;
  const textX = badge + 12;
  const inner = colW - textX;
  const size = 22;
  const lh = 30;
  const dateGap = 14;
  const rowGap = 12;

  type Laid = {
    item: MilestoneKeyItem;
    name: string;
    detail: string;
    /** inline: one line. share: date follows the last wrapped line. stack: date underneath. */
    mode: "inline" | "share" | "stack";
    nameLines: string[];
    /** Glyph width of the line the date follows. */
    leadW: number;
    nameBox: number;
    height: number;
  };

  const laid: Laid[] = items.map((item) => {
    const name = safeText(item.name);
    const detail = safeText(item.detail);
    const nameW = b.measure(name, size, true);
    const dateW = b.measure(detail, size, false);
    // wrapText keeps 3% spare, so a box has to be a little wider than the glyphs.
    const nameBox = nameW / 0.97 + 2;
    const dateBox = dateW / 0.97 + 2;
    if (nameW + dateGap + dateBox <= inner) {
      return {
        item,
        name,
        detail,
        mode: "inline" as const,
        nameLines: [name],
        leadW: nameW,
        nameBox,
        height: Math.max(badge, lh),
      };
    }
    const nameLines = wrapText(b.measure, name, inner, size, true, 2);
    const last = nameLines[nameLines.length - 1] ?? "";
    const lastW = b.measure(last, size, true);
    const dateLines = wrapText(b.measure, detail, inner, size, false, 2);
    if (dateLines.length === 1 && lastW + dateGap + dateBox <= inner) {
      return {
        item,
        name,
        detail,
        mode: "share" as const,
        nameLines,
        leadW: lastW,
        nameBox: lastW / 0.97 + 2,
        height: Math.max(badge, nameLines.length * lh),
      };
    }
    return {
      item,
      name,
      detail,
      mode: "stack" as const,
      nameLines,
      leadW: inner,
      nameBox: inner,
      height: nameLines.length * lh + 4 + dateLines.length * lh,
    };
  });

  const rows: Laid[][] = [];
  let cursor = 0;
  let index = 0;
  while (index < laid.length) {
    const slice = laid.slice(index, index + cols);
    const rowH = Math.max(...slice.map((item) => item.height));
    const gap = rows.length > 0 ? rowGap : 0;
    const remaining = laid.length - index - slice.length;
    const tail = remaining > 0 ? rowGap + lh : 0;
    if (cursor + gap + rowH + tail > box.h) break;
    rows.push(slice);
    cursor += gap + rowH;
    index += slice.length;
  }

  const shown = rows.flat();
  const more = items.length - shown.length;
  let y = box.y;
  rows.forEach((row, rowIndex) => {
    const rowH = Math.max(...row.map((item) => item.height));
    row.forEach((item, col) => {
      const x = box.x + col * (colW + colGap);
      b.ellipse({ x, y: y + 1, w: badge, h: badge, fill: item.item.tone.bar });
      b.text({
        x,
        y: y + 1,
        w: badge,
        h: badge,
        text: String(item.item.n),
        size: 20,
        lh: badge,
        bold: true,
        colour: THEME.white,
        align: "center",
      });
      const dateAt = (lineY: number, leadW: number) => {
        b.text({
          x: x + textX + leadW + dateGap,
          y: lineY,
          w: Math.max(40, inner - leadW - dateGap),
          h: lh,
          text: item.detail,
          size,
          lh,
          colour: THEME.body,
          maxLines: 1,
        });
      };
      if (item.mode === "inline") {
        b.text({
          x: x + textX,
          y,
          w: item.nameBox,
          h: lh,
          text: item.name,
          size,
          lh,
          bold: true,
          colour: THEME.ink,
          maxLines: 1,
        });
        dateAt(y, item.leadW);
      } else if (item.mode === "share") {
        item.nameLines.forEach((line, lineIndex) => {
          const last = lineIndex === item.nameLines.length - 1;
          const lineW = b.measure(line, size, true);
          b.text({
            x: x + textX,
            y: y + lineIndex * lh,
            w: last ? item.nameBox : lineW / 0.97 + 2,
            h: lh,
            text: line,
            size,
            lh,
            bold: true,
            colour: THEME.ink,
            maxLines: 1,
          });
        });
        dateAt(y + (item.nameLines.length - 1) * lh, item.leadW);
      } else {
        const nameDrawn = b.text({
          x: x + textX,
          y,
          w: inner,
          text: item.name,
          size,
          lh,
          bold: true,
          colour: THEME.ink,
          maxLines: 2,
        });
        b.text({
          x: x + textX,
          y: y + nameDrawn.height + 4,
          w: inner,
          text: item.detail,
          size,
          lh,
          colour: THEME.body,
          maxLines: 2,
        });
      }
    });
    y += rowH;
    if (rowIndex < rows.length - 1) y += rowGap;
  });

  if (more > 0 && y + rowGap + lh <= box.y + box.h + 0.5) {
    b.text({
      x: box.x + textX,
      y: y + (shown.length > 0 ? rowGap : 0),
      w: box.w - textX,
      h: lh,
      text: `Plus ${more} more on the Milestones slide`,
      size,
      lh,
      colour: THEME.muted,
      maxLines: 1,
    });
  }
  return { shown: shown.length, more };
}

export { TONES };
