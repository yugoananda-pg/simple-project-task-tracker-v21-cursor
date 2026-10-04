-- Wave 4A-1: Full 2.1 schema — enums, lifecycle, Issue Log, audit stamps.
-- Existing rows are backfilled so NOT NULL actor columns remain valid.
-- Existing users are APPROVED (approval workflow ships in Wave 4B).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "DashboardScope" AS ENUM ('PROJECT', 'PM_PORTFOLIO', 'TOTAL_COMPANY');
CREATE TYPE "ProjectLifecycleStatus" AS ENUM ('ACTIVE', 'COMPLETED');
CREATE TYPE "CompletionMethod" AS ENUM ('MANUAL', 'AUTO_RETENTION');
CREATE TYPE "CompletedProjectAccess" AS ENUM ('NONE', 'ASSIGNED', 'ALL');
CREATE TYPE "PurgeTrigger" AS ENUM (
  'SUPER_PM_MANUAL',
  'SOFT_DELETE_RETENTION_EXPIRED',
  'COMPLETED_RETENTION_EXPIRED'
);
CREATE TYPE "IssueCategory" AS ENUM (
  'scope',
  'schedule',
  'cost',
  'quality',
  'technical',
  'resource',
  'stakeholder',
  'safety',
  'commercial',
  'other'
);
CREATE TYPE "IssueSeverity" AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE "IssueStatus" AS ENUM (
  'open',
  'in_progress',
  'blocked',
  'resolved',
  'closed',
  'cancelled'
);
CREATE TYPE "IssueActivityType" AS ENUM (
  'RAISED',
  'STATUS_CHANGED',
  'PROGRESS_CHANGED',
  'PIC_CHANGED',
  'DATES_CHANGED',
  'CLASSIFICATION_CHANGED',
  'COMMENTED',
  'CLOSED',
  'CANCELLED'
);

-- ---------------------------------------------------------------------------
-- User: governance + audit
-- ---------------------------------------------------------------------------

ALTER TABLE "User"
  ADD COLUMN "approvalStatus" "ApprovalStatus",
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedBy" UUID,
  ADD COLUMN "dashboardAccess" "DashboardScope"[] DEFAULT ARRAY['PROJECT', 'PM_PORTFOLIO']::"DashboardScope"[],
  ADD COLUMN "completedProjectAccess" "CompletedProjectAccess",
  ADD COLUMN "createdBy" UUID,
  ADD COLUMN "updatedBy" UUID;

UPDATE "User"
SET
  "approvalStatus" = 'APPROVED',
  "approvedAt" = "createdAt",
  "dashboardAccess" = ARRAY['PROJECT', 'PM_PORTFOLIO']::"DashboardScope"[],
  "completedProjectAccess" = CASE
    WHEN "globalRole" = 'super_pm' THEN 'ALL'::"CompletedProjectAccess"
    ELSE 'NONE'::"CompletedProjectAccess"
  END,
  "createdBy" = id,
  "updatedBy" = id;

ALTER TABLE "User"
  ALTER COLUMN "approvalStatus" SET NOT NULL,
  ALTER COLUMN "approvalStatus" SET DEFAULT 'PENDING'::"ApprovalStatus",
  ALTER COLUMN "dashboardAccess" SET NOT NULL,
  ALTER COLUMN "completedProjectAccess" SET NOT NULL,
  ALTER COLUMN "completedProjectAccess" SET DEFAULT 'NONE'::"CompletedProjectAccess",
  ALTER COLUMN "createdBy" SET NOT NULL,
  ALTER COLUMN "updatedBy" SET NOT NULL;

CREATE INDEX "User_approvalStatus_idx" ON "User"("approvalStatus");

-- ---------------------------------------------------------------------------
-- Project: lifecycle + audit
-- ---------------------------------------------------------------------------

ALTER TABLE "Project"
  ADD COLUMN "lifecycleStatus" "ProjectLifecycleStatus",
  ADD COLUMN "progressReached100At" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "completedBy" UUID,
  ADD COLUMN "completionMethod" "CompletionMethod",
  ADD COLUMN "completedPurgeDueAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedBy" UUID,
  ADD COLUMN "purgeDueAt" TIMESTAMP(3),
  ADD COLUMN "createdBy" UUID,
  ADD COLUMN "updatedBy" UUID;

UPDATE "Project"
SET
  "lifecycleStatus" = 'ACTIVE',
  "createdBy" = "ownerId",
  "updatedBy" = "ownerId";

ALTER TABLE "Project"
  ALTER COLUMN "lifecycleStatus" SET NOT NULL,
  ALTER COLUMN "lifecycleStatus" SET DEFAULT 'ACTIVE'::"ProjectLifecycleStatus",
  ALTER COLUMN "createdBy" SET NOT NULL,
  ALTER COLUMN "updatedBy" SET NOT NULL;

