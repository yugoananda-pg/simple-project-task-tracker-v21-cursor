-- Wave 4B-1: Edge middleware must read approval status without opening RLS
-- on "User" to anon/authenticated. SECURITY DEFINER RPC scopes to auth.uid().

CREATE OR REPLACE FUNCTION public.get_my_approval_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "approvalStatus"::text
  FROM "User"
  WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_approval_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_approval_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_approval_status() TO service_role;

COMMENT ON FUNCTION public.get_my_approval_status() IS
  'Returns the signed-in user approvalStatus for middleware gating (FR-GOV-02).';
