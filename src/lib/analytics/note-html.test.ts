import assert from "node:assert/strict";
import test from "node:test";

import {
  noteHtmlToBlocks,
  sanitizeNoteHtml,
  textToNoteHtml,
} from "@/src/lib/analytics/note-html";

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

test("a saved note becomes headings, paragraphs and list items", () => {
  const blocks = noteHtmlToBlocks(
    `<p>Keep the <strong>vendor</strong> date.</p><h2>Ask</h2><ul><li>Confirm the window</li><li>Book the room</li></ul><p>&nbsp;</p>`,
  );
  assert.deepEqual(blocks, [
    { kind: "paragraph", text: "Keep the vendor date." },
    { kind: "heading", level: 2, text: "Ask" },
    { kind: "item", marker: "•", text: "Confirm the window" },
    { kind: "item", marker: "•", text: "Book the room" },
  ]);
  assert.deepEqual(noteHtmlToBlocks("<p><br></p>"), []);
  assert.deepEqual(
    noteHtmlToBlocks(`<ol><li>First</li><li>Second</li></ol>`),
    [
      { kind: "item", marker: "1.", text: "First" },
      { kind: "item", marker: "2.", text: "Second" },
    ],
  );
});

test("plain text becomes escaped paragraphs", () => {
  const html = textToNoteHtml("Line\n\n<b>no</b>");
  assert.match(html, /<p>Line<\/p>/);
  assert.match(html, /&lt;b&gt;no&lt;\/b&gt;/);
});
