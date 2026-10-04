/**
 * Domain types for Simple Project Task Tracker 2.0
 * Canonical models — aligned with doc/dev_plan.md Section 3.
 */

// ---------------------------------------------------------------------------
// Enums / union types
// ---------------------------------------------------------------------------

export type GlobalRole = "super_pm" | "pm" | "member" | "viewer";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export type DashboardScope = "PROJECT" | "PM_PORTFOLIO" | "TOTAL_COMPANY";

export type CompletedProjectAccess = "NONE" | "ASSIGNED" | "ALL";

export type TaskStatus = "todo" | "in_progress" | "done";

export type TaskPriority = "urgent" | "important" | "medium" | "low";

export type TaskBucket =
  | "initiating"
  | "planning"
  | "executing"
  | "monitoring"
  | "closing";

export type IssueCategory =
  | "scope"
  | "schedule"
  | "cost"
  | "quality"
  | "technical"
  | "resource"
  | "stakeholder"
  | "safety"
  | "commercial"
  | "other";

export type IssueSeverity = "critical" | "high" | "medium" | "low";

export type IssueStatus =
  | "open"
  | "in_progress"
  | "blocked"
  | "resolved"
  | "closed"
  | "cancelled";

export type IssueActivityType =
  | "RAISED"
  | "STATUS_CHANGED"
  | "PROGRESS_CHANGED"
  | "PIC_CHANGED"
  | "DATES_CHANGED"
  | "CLASSIFICATION_CHANGED"
  | "COMMENTED"
  | "CLOSED"
  | "CANCELLED";

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  globalRole: GlobalRole;
  approvalStatus: ApprovalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  permittedUserIds: string[];
  lifecycleStatus: "ACTIVE" | "COMPLETED";
  progressReached100At: string | null;
  completedAt: string | null;
  completedBy: string | null;
  completionMethod: "MANUAL" | "AUTO_RETENTION" | null;
  completedPurgeDueAt: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  purgeDueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurgedProjectSummary {
  id: string;
  originalProjectId: string;
  name: string;
  description: string;
  ownerEmail: string;
  ownerName: string;
  lifecycleStatusAtPurge: "ACTIVE" | "COMPLETED";
  memberCount: number;
  taskCount: number;
  issueCount: number;
  milestoneCount: number;
  purgedAt: string;
  purgedByEmail: string;
  purgedByName: string;
  purgeTrigger:
    | "SUPER_PM_MANUAL"
    | "SOFT_DELETE_RETENTION_EXPIRED"
    | "COMPLETED_RETENTION_EXPIRED";
  purgeReason: string | null;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  isCompleted: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  bucket: TaskBucket;
  assigneeId: string | null;
  assigneeName: string;
  initialStartDate: string | null;
  initialDueDate: string | null;
  updatedStartDate: string | null;
  updatedDueDate: string | null;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
  /** Task completion percentage 0–100. */
  progress: number;
  /** Order within a Kanban status column. */
  sortOrder: number;
  createdAt: string;
  /** Actor UUID (persisted). */
  createdBy: string;
  /** Resolved login display name for UI (FR-AUD-06). */
  createdByName: string;
  updatedAt: string;
  /** Actor UUID (persisted). */
  updatedBy: string;
  /** Resolved login display name for UI (FR-AUD-06). */
  updatedByName: string;
  /** Optional nested checklist when loaded with relations */
  subtasks?: Subtask[];
  /** Optional nested comments when loaded with relations */
  comments?: TaskComment[];
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  description: string;
  initialTarget: string;
  updatedTarget: string;
  actualAchieved: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueComment {
  id: string;
  issueId: string;
  userId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface IssueActivity {
  id: string;
  projectId: string;
  issueId: string;
  eventType: IssueActivityType;
  summary: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
}

export interface Issue {
  id: string;
  projectId: string;
  issueNumber: number;
  /** Display id e.g. ISS-001 */
  displayId: string;
  title: string;
  description: string;
  category: IssueCategory;
  severity: IssueSeverity;
  status: IssueStatus;
  picId: string | null;
  picName: string;
  raisedBy: string;
  raisedAt: string;
  initialStartDate: string | null;
  initialDueDate: string | null;
  updatedStartDate: string | null;
  updatedDueDate: string | null;
  actualStartDate: string | null;
  actualResolutionDate: string | null;
  progress: number;
  impactSummary: string;
  resolutionSummary: string;
  relatedTaskId: string | null;
  relatedMilestoneId: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  comments?: IssueComment[];
  activities?: IssueActivity[];
}
