import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planTaskImport, TASK_IMPORT_HEADERS } from "./task-import-rows";

const TODAY = "2026-10-08";

function sheet(dataRows: unknown[][], projectName = "Harbour upgrade"): unknown[][] {
  return [
    ["Project Name:", projectName],
    Array.from(TASK_IMPORT_HEADERS),
    ...dataRows,
  ];
}

function row(partial: Partial<Record<string, unknown>>): unknown[] {
  return [
    partial.group ?? "Executing",
    partial.task ?? "Lay the keel",
    partial.progress ?? "",
    partial.start ?? "2026-08-01",
    partial.end ?? "2026-08-15",
    partial.updatedStart ?? "",
    partial.updatedEnd ?? "",
    partial.actualStart ?? "",
    partial.actualEnd ?? "",
  ];
}

describe("planTaskImport", () => {
  it("rejects a workbook that does not start with the template labels", () => {
    const plan = planTaskImport({
      matrix: [["Task", "Progress"], ["A", "B"]],
      existing: [],
      today: TODAY,
    });
    assert.equal(plan.rows.length, 0);
    assert.ok(plan.errors.some((error) => /Project Name/.test(error.message)));
    assert.ok(plan.errors.some((error) => /A2/.test(error.message)));
  });

  it("treats a blank progress as 0% and copies blank updated dates", () => {
    const plan = planTaskImport({
      matrix: sheet([row({})]),
      existing: [],
      today: TODAY,
      openProjectName: "Harbour upgrade",
    });
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.notices.length, 0);
    assert.equal(plan.rows[0]?.progress, 0);
    assert.equal(plan.rows[0]?.status, "todo");
    assert.equal(plan.rows[0]?.updatedStartDate, "2026-08-01");
    assert.equal(plan.rows[0]?.updatedDueDate, "2026-08-15");
    assert.equal(plan.rows[0]?.actualStartDate, null);
  });

  it("skips a row with no task name and caps progress above 100%", () => {
    const plan = planTaskImport({
      matrix: sheet([
        row({ task: "", progress: 40, actualStart: "2026-08-02" }),
        row({
          task: "Over achieved",
          progress: { value: 1.5, percent: true },
          actualStart: "2026-08-02",
          actualEnd: "2026-08-10",
        }),
      ]),
      existing: [],
      today: TODAY,
    });
    assert.equal(plan.errors.length, 0);
    assert.equal(plan.rows.length, 1);
    assert.equal(plan.rows[0]?.title, "Over achieved");
    assert.equal(plan.rows[0]?.progress, 100);
    assert.match(plan.rows[0]?.warnings.join(" ") ?? "", /100%/);
  });

  it("maps Initiation and leaves an unknown group in Executing", () => {
    const plan = planTaskImport({
      matrix: sheet([
        row({ group: "Initiation", task: "Charter" }),
        row({ group: "Workshop", task: "Side meeting" }),
      ]),
      existing: [],
      today: TODAY,
    });
    assert.equal(plan.rows[0]?.bucket, "initiating");
    assert.equal(plan.rows[0]?.warnings.length, 0);
    assert.equal(plan.rows[1]?.bucket, "executing");
    assert.match(plan.rows[1]?.warnings[0] ?? "", /Workshop/);
  });

  it("blocks partial progress without a start, zero progress with a start, and 100% without an end", () => {
    const plan = planTaskImport({
      matrix: sheet([
        row({ task: "Started late", progress: { value: 0.4, percent: true } }),
        row({
          task: "Not started",
          progress: 0,
          actualStart: "2026-08-02",
        }),
        row({
          task: "Finished",
          progress: { value: 1, percent: true },
          actualStart: "2026-08-02",
        }),
      ]),
      existing: [],
      today: TODAY,
    });
    assert.equal(plan.rows.length, 0);
    assert.ok(plan.errors.some((error) => /between 1% and 99%/.test(error.message)));
    assert.ok(plan.errors.some((error) => /Progress is 0%/.test(error.message)));
    assert.ok(plan.errors.some((error) => /actual end is empty/.test(error.message)));
  });

  it("updates only the task in the same process group", () => {
    const plan = planTaskImport({
      matrix: sheet([
        row({
          group: "Planning",
          task: "Requirement gathering",
          progress: { value: 1, percent: true },
          actualStart: "2026-08-01",
          actualEnd: "2026-08-04",
        }),
      ]),
      existing: [
        { id: "init", title: "Requirement gathering", bucket: "initiating" },
        { id: "plan", title: "Requirement Gathering", bucket: "planning" },
      ],
      today: TODAY,
    });
    assert.equal(plan.errors.length, 0);
    assert.equal(plan.rows[0]?.action, "update");
    assert.equal(plan.rows[0]?.existingTaskId, "plan");
    assert.equal(plan.untouchedCount, 1);
  });

  it("rejects future actual dates, an end before its start, and a year outside 2000 to 2100", () => {
    const plan = planTaskImport({
      matrix: sheet([
        row({
          task: "Future start",
          progress: 40,
          actualStart: "2026-10-09",
        }),
        row({
          task: "Future end",
          progress: 100,
          actualStart: "2026-08-01",
          actualEnd: "2026-10-09",
        }),
        row({
          task: "Backwards actual",
          progress: 100,
          actualStart: "2026-08-20",
          actualEnd: "2026-08-02",
        }),
        row({
          task: "Backwards plan",
          start: "2026-08-15",
          end: "2026-08-01",
        }),
        row({
          task: "Backwards update",
          updatedStart: "2026-09-10",
          updatedEnd: "2026-09-01",
        }),
        row({
          task: "Old year",
          actualStart: "1902-12-12",
        }),
        row({
          task: "Mistyped year",
          start: "0227-12-12",
          end: "2026-08-15",
        }),
        row({
          task: "Impossible day",
          end: "2026-04-31",
        }),
        row({
          task: "Same day",
          progress: 100,
          actualStart: "2026-08-04",
          actualEnd: "2026-08-04",
        }),
      ]),
      existing: [],
      today: TODAY,
    });
    const messages = plan.errors.map((error) => error.message).join("\n");
    assert.equal(plan.rows.length, 1);
    assert.equal(plan.rows[0]?.title, "Same day");
    assert.match(messages, /Actual start cannot be in the future/);
    assert.match(messages, /Actual end cannot be in the future/);
    assert.match(messages, /Actual end cannot be earlier than the actual start/);
    assert.match(messages, /Initial end cannot be before the initial start/);
    assert.match(messages, /Updated finish cannot be before the updated start/);
    assert.match(messages, /Actual start must be a real date from 2000 to 2100/);
    assert.match(messages, /Initial start must be a real date from 2000 to 2100/);
    assert.match(messages, /Initial end is not a valid date/);
  });

  it("warns when the workbook project name differs, and still plans the rows", () => {
    const plan = planTaskImport({
      matrix: sheet([row({})], "Other programme"),
      existing: [],
      today: TODAY,
      openProjectName: "Harbour upgrade",
    });
    assert.equal(plan.rows.length, 1);
    assert.match(plan.notices[0]?.message ?? "", /Other programme/);
  });
});
