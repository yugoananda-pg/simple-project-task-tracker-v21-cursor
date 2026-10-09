import type {
  IssueCategory,
  IssueSeverity,
  IssueStatus,
} from "@/src/lib/types";

export const ISSUE_SEVERITY_LABEL: Record<IssueSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  resolved: "Resolved",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  technical: "Technical",
  scope: "Scope",
  schedule: "Schedule",
  cost: "Cost",
  quality: "Quality",
  resource: "Resource",
  stakeholder: "Stakeholder",
  safety: "Safety",
  commercial: "Commercial",
  other: "Other",
};

/** Display id such as ISS-007. */
export function formatIssueId(issueNumber: number): string {
  return `ISS-${String(issueNumber).padStart(3, "0")}`;
}
