/**
 * PowerPoint renderer. Draws a slide list as native, editable PowerPoint
 * shapes and text boxes with pptxgenjs.
 *
 * The deck is 13.333 by 7.5 inches, so one slide pixel is 1/144 inch and one
 * pixel of type is half a point.
 */

import type PptxGenJS from "pptxgenjs";

import {
  THEME,
  type Slide,
} from "@/src/lib/export/slide-kit";

export type PptxModule = { default: typeof PptxGenJS };

const INCH = 144;
const inch = (value: number) => value / INCH;
const hex = (colour: string) => colour.replace("#", "").toUpperCase();

/** Fonts are Arial in the deck. It matches Helvetica metrics in the PDF. */
const FONT = "Arial";

type Meta = {
  title: string;
  author: string;
  subject: string;
};

export async function renderPptx(
  slides: readonly Slide[],
  module: PptxModule,
  meta: Meta,
  output: "blob" | "nodebuffer" = "blob",
): Promise<Blob | Uint8Array> {
  const Pptx = module.default;
  const pptx = new Pptx();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = meta.title;
  pptx.author = meta.author;
  pptx.subject = meta.subject;
  pptx.company = "Simple Project Task Tracker";

  for (const source of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(THEME.canvas) };

    for (const shape of source.shapes) {
      switch (shape.kind) {
        case "rect": {
          const radius = Math.min(
            shape.radius ?? 0,
            shape.w / 2,
            shape.h / 2,
          );
          slide.addShape(
            radius > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect,
            {
              x: inch(shape.x),
              y: inch(shape.y),
              w: inch(shape.w),
              h: inch(shape.h),
              ...(radius > 0 ? { rectRadius: inch(radius) } : {}),
              fill: shape.fill
                ? { color: hex(shape.fill) }
                : { type: "none" },
              line: shape.stroke
                ? {
                    color: hex(shape.stroke),
                    width: (shape.strokeWidth ?? 1) * 0.5,
                  }
                : { type: "none" },
            },
          );
          break;
        }
        case "line": {
          const flipV = (shape.x2 - shape.x1) * (shape.y2 - shape.y1) < 0;
          slide.addShape(pptx.ShapeType.line, {
            x: inch(Math.min(shape.x1, shape.x2)),
            y: inch(Math.min(shape.y1, shape.y2)),
            w: inch(Math.abs(shape.x2 - shape.x1)),
            h: inch(Math.abs(shape.y2 - shape.y1)),
            flipV,
            line: {
              color: hex(shape.colour),
              width: shape.width * 0.5,
              dashType: shape.dash ? "dash" : "solid",
            },
          });
          break;
        }
        case "poly": {
          const xs = shape.points.map((p) => p[0]);
          const ys = shape.points.map((p) => p[1]);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const w = Math.max(Math.max(...xs) - minX, 1);
          const h = Math.max(Math.max(...ys) - minY, 1);
          const points: Array<
            { x: number; y: number; moveTo?: boolean } | { close: true }
          > = shape.points.map(([px, py], index) => ({
            x: inch(px - minX),
            y: inch(py - minY),
            ...(index === 0 ? { moveTo: true } : {}),
          }));
          if (shape.closed) points.push({ close: true });
          slide.addShape("custGeom" as typeof pptx.ShapeType.rect, {
            x: inch(minX),
            y: inch(minY),
            w: inch(w),
            h: inch(h),
            points,
            fill: shape.fill ? { color: hex(shape.fill) } : { type: "none" },
            line: shape.stroke
              ? {
                  color: hex(shape.stroke),
                  width: (shape.strokeWidth ?? 1) * 0.5,
                  dashType: shape.dash ? "dash" : "solid",
                }
              : { type: "none" },
          });
          break;
        }
        case "ellipse": {
          slide.addShape(pptx.ShapeType.ellipse, {
            x: inch(shape.x),
            y: inch(shape.y),
            w: inch(shape.w),
            h: inch(shape.h),
            fill: shape.fill ? { color: hex(shape.fill) } : { type: "none" },
            line: shape.stroke
              ? {
                  color: hex(shape.stroke),
                  width: (shape.strokeWidth ?? 1) * 0.5,
                }
              : { type: "none" },
          });
          break;
        }
        case "text": {
          const runs = shape.lines.map((line, index) => ({
            text: line,
            options: { breakLine: index < shape.lines.length - 1 },
          }));
          slide.addText(runs, {
            x: inch(shape.x),
            y: inch(shape.y),
            w: inch(shape.w),
            h: inch(shape.lines.length * shape.lh),
            fontFace: FONT,
            fontSize: shape.size * 0.5,
            bold: shape.bold,
            color: hex(shape.colour),
            align: shape.align,
            valign: "top",
            margin: 0,
            wrap: false,
            fit: "none",
            lineSpacing: shape.lh * 0.5,
            paraSpaceBefore: 0,
            paraSpaceAfter: 0,
          });
          break;
        }
      }
    }
  }

  const written = await pptx.write({ outputType: output });
  return written as Blob | Uint8Array;
}
