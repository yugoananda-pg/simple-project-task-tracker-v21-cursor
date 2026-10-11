/**
 * Rule-based analytics takeaways. No model call. Each line cites the figure it used.
 */

import { formatPercent1, formatScore2, STATUS_FLAGS, type StatusFlagId } from "@/src/lib/analytics/weighted-progress";
import type { IssueIntelligence } from "@/src/lib/analytics/issue-intelligence";

export type Insight = {
  id: string;
  tone: "neutral" | "good" | "watch" | "urgent";
  text: string;
};

export function buildProjectInsights(input: {
  taskCount: number;
  projectPs: number;
  delta: number;
  statusFlag: StatusFlagId;
  pActual: number;
  pTarget: number;
  issues: IssueIntelligence;
}): Insight[] {
  const insights: Insight[] = [];
  if (input.taskCount === 0) {
    insights.push({
      id: "no-tasks",
      tone: "neutral",
      text: "No tasks are on this project, so the schedule score is not yet meaningful.",
    });
  } else {
    const flag = STATUS_FLAGS[input.statusFlag].label;
    insights.push({
      id: "ps",
      tone:
        input.projectPs >= 95 ? "good" : input.projectPs >= 85 ? "watch" : "urgent",
      text: `Project punctuality score is ${formatScore2(input.projectPs)} (${flag}). Actual progress is ${formatPercent1(input.pActual)} against a target of ${formatPercent1(input.pTarget)} (difference ${formatPercent1(input.delta)}).`,
    });
  }

  if (input.issues.empty) {
    insights.push({
      id: "no-issues",
      tone: "neutral",
      text: "No issues have been logged, so issue fix progress is not part of this readout.",
    });
    return insights;
  }

  if (input.issues.criticalActive > 0) {
    insights.push({
      id: "critical",
      tone: "urgent",
      text: `${input.issues.criticalActive} critical issue${input.issues.criticalActive === 1 ? " is" : "s are"} still active.`,
    });
  }
  if (input.issues.overdue > 0) {
    insights.push({
      id: "overdue",
      tone: "watch",
      text: `${input.issues.overdue} active issue${input.issues.overdue === 1 ? " is" : "s are"} past the updated due date.`,
    });
  }
  insights.push({
    id: "issues",
    tone: input.issues.meanProgress >= 80 ? "good" : "neutral",
    text: `Mean fix progress on active issues is ${formatPercent1(input.issues.meanProgress)}. Closure rate is ${formatPercent1(input.issues.closureRate)} across ${input.issues.totalNonCancelled} non-cancelled issue${input.issues.totalNonCancelled === 1 ? "" : "s"}.`,
  });

  return insights.slice(0, 5);
}
