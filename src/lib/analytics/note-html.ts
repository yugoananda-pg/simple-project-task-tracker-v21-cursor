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