CREATE INDEX "Project_lifecycleStatus_deletedAt_idx"
  ON "Project"("lifecycleStatus", "deletedAt");
CREATE INDEX "Project_progressReached100At_idx" ON "Project"("progressReached100At");
CREATE INDEX "Project_completedPurgeDueAt_idx" ON "Project"("completedPurgeDueAt");
CREATE INDEX "Project_purgeDueAt_idx" ON "Project"("purgeDueAt");

-- ---------------------------------------------------------------------------
-- ProjectMember: canEdit + full audit
-- ---------------------------------------------------------------------------

ALTER TABLE "ProjectMember"
  ADD COLUMN "canEdit" BOOLEAN,
  ADD COLUMN "createdBy" UUID,
  ADD COLUMN "updatedAt" TIMESTAMP(3),
  ADD COLUMN "updatedBy" UUID;

UPDATE "ProjectMember" AS pm
SET
  "canEdit" = TRUE,
  "createdBy" = p."ownerId",
  "updatedAt" = pm."createdAt",
  "updatedBy" = p."ownerId"
FROM "Project" AS p
WHERE p.id = pm."projectId";

ALTER TABLE "ProjectMember"
  ALTER COLUMN "canEdit" SET NOT NULL,
  ALTER COLUMN "canEdit" SET DEFAULT TRUE,
  ALTER COLUMN "createdBy" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "updatedBy" SET NOT NULL;

CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");

-- ---------------------------------------------------------------------------
-- Task: weightOverride + audit
-- ---------------------------------------------------------------------------

ALTER TABLE "Task"
  ADD COLUMN "weightOverride" DOUBLE PRECISION,
  ADD COLUMN "createdBy" UUID,
  ADD COLUMN "updatedBy" UUID;

UPDATE "Task" AS t
SET
  "createdBy" = p."ownerId",
  "updatedBy" = p."ownerId"
FROM "Project" AS p
WHERE p.id = t."projectId";

ALTER TABLE "Task"
  ALTER COLUMN "createdBy" SET NOT NULL,
  ALTER COLUMN "updatedBy" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Subtask: audit
-- ---------------------------------------------------------------------------

ALTER TABLE "Subtask"
  ADD COLUMN "createdBy" UUID,
  ADD COLUMN "updatedBy" UUID;

UPDATE "Subtask" AS s
SET
  "createdBy" = t."createdBy",
  "updatedBy" = t."updatedBy"
FROM "Task" AS t
WHERE t.id = s."taskId";

ALTER TABLE "Subtask"
  ALTER COLUMN "createdBy" SET NOT NULL,
  ALTER COLUMN "updatedBy" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- TaskComment: full audit
-- ---------------------------------------------------------------------------

ALTER TABLE "TaskComment"
  ADD COLUMN "createdBy" UUID,
  ADD COLUMN "updatedAt" TIMESTAMP(3),
  ADD COLUMN "updatedBy" UUID;

UPDATE "TaskComment"
SET
  "createdBy" = "userId",
  "updatedAt" = "createdAt",
  "updatedBy" = "userId";

ALTER TABLE "TaskComment"
  ALTER COLUMN "createdBy" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "updatedBy" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

