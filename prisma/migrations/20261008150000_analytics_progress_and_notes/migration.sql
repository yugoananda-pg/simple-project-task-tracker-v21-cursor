CREATE TYPE "TaskProgressEventSource" AS ENUM ('recorded', 'backfill');

CREATE TABLE "TaskProgressEvent" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "progress" INTEGER NOT NULL,
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "source" "TaskProgressEventSource" NOT NULL DEFAULT 'recorded',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "TaskProgressEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskProgressEvent_projectId_occurredOn_idx" ON "TaskProgressEvent"("projectId", "occurredOn");
CREATE INDEX "TaskProgressEvent_taskId_occurredOn_idx" ON "TaskProgressEvent"("taskId", "occurredOn");

ALTER TABLE "TaskProgressEvent" ADD CONSTRAINT "TaskProgressEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskProgressEvent" ADD CONSTRAINT "TaskProgressEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AnalyticsNote" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "bodyHtml" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" UUID NOT NULL,

    CONSTRAINT "AnalyticsNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalyticsNote_projectId_key" ON "AnalyticsNote"("projectId");
ALTER TABLE "AnalyticsNote" ADD CONSTRAINT "AnalyticsNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Labelled approximation for tasks that changed progress before history existed.
-- Finished work is placed on the actual finish date. Open work with an actual
-- start is placed on that start date. Anything else uses the row's created time.
INSERT INTO "TaskProgressEvent" ("id", "projectId", "taskId", "progress", "occurredOn", "source", "createdBy")
SELECT
    gen_random_uuid(),
    "projectId",
    "id",
    100,
    ("actualCompletionDate"::timestamp + interval '12 hours'),
    'backfill',
    '00000000-0000-4000-8000-000000000001'::uuid
FROM "Task"
WHERE "actualCompletionDate" IS NOT NULL AND "progress" >= 100;

INSERT INTO "TaskProgressEvent" ("id", "projectId", "taskId", "progress", "occurredOn", "source", "createdBy")
SELECT
    gen_random_uuid(),
    t."projectId",
    t."id",
    t."progress",
    (t."actualStartDate"::timestamp + interval '12 hours'),
    'backfill',
    '00000000-0000-4000-8000-000000000001'::uuid
FROM "Task" t
WHERE t."actualStartDate" IS NOT NULL
  AND t."progress" > 0
  AND t."progress" < 100
  AND NOT EXISTS (
    SELECT 1 FROM "TaskProgressEvent" e WHERE e."taskId" = t."id"
  );

INSERT INTO "TaskProgressEvent" ("id", "projectId", "taskId", "progress", "occurredOn", "source", "createdBy")
SELECT
    gen_random_uuid(),
    t."projectId",
    t."id",
    t."progress",
    t."createdAt",
    'backfill',
    '00000000-0000-4000-8000-000000000001'::uuid
FROM "Task" t
WHERE t."progress" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "TaskProgressEvent" e WHERE e."taskId" = t."id"
  );
