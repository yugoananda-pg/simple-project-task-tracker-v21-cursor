import assert from "node:assert/strict";
import test from "node:test";

import { jsPDF } from "jspdf";

import { drawMilestoneKey, niceScale } from "@/src/lib/export/report-charts";
import { TONES, auDate, auDateTime, fileSafe, gapPhrase } from "@/src/lib/export/report-format";
import { buildProjectReport } from "@/src/lib/export/report-project";
import { createPdfMeasure } from "@/src/lib/export/render-pdf";
import {
  checkSlide,
  safeText,
  SlideBuilder,
  wrapText,
} from "@/src/lib/export/slide-kit";
import type { Issue, Milestone, Task } from "@/src/lib/types";

const jspdf = { jsPDF } as unknown as typeof import("jspdf");
const measure = createPdfMeasure(jspdf);

test("safeText swaps glyphs the PDF font cannot print", () => {
  assert.equal(safeText("PS ≥ 1.05 — ahead"), "PS >= 1.05 — ahead");
  assert.equal(safeText("Héllo"), "Héllo");
});

test("wrapText fits lines and ellipsises the last one", () => {
  const lines = wrapText(
    measure,
    "The quick brown fox jumps over the lazy dog more than once",
    220,
    24,
    false,
    2,
  );
  assert.equal(lines.length, 2);
  assert.match(lines[1], /…$/);
  assert.ok(measure(lines[0], 24, false) <= 220);
  assert.ok(measure(lines[1], 24, false) <= 220);
});

test("niceScale keeps at most five steps", () => {
  const scale = niceScale(87);
  assert.ok(scale.max >= 87);
  assert.ok(scale.ticks.length <= 6);
  assert.equal(scale.ticks[0], 0);
});

test("gapPhrase and Australian dates read in plain English", () => {
  assert.equal(gapPhrase(-12.34).text, "12.3 points behind target");
  assert.equal(auDate("2026-10-10"), "10/10/2026");
  assert.match(auDateTime(new Date("2026-10-10T06:41:00+00:00")), /10\/10\/2026/);
  assert.equal(fileSafe("E-Commerce / Redesign?"), "E-Commerce Redesign");
});

function task(
  extras: Partial<Task> & Pick<Task, "title" | "bucket" | "status">,
): Task {
  return {
    id: extras.id ?? extras.title,
    projectId: "p1",
    description: "",
    priority: "medium",
    assigneeId: null,
    assigneeName: "Sam Lee",
    initialStartDate: null,
    initialDueDate: null,
    updatedStartDate: null,
    updatedDueDate: null,
    actualStartDate: null,
    actualCompletionDate: null,
    progress: 0,
    sortOrder: 0,
    listSortOrder: 0,
    createdAt: "",
    createdBy: "",
    createdByName: "",
    updatedAt: "",
    updatedBy: "",
    updatedByName: "",
    ...extras,
    assignees:
      extras.assignees ??
      (extras.assigneeId || extras.assigneeName
        ? [
            {
              userId: extras.assigneeId ?? null,
              name: extras.assigneeName ?? "",
            },
          ]
        : [{ userId: null, name: "Sam Lee" }]),
  };
}