CREATE TABLE "Holiday" (
  "id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "isNational" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" UUID NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" UUID NOT NULL,
  CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

CREATE TABLE "Milestone" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT DEFAULT '',
  "initialTarget" DATE NOT NULL,
  "updatedTarget" DATE NOT NULL,
  "actualAchieved" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" UUID NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" UUID NOT NULL,
  CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Milestone_projectId_idx" ON "Milestone"("projectId");
CREATE INDEX "Milestone_updatedTarget_idx" ON "Milestone"("updatedTarget");

CREATE TABLE "Issue" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "issueNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "category" "IssueCategory" NOT NULL DEFAULT 'technical',
  "severity" "IssueSeverity" NOT NULL DEFAULT 'medium',
  "status" "IssueStatus" NOT NULL DEFAULT 'open',
  "picId" UUID,
  "picName" TEXT NOT NULL DEFAULT '',
  "raisedBy" UUID NOT NULL,
  "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "initialStartDate" DATE,
  "initialDueDate" DATE,
  "updatedStartDate" DATE,
  "updatedDueDate" DATE,
  "actualStartDate" DATE,
  "actualResolutionDate" DATE,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "impactSummary" TEXT NOT NULL DEFAULT '',
  "resolutionSummary" TEXT NOT NULL DEFAULT '',
  "relatedTaskId" UUID,
  "relatedMilestoneId" UUID,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" UUID NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" UUID NOT NULL,
  CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Issue_projectId_issueNumber_key" ON "Issue"("projectId", "issueNumber");
CREATE INDEX "Issue_projectId_status_severity_idx" ON "Issue"("projectId", "status", "severity");
CREATE INDEX "Issue_picId_idx" ON "Issue"("picId");
CREATE INDEX "Issue_updatedDueDate_idx" ON "Issue"("updatedDueDate");

CREATE TABLE "IssueComment" (
  "id" UUID NOT NULL,
  "issueId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" UUID NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" UUID NOT NULL,
  CONSTRAINT "IssueComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IssueComment_issueId_idx" ON "IssueComment"("issueId");
CREATE INDEX "IssueComment_userId_idx" ON "IssueComment"("userId");

CREATE TABLE "IssueActivity" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "issueId" UUID NOT NULL,
  "eventType" "IssueActivityType" NOT NULL,
  "summary" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" UUID NOT NULL,
  CONSTRAINT "IssueActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IssueActivity_projectId_createdAt_idx" ON "IssueActivity"("projectId", "createdAt");
CREATE INDEX "IssueActivity_issueId_createdAt_idx" ON "IssueActivity"("issueId", "createdAt");

CREATE TABLE "PurgedProject" (
  "id" UUID NOT NULL,
  "originalProjectId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "ownerId" UUID,
  "ownerEmail" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "lifecycleStatusAtPurge" "ProjectLifecycleStatus" NOT NULL,
  "createdAtOriginal" TIMESTAMP(3) NOT NULL,
  "createdByOriginal" UUID,
  "createdByEmailOriginal" TEXT,
  "updatedAtOriginal" TIMESTAMP(3) NOT NULL,
  "updatedByOriginal" UUID,
  "updatedByEmailOriginal" TEXT,
  "completedAt" TIMESTAMP(3),
  "completedBy" UUID,
  "completedByEmail" TEXT,
  "completionMethod" "CompletionMethod",
  "completedPurgeDueAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "deletedBy" UUID,
  "deletedByEmail" TEXT,
  "memberCount" INTEGER NOT NULL,
  "taskCount" INTEGER NOT NULL,
  "subtaskCount" INTEGER NOT NULL,
  "commentCount" INTEGER NOT NULL,
  "milestoneCount" INTEGER NOT NULL,
  "issueCount" INTEGER NOT NULL,
  "issueCommentCount" INTEGER NOT NULL,
  "issueActivityCount" INTEGER NOT NULL,
  "lastKnownActualProgress" DOUBLE PRECISION,
  "lastKnownTargetProgress" DOUBLE PRECISION,
  "snapshotJson" JSONB NOT NULL,
  "purgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "purgedBy" UUID NOT NULL,
  "purgedByEmail" TEXT NOT NULL,
  "purgedByName" TEXT NOT NULL,
  "purgeTrigger" "PurgeTrigger" NOT NULL,
  "purgeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" UUID NOT NULL,
  CONSTRAINT "PurgedProject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurgedProject_originalProjectId_idx" ON "PurgedProject"("originalProjectId");
CREATE INDEX "PurgedProject_purgedAt_idx" ON "PurgedProject"("purgedAt");
CREATE INDEX "PurgedProject_purgeTrigger_idx" ON "PurgedProject"("purgeTrigger");
CREATE INDEX "PurgedProject_ownerEmail_idx" ON "PurgedProject"("ownerEmail");

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "Milestone"
  ADD CONSTRAINT "Milestone_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_picId_fkey"
  FOREIGN KEY ("picId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_relatedTaskId_fkey"
  FOREIGN KEY ("relatedTaskId") REFERENCES "Task"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_relatedMilestoneId_fkey"
  FOREIGN KEY ("relatedMilestoneId") REFERENCES "Milestone"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IssueComment"
  ADD CONSTRAINT "IssueComment_issueId_fkey"
  FOREIGN KEY ("issueId") REFERENCES "Issue"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IssueComment"
  ADD CONSTRAINT "IssueComment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IssueActivity"
  ADD CONSTRAINT "IssueActivity_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IssueActivity"
  ADD CONSTRAINT "IssueActivity_issueId_fkey"
  FOREIGN KEY ("issueId") REFERENCES "Issue"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- RLS hardening (same posture as 20260901170000)
-- ---------------------------------------------------------------------------

ALTER TABLE "Holiday" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Milestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Issue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IssueComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IssueActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurgedProject" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "Holiday" FROM anon, authenticated;
REVOKE ALL ON TABLE "Milestone" FROM anon, authenticated;
REVOKE ALL ON TABLE "Issue" FROM anon, authenticated;
REVOKE ALL ON TABLE "IssueComment" FROM anon, authenticated;
REVOKE ALL ON TABLE "IssueActivity" FROM anon, authenticated;
REVOKE ALL ON TABLE "PurgedProject" FROM anon, authenticated;
