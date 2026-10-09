import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeNoteHtml, textToNoteHtml } from "@/src/lib/analytics/note-html";

test("note html drops scripts and keeps paragraphs", () => {
  const html = sanitizeNoteHtml(
    `<p>Safe</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>`,
  );
  assert.equal(html.includes("script"), false);
  assert.equal(html.includes("javascript"), false);
  assert.match(html, /<p>Safe<\/p>/);
});

test("editor bold tags become strong and scripts stay out", () => {
  const html = sanitizeNoteHtml(`<div><b>Keep</b></div><script>alert(1)</script>`);
  assert.match(html, /<p><strong>Keep<\/strong><\/p>/);
  assert.equal(html.includes("script"), false);
});

test("plain text becomes escaped paragraphs", () => {
  const html = textToNoteHtml("Line\n\n<b>no</b>");
  assert.match(html, /<p>Line<\/p>/);
  assert.match(html, /&lt;b&gt;no&lt;\/b&gt;/);
});
