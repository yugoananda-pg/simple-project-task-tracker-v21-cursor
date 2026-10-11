/**
 * Slide kit for the executive report.
 *
 * One slide is a flat list of drawing primitives on a 1920 by 1080 canvas.
 * The PDF and PowerPoint renderers both draw the same list, so the two files
 * look the same. Text is wrapped here, once, against real font metrics, and
 * handed to the renderers as finished lines. Nothing is left to reflow.
 */

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

/** Print-first palette. Text colours all clear 4.5:1 on white. */
export const THEME = {
  canvas: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  rule: "#cbd5e1",
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  track: "#e2e8f0",
  emerald: "#059669",
  emeraldSoft: "#d1fae5",
  teal: "#0f766e",
  tealSoft: "#ccfbf1",
  sky: "#0284c7",
  skySoft: "#e0f2fe",
  amber: "#b45309",
  amberBar: "#f59e0b",
  amberSoft: "#fef3c7",
  rose: "#be123c",
  roseBar: "#e11d48",
  roseSoft: "#ffe4e6",
  indigo: "#4338ca",
  indigoSoft: "#e0e7ff",
  zinc: "#71717a",
  zincSoft: "#f4f4f5",
  white: "#ffffff",
} as const;

export type Point = readonly [number, number];

export type RectShape = {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
};

export type LineShape = {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  colour: string;
  width: number;
  dash?: boolean;
};

export type PolyShape = {
  kind: "poly";
  points: readonly Point[];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: boolean;
  closed?: boolean;
};

export type EllipseShape = {
  kind: "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
};

export type TextShape = {
  kind: "text";
  x: number;
  /** Top of the first line. */
  y: number;
  /** Width the lines were fitted to. */
  w: number;
  lines: string[];
  size: number;
  /** Distance between line tops. */
  lh: number;
  bold: boolean;
  colour: string;
  align: "left" | "center" | "right";
};

export type Shape =
  | RectShape
  | LineShape
  | PolyShape
  | EllipseShape
  | TextShape;

export type Slide = { shapes: Shape[] };

/** Width in slide pixels of one string at a size. Supplied by the renderer. */
export type Measure = (text: string, sizePx: number, bold: boolean) => number;

// ---------------------------------------------------------------------------
// Text safety
// ---------------------------------------------------------------------------

