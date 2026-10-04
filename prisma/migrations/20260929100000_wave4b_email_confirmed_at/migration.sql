-- Wave 4B: email confirmation gate before Super PM approval queue.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailConfirmedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_emailConfirmedAt_idx" ON "User"("emailConfirmedAt");

-- Existing approved / seeded humans are treated as already confirmed.
UPDATE "User"
SET "emailConfirmedAt" = COALESCE("approvedAt", "createdAt")
WHERE "emailConfirmedAt" IS NULL
  AND "id" <> '00000000-0000-4000-8000-000000000001';
