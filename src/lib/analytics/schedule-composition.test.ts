import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildScheduleComposition } from "@/src/lib/analytics/schedule-composition";
import type { CompositionTask } from "@/src/lib/analytics/schedule-composition";

function task(
  overrides: Partial<CompositionTask> & Pick<CompositionTask, "id" | "title">,
): CompositionTask {
  return {
    status: "todo",
    bucket: "executing",
    assigneeId: null,
    assigneeName: "",
    initialStartDate: null,
    initialDueDate: null,
    updatedStartDate: null,
    updatedDueDate: null,
    ...overrides,
  };
}

describe("schedule composition", () => {
  const today = "2026-10-08";

  it("counts status, planned working days, and calendar days late", () => {
    const composition = buildScheduleComposition({
      today,
      holidayKeys: ["2026-10-07"],
      tasks: [
        task({
          id: "a",
          title: "Slab",
          status: "todo",
          bucket: "executing",
          initialStartDate: "2026-10-05",
          initialDueDate: "2026-10-09",
        }),
        task({
          id: "b",
          title: "Brief",
          status: "in_progress",
          bucket: "planning",
          assigneeName: "Ada",
          initialStartDate: "2026-09-28",
          initialDueDate: "2026-10-01",
        }),
        task({
          id: "c",
          title: "Close-out",
          status: "done",
          bucket: "initiating",
          initialStartDate: "2025-09-01",
          initialDueDate: "2025-09-05",
        }),
        task({
          id: "d",
          title: "Watch",
          status: "todo",
          bucket: "monitoring",
        }),
      ],
    });

    assert.deepEqual(
      composition.statusCounts.map((row) => [row.label, row.count]),
      [
        ["To Do", 2],
        ["Doing", 1],
        ["Done", 1],
      ],
    );
    assert.equal(
      composition.effortByGroup.find((row) => row.bucket === "executing")
        ?.plannedDays,
      4,
    );
    assert.equal(
      composition.effortByGroup.find((row) => row.bucket === "planning")
        ?.plannedDays,
      4,
    );
    assert.equal(
      composition.effortByGroup.find((row) => row.bucket === "monitoring")
        ?.plannedDays,
      0,
    );
    assert.equal(composition.overdue.length, 1);
    assert.equal(composition.overdue[0]?.title, "Brief");
    assert.equal(composition.overdue[0]?.pic, "Ada");
    assert.equal(composition.overdue[0]?.daysLate, 7);
  });

  it("leaves finished tasks off the overdue list", () => {
    const composition = buildScheduleComposition({
      today,
      holidayKeys: [],
      tasks: [
        task({
          id: "done",
          title: "Finished late",
          status: "done",
          initialDueDate: "2026-09-01",
        }),
      ],
    });
    assert.equal(composition.overdue.length, 0);
  });
});
