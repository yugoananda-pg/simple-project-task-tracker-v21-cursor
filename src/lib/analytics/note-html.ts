/**
 * Allow-list sanitiser for the per-project analytics note.
 * Stores only the tags the editor can produce.
 */

/** Ceiling for a saved note, enforced here and by a database CHECK constraint. */
export const NOTE_MAX_CHARS = 20_000;

const ALLOWED = new Set([
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "mark",
]);

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https:\/\//i.test(href) || /^http:\/\//i.test(href)) return href;
  if (/^mailto:/i.test(href) && !/[\s<>"]/.test(href)) return href;
  return null;
}

/** Map browser editor tags onto the allow-list before sanitising. */
export function normaliseEditorHtml(raw: string): string {
  return raw
    .replace(/<(\/?)b(\s|>)/gi, "<$1strong$2")
    .replace(/<(\/?)i(\s|>)/gi, "<$1em$2")
    .replace(/<(\/?)strike(\s|>)/gi, "<$1s$2")
    .replace(/<(\/?)del(\s|>)/gi, "<$1s$2")
    .replace(/<(\/?)div(\s|>)/gi, "<$1p$2")
    .replace(/<(\/?)h1(\s|>)/gi, "<$1h2$2");
}

/** Turn editor HTML into a safe fragment. Anything unexpected becomes text. */
export function sanitizeNoteHtml(raw: string): string {
  const withoutScripts = normaliseEditorHtml(raw)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  const parts = withoutScripts.split(/(<[^>]+>)/g);
  let html = "";
  for (const part of parts) {
    if (!part) continue;
    if (!part.startsWith("<")) {
      html += escapeText(part);
      continue;
    }
    const closing = /^<\/([a-z0-9]+)\s*>$/i.exec(part);
    if (closing) {
      const tag = closing[1]!.toLowerCase();
      if (ALLOWED.has(tag)) html += `</${tag}>`;
      continue;
    }
    const opening = /^<([a-z0-9]+)(\s[^>]*)?>$/i.exec(part);
    if (!opening) continue;
    const tag = opening[1]!.toLowerCase();
    if (!ALLOWED.has(tag)) continue;
    if (tag === "br") {
      html += "<br>";
      continue;
    }
    if (tag === "a") {
      const hrefMatch = /\shref\s*=\s*"([^"]*)"/i.exec(opening[2] ?? "");
      const href = hrefMatch ? safeHref(hrefMatch[1] ?? "") : null;
      html += href
        ? `<a href="${escapeText(href)}" rel="noopener noreferrer">`
        : "<a>";
      continue;
    }
    html += `<${tag}>`;
  }
  return html.trim().slice(0, 20_000);
}

export function textToNoteHtml(text: string): string {
  const trimmed = text.trim().slice(0, 8_000);
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => {
      const inner = escapeText(paragraph).replaceAll("\n", "<br>");
      return `<p>${inner}</p>`;
    })
    .join("");
}

export function noteHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function noteIsEmpty(html: string): boolean {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length === 0;
}

/** One block of a note, ready to lay out as plain report text. */
export type NoteBlock =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "item"; marker: string; text: string };

function decodeNoteText(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turn a saved note into headings, paragraphs and list items.
 * Bold, links and highlight stay as their words. An empty note is an empty list.
 */
export function noteHtmlToBlocks(html: string): NoteBlock[] {
  if (noteIsEmpty(html)) return [];
  const blocks: NoteBlock[] = [];
  const lists: Array<{ ordered: boolean; n: number }> = [];
  let mode: "p" | "h2" | "h3" | "li" | null = null;
  let buf = "";

  function flush() {
    const text = decodeNoteText(buf);
    buf = "";
    const current = mode;
    mode = null;
    if (!text || !current) return;
    if (current === "h2" || current === "h3") {
      blocks.push({ kind: "heading", level: current === "h2" ? 2 : 3, text });
      return;
    }
    if (current === "li") {
      const list = lists[lists.length - 1];
      const marker = list?.ordered ? `${list.n}.` : "•";
      if (list?.ordered) list.n += 1;
      blocks.push({ kind: "item", marker, text });
      return;
    }
    blocks.push({ kind: "paragraph", text });
  }

  for (const part of html.split(/(<[^>]+>)/g)) {
    if (!part) continue;
    if (!part.startsWith("<")) {
      buf += part;
      continue;
    }
    const closing = part.startsWith("</");
    const tag = /^<\/?([a-z0-9]+)/i.exec(part)?.[1]?.toLowerCase() ?? "";
    if (tag === "br") {
      buf += " ";
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      if (!closing) lists.push({ ordered: tag === "ol", n: 1 });
      else lists.pop();
      continue;
    }
    if (tag === "li") {
      if (closing) flush();
      else {
        flush();
        mode = "li";
      }
      continue;
    }
    if (tag === "p" || tag === "h2" || tag === "h3") {
      if (mode === "li") continue;
      if (closing) flush();
      else {
        flush();
        mode = tag;
      }
      continue;
    }
  }
  if (mode == null && decodeNoteText(buf)) mode = "p";
  flush();
  return blocks;
}
