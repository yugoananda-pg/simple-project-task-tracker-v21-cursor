/**
 * Table drawing for the executive report. Cells wrap or truncate to their
 * column, so a long name can never run into the next one.
 */

import type { Box } from "@/src/lib/export/report-charts";
import type { Tone } from "@/src/lib/export/report-format";
import { SlideBuilder, THEME } from "@/src/lib/export/slide-kit";

export type Cell =
  | {
      kind: "text";
      text: string;
      bold?: boolean;
      colour?: string;
      align?: "left" | "center" | "right";
      maxLines?: number;
    }
  | { kind: "pill"; text: string; tone: Tone }
  | { kind: "badge"; n: number; tone: Tone; hollow?: boolean };

export type Column = {
  label: string;
  w: number;
  align?: "left" | "center" | "right";
};

const PAD = 14;

export function textCell(
  text: string,
  options: Omit<Extract<Cell, { kind: "text" }>, "kind" | "text"> = {},
): Cell {
  return { kind: "text", text, ...options };
}

export function drawTable(
  b: SlideBuilder,
  box: Box,
  columns: readonly Column[],
  rows: ReadonlyArray<readonly Cell[]>,
  options: { rowH?: number; headH?: number } = {},
): { bottom: number } {
  const rowH = options.rowH ?? 72;
  const headH = options.headH ?? 52;

  let cx = box.x;
  const xs = columns.map((column) => {
    const x = cx;
    cx += column.w;
    return x;
  });

  columns.forEach((column, index) => {
    b.text({
      x: xs[index] + PAD,
      y: box.y,
      w: column.w - PAD * 2,
      h: headH - 8,
      text: column.label,
      size: 22,
      bold: true,
      colour: THEME.muted,
      align: column.align ?? "left",
    });
  });
  b.line(box.x, box.y + headH - 4, box.x + box.w, box.y + headH - 4, THEME.rule, 2);

  rows.forEach((row, rowIndex) => {
    const top = box.y + headH + rowIndex * rowH;
    if (rowIndex > 0) {
      b.line(box.x, top, box.x + box.w, top, THEME.border, 2);
    }
    row.forEach((cell, index) => {
      const column = columns[index];
      if (!column) return;
      const x = xs[index] + PAD;
      const w = column.w - PAD * 2;
      if (cell.kind === "text") {
        b.text({
          x,
          y: top,
          w,
          h: rowH,
          text: cell.text,
          size: 24,
          lh: 30,
          bold: cell.bold,
          colour: cell.colour ?? THEME.body,
          align: cell.align ?? column.align ?? "left",
          maxLines: cell.maxLines ?? 2,
        });
      } else if (cell.kind === "pill") {
        const height = 42;
        const y = top + (rowH - height) / 2;
        if (column.align === "right") {
          // Measure first so the pill can sit against the right edge.
          const probe = new SlideBuilder(b.measure);
          const pillW = probe.pill(0, 0, cell.text, {
            size: 22,
            height,
            fill: cell.tone.fill,
            colour: cell.tone.ink,
            maxW: w,
            padX: 14,
          });
          b.pill(x + w - pillW, y, cell.text, {
            size: 22,
            height,
            fill: cell.tone.fill,
            colour: cell.tone.ink,
            maxW: w,
            padX: 14,
          });
        } else {
          b.pill(x, y, cell.text, {
            size: 22,
            height,
            fill: cell.tone.fill,
            colour: cell.tone.ink,
            maxW: w,
            padX: 14,
          });
        }
      } else {
        const d = 40;
        const bx = x;
        const by = top + (rowH - d) / 2;
        b.ellipse({
          x: bx,
          y: by,
          w: d,
          h: d,
          fill: cell.hollow ? THEME.white : cell.tone.bar,
          stroke: cell.hollow ? cell.tone.bar : undefined,
          strokeWidth: cell.hollow ? 4 : undefined,
        });
        b.text({
          x: bx,
          y: by,
          w: d,
          h: d,
          text: String(cell.n),
          size: 22,
          bold: true,
          colour: cell.hollow ? cell.tone.ink : THEME.white,
          align: "center",
        });
      }
    });
  });

  const bottom = box.y + headH + rows.length * rowH;
  b.line(box.x, bottom, box.x + box.w, bottom, THEME.border, 2);
  return { bottom };
}
