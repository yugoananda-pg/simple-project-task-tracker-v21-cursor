import assert from "node:assert/strict";
import test from "node:test";

import { buildIssueIntelligence } from "@/src/lib/analytics/issue-intelligence";
import { buildProjectInsights } from "@/src/lib/analytics/insights";

test("takeaways cite the punctuality figure", () => {
  const issues = buildIssueIntelligence({
    today: "2026-10-08",
    issues: [],
    activities: [],
  });
  const insights = buildProjectInsights({
    taskCount: 4,
    projectPs: 88.2,
    delta: -6.4,
    statusFlag: "SF-05",
    pActual: 40,
    pTarget: 46.4,
    issues,
  });
  const schedule = insights.find((item) => item.id === "ps");
  assert.ok(schedule);
  assert.match(schedule.text, /score is 0\.88/);
  assert.doesNotMatch(schedule.text, /88\.2%/);
  assert.match(schedule.text, /Slipping/);
});
