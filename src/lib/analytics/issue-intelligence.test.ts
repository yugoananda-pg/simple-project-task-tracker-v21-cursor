import assert from "node:assert/strict";
import test from "node:test";

import { buildIssueIntelligence } from "@/src/lib/analytics/issue-intelligence";
import type { IssueIntelIssue } from "@/src/lib/analytics/issue-intelligence";

function issue(overrides: Partial<IssueIntelIssue> = {}): IssueIntelIssue {
  return {
    id: "i1",
    issueNumber: 1,
    displayId: "ISS-001",
    status: "in_progress",
    severity: "critical",
    category: "technical",
    progress: 40,
    picName: "Yugo",
    updatedStartDate: "2026-10-01",
    updatedDueDate: "2026-10-20",
    actualStartDate: "2026-10-01",
    actualResolutionDate: null,
    raisedAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
    ...overrides,
  };
}

test("mean progress and today's fix realisation use current progress", () => {
  const intel = buildIssueIntelligence({
    today: "2026-10-08",
    issues: [issue()],
    activities: [
      {
        id: "a1",
        issueId: "i1",
        eventType: "PROGRESS_CHANGED",
        summary: "Progress changed",
        createdAt: "2026-10-08T01:00:00.000Z",
        createdByName: "Yugo",
        payload: { from: 0, to: 40 },
      },
    ],
  });

  assert.equal(intel.meanProgress, 40);
  assert.equal(intel.criticalActive, 1);
  assert.equal(intel.cancelled, 0);
  const today = intel.realisation.find((point) => point.date === "2026-10-08");
  assert.equal(today?.actual, 40);
  const before = intel.realisation.find((point) => point.date === "2026-10-02");
  assert.equal(before?.actual, 0);
});

test("cancelled issues stay out of the closure rate", () => {
  const intel = buildIssueIntelligence({
    today: "2026-10-08",
    issues: [
      issue({ id: "open", status: "open", progress: 0, severity: "low" }),
      issue({
        id: "done",
        issueNumber: 2,
        displayId: "ISS-002",
        status: "resolved",
        progress: 100,
      }),
      issue({
        id: "gone",
        issueNumber: 3,
        displayId: "ISS-003",
        status: "cancelled",
        progress: 0,
      }),
    ],
    activities: [],
  });

  assert.equal(intel.totalNonCancelled, 2);
  assert.equal(intel.cancelled, 1);
  assert.equal(intel.closureRate, 50);
  assert.equal(intel.empty, false);
});

test("a project with no issues is the empty state", () => {
  const intel = buildIssueIntelligence({
    today: "2026-10-08",
    issues: [],
    activities: [],
  });
  assert.equal(intel.empty, true);
  assert.equal(intel.meanIssuePs, null);
  assert.equal(intel.realisation.length, 0);
});
