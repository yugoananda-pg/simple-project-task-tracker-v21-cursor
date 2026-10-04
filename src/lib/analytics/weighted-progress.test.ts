import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toHolidaySet } from "@/src/lib/analytics/working-days";
import {
  computeProjectScheduleHealth,
  computeTargetProgressPercent,
  formatPercent1,
  round1,
} from "@/src/lib/analytics/weighted-progress";

function task(
  id: string,
  overrides: Partial<{
    progress: number;
    initialStartDate: string | null;
    initialDueDate: string | null;
    updatedStartDate: string | null;
    updatedDueDate: string | null;
    actualStartDate: string | null;
    actualCompletionDate: string | null;
  }> = {},
) {
  return {
    id,
    progress: overrides.progress ?? 0,
    initialStartDate: overrides.initialStartDate ?? null,
    initialDueDate: overrides.initialDueDate ?? null,
    updatedStartDate: overrides.updatedStartDate ?? null,
    updatedDueDate: overrides.updatedDueDate ?? null,
    actualStartDate: overrides.actualStartDate ?? null,
    actualCompletionDate: overrides.actualCompletionDate ?? null,
  };
}

describe("weighted-progress", () => {
  it("UAT-402: 10d + 2d → 83.3% / 16.7% weights", () => {
    // Mon 6 Jan 2025 – Fri 17 Jan 2025 = 10 WD; Mon 20 – Tue 21 Jan = 2 WD
    const health = computeProjectScheduleHealth(
      [
        task("a", {
          initialStartDate: "2025-01-06",
          initialDueDate: "2025-01-17",
        }),
        task("b", {
          initialStartDate: "2025-01-20",
          initialDueDate: "2025-01-21",
        }),
      ],
      [],
      "2025-01-06",
    );
    assert.equal(formatPercent1(health.byId.get("a")!.weightPercent), "83.3%");
    assert.equal(formatPercent1(health.byId.get("b")!.weightPercent), "16.7%");
  });

  it("overdue at 50%: P_target capped at 100%, PS 50%, Critically Delayed", () => {
    // 10 WD plan Mon 6 – Fri 17 Jan; asOf = Fri 24 Jan (5 WD after due)
    const start = "2025-01-06";
    const due = "2025-01-17";
    const asOf = "2025-01-24";
    const { dPlanned, pTarget } = computeTargetProgressPercent(
      start,
      due,
      asOf,
      toHolidaySet([]),
    );
    assert.equal(dPlanned, 10);
    assert.equal(round1(pTarget), 100);

    const health = computeProjectScheduleHealth(
      [
        task("a", {
          progress: 50,
          initialStartDate: start,
          initialDueDate: due,
        }),
      ],
      [],
      asOf,
    );
    const metrics = health.byId.get("a")!;
    assert.equal(round1(metrics.pTarget), 100);
    assert.equal(round1(metrics.ps), 50);
    assert.equal(metrics.statusFlag, "SF-06");
    assert.equal(health.statusFlag, "SF-06");
    assert.ok(health.pTargetProject <= 100);
  });

  it("UAT-404: future start at 0% → Due to Commence", () => {
    const health = computeProjectScheduleHealth(
      [
        task("a", {
          progress: 0,
          initialStartDate: "2025-02-10",
          initialDueDate: "2025-02-14",
        }),
      ],
      [],
      "2025-02-03",
    );
    assert.equal(health.byId.get("a")!.statusFlag, "SF-01");
  });

  it("holiday shortens Mon–Wed duration from 3 to 2", () => {
    const health = computeProjectScheduleHealth(
      [
        task("a", {
          initialStartDate: "2025-01-06",
          initialDueDate: "2025-01-08",
        }),
      ],
      ["2025-01-07"],
      "2025-01-06",
    );
    assert.equal(health.byId.get("a")!.dPlanned, 2);
  });

  it("late finish is Completed Severely Late, not Ahead", () => {
    // Planned Fri 7 Aug – Fri 14 Aug 2026 (6 WD); finished Sun 6 Sep 2026 (same day actuals).
    const health = computeProjectScheduleHealth(
      [
        task("late", {
          progress: 100,
          initialStartDate: "2026-08-07",
          initialDueDate: "2026-08-14",
          actualStartDate: "2026-09-06",
          actualCompletionDate: "2026-09-06",
        }),
      ],
      [],
      "2026-09-19",
    );
    const metrics = health.byId.get("late")!;
    assert.ok(metrics.ps < 85, `expected PS < 85, got ${metrics.ps}`);
    assert.equal(metrics.statusFlag, "SF-11");
  });

  it("early finish remains Completed Ahead of Schedule", () => {
    // Planned Mon 10 – Fri 21 Aug 2026 (10 WD); finished Wed 12 Aug (3 WD from start).
    const health = computeProjectScheduleHealth(
      [
        task("early", {
          progress: 100,
          initialStartDate: "2026-08-10",
          initialDueDate: "2026-08-21",
          actualStartDate: "2026-08-10",
          actualCompletionDate: "2026-08-12",
        }),
      ],
      [],
      "2026-08-12",
    );
    const metrics = health.byId.get("early")!;
    assert.ok(metrics.ps >= 105, `expected PS ≥ 105, got ${metrics.ps}`);
    assert.equal(metrics.statusFlag, "SF-08");
  });
});
