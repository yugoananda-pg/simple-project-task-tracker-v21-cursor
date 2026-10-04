-- Distinguish unconfirmed registrations from confirmed-but-pending for middleware notices.

CREATE OR REPLACE FUNCTION public.get_my_approval_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN u."deactivatedAt" IS NOT NULL THEN 'DEACTIVATED'
    WHEN u."emailConfirmedAt" IS NULL THEN 'UNCONFIRMED'
    ELSE u."approvalStatus"::text
  END
  FROM "User" u
  WHERE u.id = auth.uid();
$$;
