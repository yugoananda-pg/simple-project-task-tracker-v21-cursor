-- Wave 4B: soft-deactivated account retention (mirror project soft-delete 30 days).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "purgeDueAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "purgeWarningSentAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_purgeDueAt_idx" ON "User"("purgeDueAt");

-- Existing deactivated rows: schedule purge 30 days after deactivation.
UPDATE "User"
SET "purgeDueAt" = "deactivatedAt" + INTERVAL '30 days'
WHERE "deactivatedAt" IS NOT NULL
  AND "purgeDueAt" IS NULL;
