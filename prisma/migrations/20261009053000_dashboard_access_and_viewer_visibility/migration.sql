-- Wave 4C-2b: Viewer project visibility mode, and dashboard-scope defaults.

CREATE TYPE "ProjectVisibilityMode" AS ENUM ('SELECTED', 'ALL_ACTIVE');

ALTER TABLE "User"
  ADD COLUMN "projectVisibilityMode" "ProjectVisibilityMode" NOT NULL DEFAULT 'SELECTED';

-- New Member and Viewer rows start with per-project analytics only.
-- PM and Super PM scopes are written explicitly on provision and approval.
ALTER TABLE "User"
  ALTER COLUMN "dashboardAccess" SET DEFAULT ARRAY['PROJECT']::"DashboardScope"[];

-- Super PM scopes are locked. Align stored rows with that rule.
UPDATE "User"
SET "dashboardAccess" = ARRAY['PROJECT', 'PM_PORTFOLIO', 'TOTAL_COMPANY']::"DashboardScope"[]
WHERE "globalRole" = 'super_pm';

-- An empty list on a human Viewer was the old default, not a deliberate revoke.
-- The System actor stays without dashboard scopes.
UPDATE "User"
SET "dashboardAccess" = ARRAY['PROJECT']::"DashboardScope"[]
WHERE "globalRole" = 'viewer'
  AND "id" <> '00000000-0000-4000-8000-000000000001'
  AND cardinality("dashboardAccess") = 0;
