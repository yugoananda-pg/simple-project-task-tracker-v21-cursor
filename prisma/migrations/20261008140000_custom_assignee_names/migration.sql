CREATE TABLE "CustomAssignee" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" UUID NOT NULL,

    CONSTRAINT "CustomAssignee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomAssignee_nameKey_key" ON "CustomAssignee"("nameKey");

INSERT INTO "CustomAssignee" ("id", "name", "nameKey", "createdBy", "updatedBy")
SELECT
    gen_random_uuid(),
    trimmed,
    lower(trimmed),
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid
FROM (
    SELECT DISTINCT btrim(regexp_replace(name, '\s+', ' ', 'g')) AS trimmed
    FROM (
        SELECT "assigneeName" AS name
        FROM "Task"
        WHERE "assigneeId" IS NULL AND btrim("assigneeName") <> ''
        UNION
        SELECT "picName" AS name
        FROM "Issue"
        WHERE "picId" IS NULL AND btrim("picName") <> ''
    ) sources
) named
WHERE trimmed <> ''
ON CONFLICT ("nameKey") DO NOTHING;