test("project report builds slides that stay on the canvas", () => {
  const tasks: Task[] = [
    task({
      title: "Build portal",
      bucket: "executing",
      status: "in_progress",
      progress: 40,
      assigneeName: "Aisha Khan",
      initialStartDate: "2026-08-01",
      initialDueDate: "2026-09-30",
      updatedStartDate: "2026-08-01",
      updatedDueDate: "2026-10-09",
      actualStartDate: "2026-08-03",
    }),
    task({
      title: "Kick-off",
      bucket: "initiating",
      status: "done",
      progress: 100,
      assigneeName: "Sam Lee",
      initialStartDate: "2026-07-01",
      initialDueDate: "2026-07-10",
      updatedStartDate: "2026-07-01",
      updatedDueDate: "2026-07-10",
      actualStartDate: "2026-07-01",
      actualCompletionDate: "2026-07-09",
    }),
  ];
  const milestones: Milestone[] = [
    {
      id: "m1",
      projectId: "p1",
      name: "Go-Live Announcement",
      description: "",
      initialTarget: "2026-10-30",
      updatedTarget: "2026-10-30",
      actualAchieved: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const issues: Issue[] = [];
  const input = {
    project: {
      name: "E-Commerce Mobile App Redesign",
      customProjectId: "ECOM-01",
      ownerName: "Jordan Pike",
      lifecycleStatus: "ACTIVE" as const,
    },
    tasks,
    issues,
    milestones,
    activities: [],
    events: [
      {
        taskId: "Build portal",
        progress: 40,
        occurredOn: "2026-10-10",
        source: "recorded" as const,
      },
      {
        taskId: "Kick-off",
        progress: 100,
        occurredOn: "2026-07-09",
        source: "recorded" as const,
      },
    ],
    holidayDateKeys: [],
    today: "2026-10-10",
    exportedBy: "UAT PM",
    exportedAt: new Date("2026-10-10T15:41:00+07:00"),
  };
  const report = buildProjectReport(input, measure);
  assert.ok(report.slides.length >= 4);
  const slideText = (slides: typeof report.slides, index: number) =>
    slides[index]!.shapes
      .flatMap((shape) => (shape.kind === "text" ? shape.lines : []))
      .join(" ");
  const withNote = buildProjectReport(
    {
      ...input,
      note: {
        html: "<p>Hold the go-live until the checkout fix is in.</p><ul><li>Tell the sponsor</li></ul>",
        updatedAt: "2026-10-08T12:00:00.000Z",
        updatedByName: "Jordan Pike",
      },
    },
    measure,
  );
  assert.equal(withNote.slides.length, report.slides.length);
  const summary = slideText(withNote.slides, 0);
  assert.match(summary, /Project note/);
  assert.match(summary, /Hold the go-live/);
  assert.match(summary, /Tell the sponsor/);
  assert.match(summary, /Updated by Jordan Pike/);
  assert.deepEqual(checkSlide(withNote.slides[0]!, measure), []);

  const empty = buildProjectReport(
    {
      ...input,
      note: { html: "<p><br></p>", updatedAt: null, updatedByName: null },
    },
    measure,
  );
  assert.equal(empty.slides.length, report.slides.length);
  assert.doesNotMatch(slideText(empty.slides, 0), /Project note/);

  const longReport = buildProjectReport(
    {
      ...input,
      note: {
        html: `<p>${"Hold the go-live until the checkout fix is in. ".repeat(30)}</p>`,
        updatedAt: "2026-10-08T12:00:00.000Z",
        updatedByName: "Jordan Pike",
      },
    },
    measure,
  );
  assert.equal(longReport.slides.length, report.slides.length + 1);
  assert.doesNotMatch(slideText(longReport.slides, 0), /Hold the go-live/);
  const dedicated = slideText(longReport.slides, 1);
  assert.match(dedicated, /Project note/);
  assert.match(dedicated, /Hold the go-live/);
  assert.match(dedicated, /Updated by Jordan Pike/);
  assert.deepEqual(checkSlide(longReport.slides[1]!, measure), []);

  const problems = report.slides.flatMap((slide, index) =>
    checkSlide(slide, measure).map((item) => `slide ${index + 1}: ${item}`),
  );
  assert.deepEqual(problems, []);
});

test("milestone key keeps the date with the title", () => {
  const b = new SlideBuilder(measure);
  drawMilestoneKey(
    b,
    { x: 72, y: 200, w: 1700, h: 220 },
    [
      { n: 1, name: "Go-live", detail: "Target 12 Oct 2026", tone: TONES.amber },
      {
        n: 2,
        name: "Regional sponsor acceptance of the rebuilt checkout, refund and settlement journey",
        detail: "Past target 3 Oct 2026",
        tone: TONES.rose,
      },
    ],
    2,
  );
  const slide = b.slide();
  const texts = slide.shapes.filter((shape) => shape.kind === "text");
  const goLive = texts.find((shape) => shape.lines[0]?.startsWith("Go-live"));
  const target = texts.find((shape) => shape.lines[0]?.startsWith("Target"));
  const lastLine = texts.find((shape) => shape.lines.join(" ").includes("settlement"));
  const past = texts.find((shape) => shape.lines[0]?.startsWith("Past target"));
  assert.ok(goLive && target && lastLine && past);
  assert.equal(target.y, goLive.y);
  assert.ok(target.x > goLive.x);
  assert.ok(target.x - goLive.x < 180);
  assert.equal(past.y, lastLine.y);
  assert.ok(past.x > lastLine.x);
  assert.ok(past.x - lastLine.x < 420);
  assert.deepEqual(checkSlide(slide, measure), []);
});

test("a wrapped heading does not sit on top of the next block", () => {
  const b = new SlideBuilder(measure);
  b.text({
    x: 72,
    y: 80,
    w: 400,
    text: "A reasonably long heading that will wrap",
    size: 44,
    lh: 54,
    bold: true,
    maxLines: 2,
  });
  b.text({
    x: 72,
    y: 200,
    w: 400,
    text: "Body under the heading",
    size: 24,
  });
  assert.deepEqual(checkSlide(b.slide(), measure), []);
});
