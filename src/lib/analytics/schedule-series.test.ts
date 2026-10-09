import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScheduleSeries,
  progressOnDay,
} from "@/src/lib/analytics/schedule-series";

test("actual progress follows recorded events and stops at today", () => {
  const series = buildScheduleSeries({
    today: "2026-10-08",
    tasks: [
      {
        id: "t1",
        progress: 100,
        initialStartDate: "2026-10-01",
        initialDueDate: "2026-10-10",
        updatedStartDate: "2026-10-01",
        updatedDueDate: "2026-10-10",
        actualStartDate: "2026-10-01",
        actualCompletionDate: "2026-10-08",
      },
    ],
    events: [
      {
        taskId: "t1",
        progress: 0,
        occurredOn: "2026-10-01T00:00:00.000Z",
        source: "recorded",
      },
      {
        taskId: "t1",
        progress: 100,
        occurredOn: "2026-10-08T00:00:00.000Z",
        source: "recorded",
      },
    ],
  });

  const before = series.points.find((point) => point.date === "2026-10-02");
  const onFinish = series.points.find((point) => point.date === "2026-10-08");
  const afterToday = series.points.find((point) => point.date === "2026-10-10");
  assert.equal(before?.actual, 0);
  assert.equal(onFinish?.actual, 100);
  assert.equal(afterToday?.actual, null);
  assert.ok((afterToday?.target ?? 0) >= (onFinish?.target ?? 0));
});

test("progress on a day uses the latest event on or before that day", () => {
  const events = [
    {
      taskId: "t",
      progress: 20,
      occurredOn: "2026-06-01",
      source: "backfill" as const,
    },
    {
      taskId: "t",
      progress: 80,
      occurredOn: "2026-07-01",
      source: "recorded" as const,
    },
  ];
  assert.equal(progressOnDay(events, "2026-05-01"), 0);
  assert.equal(progressOnDay(events, "2026-06-15"), 20);
  assert.equal(progressOnDay(events, "2026-07-01"), 80);
});
