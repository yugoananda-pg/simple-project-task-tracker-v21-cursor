-- One task may have several people. The first row is also kept on
-- Task.assigneeId / Task.assigneeName so existing queries still work.

CREATE TABLE "TaskAssignee" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "userId" UUID,
    "assigneeName" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" UUID NOT NULL,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskAssignee_taskId_sortOrder_idx" ON "TaskAssignee"("taskId", "sortOrder");
CREATE INDEX "TaskAssignee_userId_idx" ON "TaskAssignee"("userId");

ALTER TABLE "TaskAssignee"
    ADD CONSTRAINT "TaskAssignee_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskAssignee"
    ADD CONSTRAINT "TaskAssignee_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskAssignee" ENABLE ROW LEVEL SECURITY;

INSERT INTO "TaskAssignee" (
    "id",
    "taskId",
    "userId",
    "assigneeName",
    "sortOrder",
    "createdBy",
    "updatedBy"
)
SELECT
    gen_random_uuid(),
    t."id",
    t."assigneeId",
    t."assigneeName",
    0,
    t."createdBy",
    t."updatedBy"
FROM "Task" t
WHERE t."assigneeId" IS NOT NULL OR btrim(t."assigneeName") <> '';
