/**
 * Issue-level Fix schedule flag — reuses task PS / Status Flag formulae (FR-ISS-10).
 * Safe for client and server imports (no server-only boundary).
 */

import {
  computeTargetProgressPercent,
  computeTaskPunctualityScore,
  resolveHolidaySet,
  resolveStatusFlag,
  type StatusFlagId,
} from "@/src/lib/analytics/weighted-progress";
import { clampProgress, toLocalDateString } from "@/src/lib/task-defaults";
import type { Issue } from "@/src/lib/types";

export function computeIssueFixFlag(
  issue: Pick<
    Issue,
    | "progress"
    | "updatedStartDate"
    | "updatedDueDate"
    | "actualStartDate"
    | "actualResolutionDate"
  >,
  holidayKeys: string[],
  asOf: string = toLocalDateString(),
): StatusFlagId {
  const holidays = resolveHolidaySet(holidayKeys);
  const start = issue.updatedStartDate;
  const due = issue.updatedDueDate;
  const { dPlanned, pTarget } = computeTargetProgressPercent(
    start,
    due,
    asOf,
    holidays,
  );
  const pActual = clampProgress(issue.progress);
  const ps = computeTaskPunctualityScore({
    pActual,
    pTarget,
    startDate: start,
    dueDate: due,
    actualStartDate: issue.actualStartDate,
    actualCompletionDate: issue.actualResolutionDate,
    asOf,
    holidays,
    dPlanned,
  });
  return resolveStatusFlag({
    pActual,
    ps,
    startDate: start,
    asOf,
  });
}
