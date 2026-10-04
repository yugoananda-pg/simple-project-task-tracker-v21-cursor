-- Wave 4A follow-up: denormalised actor display names on every audited row.
-- Enables Supabase Table Editor / SQL to show who created or changed a record
-- without joining public.users. UUIDs remain for Safe User Deletion (no FK).

-- Four-stamp tables
ALTER TABLE "Holiday" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "Holiday" ADD COLUMN IF NOT EXISTS "updatedByName" TEXT;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedByName" TEXT;

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "updatedByName" TEXT;

ALTER TABLE "ProjectMember" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "ProjectMember" ADD COLUMN IF NOT EXISTS "updatedByName" TEXT;

ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "updatedByName" TEXT;

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "updatedByName" TEXT;

ALTER TABLE "Subtask" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "Subtask" ADD COLUMN IF NOT EXISTS "updatedByName" TEXT;

ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "updatedByName" TEXT;

ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "updatedByName" TEXT;

ALTER TABLE "IssueComment" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "IssueComment" ADD COLUMN IF NOT EXISTS "updatedByName" TEXT;

-- Create-only stamps
ALTER TABLE "IssueActivity" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "PurgedProject" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;

-- Backfill from users (live name). System / missing actors → System (automated) / Former user.
UPDATE "Holiday" h
SET
  "createdByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = h."createdBy"),
    CASE WHEN h."createdBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  ),
  "updatedByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = h."updatedBy"),
    CASE WHEN h."updatedBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  )
WHERE h."createdByName" IS NULL OR h."updatedByName" IS NULL;

UPDATE "User" u
SET
  "createdByName" = COALESCE(
    (SELECT src.name FROM "User" src WHERE src.id = u."createdBy"),
    u.name,
    CASE WHEN u."createdBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  ),
  "updatedByName" = COALESCE(
    (SELECT src.name FROM "User" src WHERE src.id = u."updatedBy"),
    u.name,
    CASE WHEN u."updatedBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  )
WHERE u."createdByName" IS NULL OR u."updatedByName" IS NULL;

UPDATE "Project" p
SET
  "createdByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = p."createdBy"),
    CASE WHEN p."createdBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  ),
  "updatedByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = p."updatedBy"),
    CASE WHEN p."updatedBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  )
WHERE p."createdByName" IS NULL OR p."updatedByName" IS NULL;

UPDATE "ProjectMember" pm
SET
  "createdByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = pm."createdBy"),
    CASE WHEN pm."createdBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  ),
  "updatedByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = pm."updatedBy"),
    CASE WHEN pm."updatedBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  )
WHERE pm."createdByName" IS NULL OR pm."updatedByName" IS NULL;

UPDATE "Milestone" m
SET
  "createdByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = m."createdBy"),
    CASE WHEN m."createdBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  ),
  "updatedByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = m."updatedBy"),
    CASE WHEN m."updatedBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  )
WHERE m."createdByName" IS NULL OR m."updatedByName" IS NULL;

UPDATE "Task" t
SET
  "createdByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = t."createdBy"),
    CASE WHEN t."createdBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  ),
  "updatedByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = t."updatedBy"),
    CASE WHEN t."updatedBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  )
WHERE t."createdByName" IS NULL OR t."updatedByName" IS NULL;

UPDATE "Subtask" s
SET
  "createdByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = s."createdBy"),
    CASE WHEN s."createdBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  ),
  "updatedByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = s."updatedBy"),
    CASE WHEN s."updatedBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  )
WHERE s."createdByName" IS NULL OR s."updatedByName" IS NULL;

UPDATE "TaskComment" c
SET
  "createdByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = c."createdBy"),
    CASE WHEN c."createdBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  ),
  "updatedByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = c."updatedBy"),
    CASE WHEN c."updatedBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  )
WHERE c."createdByName" IS NULL OR c."updatedByName" IS NULL;

UPDATE "Issue" i
SET
  "createdByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = i."createdBy"),
    CASE WHEN i."createdBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  ),
  "updatedByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = i."updatedBy"),
    CASE WHEN i."updatedBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  )
WHERE i."createdByName" IS NULL OR i."updatedByName" IS NULL;

UPDATE "IssueComment" ic
SET
  "createdByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = ic."createdBy"),
    CASE WHEN ic."createdBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  ),
  "updatedByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = ic."updatedBy"),
    CASE WHEN ic."updatedBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  )
WHERE ic."createdByName" IS NULL OR ic."updatedByName" IS NULL;

UPDATE "IssueActivity" ia
SET
  "createdByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = ia."createdBy"),
    CASE WHEN ia."createdBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  )
WHERE ia."createdByName" IS NULL;

UPDATE "PurgedProject" pp
SET
  "createdByName" = COALESCE(
    (SELECT u.name FROM "User" u WHERE u.id = pp."createdBy"),
    CASE WHEN pp."createdBy" = '00000000-0000-4000-8000-000000000001' THEN 'System (automated)' ELSE 'Former user' END
  )
WHERE pp."createdByName" IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE "Holiday" ALTER COLUMN "createdByName" SET NOT NULL;
ALTER TABLE "Holiday" ALTER COLUMN "updatedByName" SET NOT NULL;

ALTER TABLE "User" ALTER COLUMN "createdByName" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "updatedByName" SET NOT NULL;

ALTER TABLE "Project" ALTER COLUMN "createdByName" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "updatedByName" SET NOT NULL;

ALTER TABLE "ProjectMember" ALTER COLUMN "createdByName" SET NOT NULL;
ALTER TABLE "ProjectMember" ALTER COLUMN "updatedByName" SET NOT NULL;

ALTER TABLE "Milestone" ALTER COLUMN "createdByName" SET NOT NULL;
ALTER TABLE "Milestone" ALTER COLUMN "updatedByName" SET NOT NULL;

ALTER TABLE "Task" ALTER COLUMN "createdByName" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "updatedByName" SET NOT NULL;

ALTER TABLE "Subtask" ALTER COLUMN "createdByName" SET NOT NULL;
ALTER TABLE "Subtask" ALTER COLUMN "updatedByName" SET NOT NULL;

ALTER TABLE "TaskComment" ALTER COLUMN "createdByName" SET NOT NULL;
ALTER TABLE "TaskComment" ALTER COLUMN "updatedByName" SET NOT NULL;

ALTER TABLE "Issue" ALTER COLUMN "createdByName" SET NOT NULL;
ALTER TABLE "Issue" ALTER COLUMN "updatedByName" SET NOT NULL;

ALTER TABLE "IssueComment" ALTER COLUMN "createdByName" SET NOT NULL;
ALTER TABLE "IssueComment" ALTER COLUMN "updatedByName" SET NOT NULL;

ALTER TABLE "IssueActivity" ALTER COLUMN "createdByName" SET NOT NULL;
ALTER TABLE "PurgedProject" ALTER COLUMN "createdByName" SET NOT NULL;
