-- Wave 4B-2: soft-deactivate for Safe User Deletion (retain actor master row).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivatedBy" UUID;

CREATE INDEX IF NOT EXISTS "User_deactivatedAt_idx" ON "User"("deactivatedAt");

-- Middleware gate: deactivated accounts are never APPROVED for workspace entry.
CREATE OR REPLACE FUNCTION public.get_my_approval_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN u."deactivatedAt" IS NOT NULL THEN 'DEACTIVATED'
    ELSE u."approvalStatus"::text
  END
  FROM "User" u
  WHERE u.id = auth.uid();
$$;
