-- Wave 4A correction (FR-AUD-08): User is the actor master.
-- Drop denormalised name columns; resolve names via LEFT JOIN "User".
-- Seed the System audit actor as a durable User row (not an Auth login).

ALTER TABLE "Holiday" DROP COLUMN IF EXISTS "createdByName";
ALTER TABLE "Holiday" DROP COLUMN IF EXISTS "updatedByName";

ALTER TABLE "User" DROP COLUMN IF EXISTS "createdByName";
ALTER TABLE "User" DROP COLUMN IF EXISTS "updatedByName";

ALTER TABLE "Project" DROP COLUMN IF EXISTS "createdByName";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "updatedByName";

ALTER TABLE "ProjectMember" DROP COLUMN IF EXISTS "createdByName";
ALTER TABLE "ProjectMember" DROP COLUMN IF EXISTS "updatedByName";

ALTER TABLE "Milestone" DROP COLUMN IF EXISTS "createdByName";
ALTER TABLE "Milestone" DROP COLUMN IF EXISTS "updatedByName";

ALTER TABLE "Task" DROP COLUMN IF EXISTS "createdByName";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "updatedByName";

ALTER TABLE "Subtask" DROP COLUMN IF EXISTS "createdByName";
ALTER TABLE "Subtask" DROP COLUMN IF EXISTS "updatedByName";

ALTER TABLE "TaskComment" DROP COLUMN IF EXISTS "createdByName";
ALTER TABLE "TaskComment" DROP COLUMN IF EXISTS "updatedByName";

ALTER TABLE "Issue" DROP COLUMN IF EXISTS "createdByName";
ALTER TABLE "Issue" DROP COLUMN IF EXISTS "updatedByName";

ALTER TABLE "IssueComment" DROP COLUMN IF EXISTS "createdByName";
ALTER TABLE "IssueComment" DROP COLUMN IF EXISTS "updatedByName";

ALTER TABLE "IssueActivity" DROP COLUMN IF EXISTS "createdByName";
ALTER TABLE "PurgedProject" DROP COLUMN IF EXISTS "createdByName";

INSERT INTO "User" (
  id,
  email,
  name,
  "globalRole",
  "approvalStatus",
  "approvedAt",
  "dashboardAccess",
  "completedProjectAccess",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'system@internal',
  'System (automated)',
  'viewer',
  'APPROVED',
  NOW(),
  ARRAY[]::"DashboardScope"[],
  'NONE',
  NOW(),
  '00000000-0000-4000-8000-000000000001',
  NOW(),
  '00000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  "approvalStatus" = EXCLUDED."approvalStatus",
  "updatedAt" = NOW(),
  "updatedBy" = EXCLUDED.id;
