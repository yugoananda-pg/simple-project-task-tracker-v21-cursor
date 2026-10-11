/**
 * PDF renderer. Draws a slide list as vector pages with jsPDF.
 *
 * The page is 960 by 540 points, so one slide pixel is half a point and the
 * page has the same 16:9 shape as the deck.
 */

import type { jsPDF as JsPdf } from "jspdf";

import {
  SLIDE_H,
  SLIDE_W,
  THEME,
  type Measure,
  type Slide,
} from "@/src/lib/export/slide-kit";

export type JsPdfModule = typeof import("jspdf");

/** Slide pixels to PDF points. */
const S = 0.5;

/** Font metrics used to lay out text in the Helvetica family. */
const ASCENT = 0.905;
const DESCENT = 0.212;

export function createPdfMeasure(module: JsPdfModule): Measure {
  const doc = new module.jsPDF({ unit: "pt", format: [SLIDE_W * S, SLIDE_H * S] });
  return (text, size, bold) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    return doc.getStringUnitWidth(text) * size;
  };
}

type Meta = {
  title: string;
  author: string;
  subject: string;
};

function dashPattern(width: number): number[] {
  // Same 4:3 dash and gap as PowerPoint's "dash" so both files match.
  return [4 * width * S, 3 * width * S];
}

function paint(
  doc: JsPdf,
  fill: string | undefined,
  stroke: string | undefined,
  strokeWidth: number | undefined,
): "F" | "S" | "FD" | null {
  if (fill) doc.setFillColor(fill);
  if (stroke) {
    doc.setDrawColor(stroke);
    doc.setLineWidth((strokeWidth ?? 1) * S);
  }
  if (fill && stroke) return "FD";
  if (fill) return "F";
  if (stroke) return "S";
  return null;
}

export function renderPdf(
  slides: readonly Slide[],
  module: JsPdfModule,
  meta: Meta,
): Blob {
  const doc = new module.jsPDF({
    unit: "pt",
    format: [SLIDE_W * S, SLIDE_H * S],
    orientation: "landscape",
    compress: true,
  });
  doc.setProperties({
    title: meta.title,
    author: meta.author,
    subject: meta.subject,
    creator: "Simple Project Task Tracker",
  });
  doc.setLineJoin("round");
  doc.setLineCap("round");

  slides.forEach((slide, index) => {
    if (index > 0) doc.addPage([SLIDE_W * S, SLIDE_H * S], "landscape");
    doc.setFillColor(THEME.canvas);
    doc.rect(0, 0, SLIDE_W * S, SLIDE_H * S, "F");

    for (const shape of slide.shapes) {
      switch (shape.kind) {
        case "rect": {
          const style = paint(doc, shape.fill, shape.stroke, shape.strokeWidth);
          if (!style) break;
          if (shape.radius && shape.radius > 0) {
            const r = Math.min(shape.radius, shape.w / 2, shape.h / 2) * S;
            doc.roundedRect(shape.x * S, shape.y * S, shape.w * S, shape.h * S, r, r, style);
          } else {
            doc.rect(shape.x * S, shape.y * S, shape.w * S, shape.h * S, style);
          }
          break;
        }
        case "line": {
          doc.setDrawColor(shape.colour);
          doc.setLineWidth(shape.width * S);
          doc.setLineDashPattern(shape.dash ? dashPattern(shape.width) : [], 0);
          doc.line(shape.x1 * S, shape.y1 * S, shape.x2 * S, shape.y2 * S);
          doc.setLineDashPattern([], 0);
          break;
        }
        case "poly": {
          const style = paint(doc, shape.fill, shape.stroke, shape.strokeWidth);
          if (!style) break;
          const [first, ...rest] = shape.points;
          let px = first[0];
          let py = first[1];
          const segments: Array<[number, number]> = rest.map(([x, y]) => {
            const seg: [number, number] = [(x - px) * S, (y - py) * S];
            px = x;
            py = y;
            return seg;
          });
          doc.setLineDashPattern(
            shape.dash ? dashPattern(shape.strokeWidth ?? 2) : [],
            0,
          );
          doc.lines(
            segments,
            first[0] * S,
            first[1] * S,
            [1, 1],
            style,
            shape.closed ?? false,
          );
          doc.setLineDashPattern([], 0);
          break;
        }
        case "ellipse": {
          const style = paint(doc, shape.fill, shape.stroke, shape.strokeWidth);
          if (!style) break;
          doc.ellipse(
            (shape.x + shape.w / 2) * S,
            (shape.y + shape.h / 2) * S,
            (shape.w / 2) * S,
            (shape.h / 2) * S,
            style,
          );
          break;
        }
        case "text": {
          doc.setFont("helvetica", shape.bold ? "bold" : "normal");
          doc.setFontSize(shape.size * S);
          doc.setTextColor(shape.colour);
          const anchor =
            shape.align === "left"
              ? shape.x
              : shape.align === "right"
                ? shape.x + shape.w
                : shape.x + shape.w / 2;
          // Centre the glyph box in each line so it sits like the PowerPoint text.
          const offset =
            (shape.lh - (ASCENT + DESCENT) * shape.size) / 2 +
            ASCENT * shape.size;
          shape.lines.forEach((line, row) => {
            if (!line) return;
            doc.text(line, anchor * S, (shape.y + row * shape.lh + offset) * S, {
              align: shape.align,
              baseline: "alphabetic",
            });
          });
          break;
        }
      }
    }
  });

  return doc.output("blob");
}