const WIN_ANSI_EXTRAS = new Set(
  [..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"],
);

/**
 * The built-in PDF fonts speak Windows Latin-1. Anything outside it would
 * print as a broken glyph, so it is swapped for a plain equivalent here, and
 * both files carry the same text.
 */
export function safeText(input: string): string {
  let out = "";
  for (const ch of input.normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x2212 || code === 0x2011 || code === 0x2010) out += "-";
    else if (code === 0x2264) out += "<=";
    else if (code === 0x2265) out += ">=";
    else if (code === 0x00a0 || code === 0x2009 || code === 0x202f) out += " ";
    else if (code < 0x20 || code === 0x7f) out += " ";
    else if (code <= 0x7e || (code >= 0xa1 && code <= 0xff)) out += ch;
    else if (WIN_ANSI_EXTRAS.has(ch)) out += ch;
    else {
      const stripped = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (stripped && /^[\x20-\x7e]+$/.test(stripped)) out += stripped;
      else if (code > 0xffff || (code >= 0x2190 && code <= 0x2bff)) out += "";
      else out += "?";
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Wrapping
// ---------------------------------------------------------------------------

/** Keep a sliver of room so a renderer's rounding never tips a line over. */
const FIT = 0.97;

function ellipsise(
  measure: Measure,
  text: string,
  maxW: number,
  size: number,
  bold: boolean,
): string {
  if (measure(text, size, bold) <= maxW) return text;
  let cut = text.trimEnd();
  while (cut.length > 0 && measure(`${cut}…`, size, bold) > maxW) {
    cut = cut.slice(0, -1).trimEnd();
  }
  return `${cut}…`;
}

/** Break a single over-long word into pieces that each fit. */
function breakWord(
  measure: Measure,
  word: string,
  maxW: number,
  size: number,
  bold: boolean,
): string[] {
  const parts: string[] = [];
  let current = "";
  for (const ch of word) {
    if (current && measure(current + ch, size, bold) > maxW) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function wrapText(
  measure: Measure,
  raw: string,
  maxWidth: number,
  size: number,
  bold: boolean,
  maxLines: number,
): string[] {
  const text = safeText(raw);
  if (!text) return [""];
  const maxW = maxWidth * FIT;
  const words = text
    .split(" ")
    .flatMap((word) =>
      measure(word, size, bold) > maxW
        ? breakWord(measure, word, maxW, size, bold)
        : [word],
    );

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (!current || measure(next, size, bold) <= maxW) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const tail = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`;
  kept[maxLines - 1] = ellipsise(measure, tail, maxW, size, bold);
  return kept;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export type TextOptions = {
  x: number;
  y: number;
  w: number;
  text: string;
  size: number;
  bold?: boolean;
  colour?: string;
  align?: "left" | "center" | "right";
  /** Line pitch. Defaults to 1.3 times the size. */
  lh?: number;
  /** Most lines allowed. Defaults to one. */
  maxLines?: number;
  /** When set, the text is centred vertically in a box this tall. */
  h?: number;
};

export type TextResult = {
  lines: number;
  /** Height the text used. */
  height: number;
  /** Widest line. */
  width: number;
};

export class SlideBuilder {
  readonly shapes: Shape[] = [];

  constructor(readonly measure: Measure) {}

  rect(shape: Omit<RectShape, "kind">): void {
    this.shapes.push({ kind: "rect", ...shape });
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    colour: string,
    width = 2,
    dash = false,
  ): void {
    this.shapes.push({ kind: "line", x1, y1, x2, y2, colour, width, dash });
  }

  poly(shape: Omit<PolyShape, "kind">): void {
    if (shape.points.length < 2) return;
    this.shapes.push({ kind: "poly", ...shape });
  }

  ellipse(shape: Omit<EllipseShape, "kind">): void {
    this.shapes.push({ kind: "ellipse", ...shape });
  }

  /** Greedy wrap, fitted to the width, truncated with an ellipsis if needed. */
  text(options: TextOptions): TextResult {
    const size = options.size;
    const lh = options.lh ?? Math.round(size * 1.3);
    const bold = options.bold ?? false;
    const limit = options.h
      ? Math.max(1, Math.floor(options.h / lh))
      : (options.maxLines ?? 1);
    const maxLines = Math.min(limit, options.maxLines ?? limit);
    const lines = wrapText(
      this.measure,
      options.text,
      options.w,
      size,
      bold,
      maxLines,
    );
    const height = lines.length * lh;
    const top =
      options.h != null ? options.y + (options.h - height) / 2 : options.y;
    const width = Math.max(
      ...lines.map((line) => this.measure(line, size, bold)),
      0,
    );
    if (lines.length === 1 && lines[0] === "") return { lines: 0, height: 0, width: 0 };
    this.shapes.push({
      kind: "text",
      x: options.x,
      y: top,
      w: options.w,
      lines,
      size,
      lh,
      bold,
      colour: options.colour ?? THEME.ink,
      align: options.align ?? "left",
    });
    return { lines: lines.length, height, width };
  }

  /** The white card every panel sits on. */
  card(x: number, y: number, w: number, h: number): void {
    this.rect({
      x,
      y,
      w,
      h,
      fill: THEME.card,
      stroke: THEME.border,
      strokeWidth: 2,
      radius: 22,
    });
  }

  /** A filled pill with centred text. Returns its width. */
  pill(
    x: number,
    y: number,
    text: string,
    options: {
      size?: number;
      fill: string;
      colour: string;
      height?: number;
      padX?: number;
      maxW?: number;
    },
  ): number {
    const size = options.size ?? 22;
    const height = options.height ?? Math.round(size * 1.9);
    const padX = options.padX ?? 18;
    const label = safeText(text);
    const cap = (options.maxW ?? 600) - padX * 2;
    const shown = ellipsise(this.measure, label, cap * FIT, size, true);
    const w = Math.ceil(this.measure(shown, size, true) / FIT) + padX * 2;
    this.rect({
      x,
      y,
      w,
      h: height,
      fill: options.fill,
      radius: height / 2,
    });
    this.text({
      x,
      y,
      w,
      h: height,
      text: shown,
      size,
      bold: true,
      colour: options.colour,
      align: "center",
    });
    return w;
  }

  slide(): Slide {
    return { shapes: this.shapes };
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function textBounds(shape: TextShape, measure: Measure) {
  const width = Math.max(
    ...shape.lines.map((line) => measure(line, shape.size, shape.bold)),
    0,
  );
  const height = shape.lines.length * shape.lh;
  const left =
    shape.align === "left"
      ? shape.x
      : shape.align === "right"
        ? shape.x + shape.w - width
        : shape.x + (shape.w - width) / 2;
  return { left, top: shape.y, right: left + width, bottom: shape.y + height, width };
}

/**
 * Finds anything that would look broken: a line wider than its box, text or
 * shapes off the slide, and two blocks of text printed over each other.
 */
export function checkSlide(slide: Slide, measure: Measure): string[] {
  const problems: string[] = [];
  const texts = slide.shapes.filter((s): s is TextShape => s.kind === "text");
  const boxes = texts.map((shape) => ({ shape, ...textBounds(shape, measure) }));

  for (const box of boxes) {
    const label = box.shape.lines[0]?.slice(0, 40) ?? "";
    if (box.width > box.shape.w + 0.5) {
      problems.push(`Text wider than its box: "${label}"`);
    }
    if (
      box.left < -0.5 ||
      box.top < -0.5 ||
      box.right > SLIDE_W + 0.5 ||
      box.bottom > SLIDE_H + 0.5
    ) {
      problems.push(`Text off the slide: "${label}"`);
    }
    if (box.shape.size < 20) {
      problems.push(`Text too small (${box.shape.size}px): "${label}"`);
    }
  }

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 2 && overlapY > 2) {
        problems.push(
          `Text overlaps: "${a.shape.lines[0]?.slice(0, 30)}" and "${b.shape.lines[0]?.slice(0, 30)}"`,
        );
      }
    }
  }

  for (const shape of slide.shapes) {
    if (shape.kind === "rect" || shape.kind === "ellipse") {
      if (
        shape.x < -0.5 ||
        shape.y < -0.5 ||
        shape.x + shape.w > SLIDE_W + 0.5 ||
        shape.y + shape.h > SLIDE_H + 0.5
      ) {
        problems.push(`Shape off the slide at ${shape.x},${shape.y}`);
      }
    }
    if (shape.kind === "poly") {
      for (const [px, py] of shape.points) {
        if (px < -0.5 || py < -0.5 || px > SLIDE_W + 0.5 || py > SLIDE_H + 0.5) {
          problems.push("Line or area off the slide");
          break;
        }
      }
    }
  }
  return problems;
}
