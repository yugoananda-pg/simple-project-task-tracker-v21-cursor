-- High-density List order within process groups (independent of Kanban sortOrder).
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "listSortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    id,
    (ROW_NUMBER() OVER (
      PARTITION BY "projectId", bucket
      ORDER BY "createdAt" ASC, id ASC
    ) - 1)::integer AS rn
  FROM "Task"
)
UPDATE "Task" AS t
SET "listSortOrder" = ranked.rn
FROM ranked
WHERE t.id = ranked.id;

CREATE INDEX IF NOT EXISTS "Task_projectId_bucket_listSortOrder_idx"
  ON "Task"("projectId", bucket, "listSortOrder");
