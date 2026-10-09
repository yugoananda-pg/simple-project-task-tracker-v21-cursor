import type {
  CompletedProjectAccess,
  DashboardScope,
  GlobalRole,
  ProjectVisibilityMode,
} from "@/src/lib/types";

export const ALL_DASHBOARD_SCOPES: readonly DashboardScope[] = [
  "PROJECT",
  "PM_PORTFOLIO",
  "TOTAL_COMPANY",
];

/**
 * Role defaults from decision D2. A Super PM may still grant or revoke any
 * scope on a PM, Member, or Viewer. Super PM scopes stay locked.
 */
export function privilegeDefaultsForRole(role: GlobalRole): {
  dashboardAccess: DashboardScope[];
  completedProjectAccess: CompletedProjectAccess;
} {
  if (role === "super_pm") {
    return {
      dashboardAccess: [...ALL_DASHBOARD_SCOPES],
      completedProjectAccess: "ALL",
    };
  }
  if (role === "pm") {
    return {
      dashboardAccess: [...ALL_DASHBOARD_SCOPES],
      completedProjectAccess: "NONE",
    };
  }
  return {
    dashboardAccess: ["PROJECT"],
    completedProjectAccess: "NONE",
  };
}

export function sanitizeDashboardScopes(
  scopes: readonly string[],
): DashboardScope[] {
  const allowed = new Set<string>(ALL_DASHBOARD_SCOPES);
  return ALL_DASHBOARD_SCOPES.filter(
    (scope) => scopes.includes(scope) && allowed.has(scope),
  );
}

/** Super PM always holds every scope, whatever is stored. */
export function effectiveDashboardScopes(
  role: GlobalRole,
  stored: readonly string[],
): DashboardScope[] {
  if (role === "super_pm") return [...ALL_DASHBOARD_SCOPES];
  return sanitizeDashboardScopes(stored);
}

export function hasDashboardScope(
  user: { globalRole: GlobalRole; dashboardAccess: readonly string[] },
  scope: DashboardScope,
): boolean {
  return effectiveDashboardScopes(user.globalRole, user.dashboardAccess).includes(
    scope,
  );
}

/**
 * ALL_ACTIVE is a Viewer data-scope. It never grants a dashboard capability
 * and never includes Completed or deleted projects.
 */
export function viewerSeesEveryActiveProject(user: {
  globalRole: GlobalRole;
  projectVisibilityMode: ProjectVisibilityMode;
}): boolean {
  return (
    user.globalRole === "viewer" && user.projectVisibilityMode === "ALL_ACTIVE"
  );
}

export type PortfolioScopeKind = "pm" | "all";

export type PortfolioAccess = { pm: boolean; all: boolean };

/** Which `/portfolio` views a person may open. Each view has its own tick. */
export function portfolioAccessFor(user: {
  globalRole: GlobalRole;
  dashboardAccess: readonly string[];
}): PortfolioAccess {
  return {
    pm: hasDashboardScope(user, "PM_PORTFOLIO"),
    all: hasDashboardScope(user, "TOTAL_COMPANY"),
  };
}

export function canOpenPortfolio(user: {
  globalRole: GlobalRole;
  dashboardAccess: readonly string[];
}): boolean {
  const access = portfolioAccessFor(user);
  return access.pm || access.all;
}

/**
 * Pick the view to show. A requested view the person does not hold falls back
 * to the other one. Null means no portfolio access at all.
 */
export function resolvePortfolioScope(
  access: PortfolioAccess,
  requested: string | null | undefined,
): PortfolioScopeKind | null {
  if (requested === "all" && access.all) return "all";
  if (requested === "pm" && access.pm) return "pm";
  if (access.pm) return "pm";
  if (access.all) return "all";
  return null;
}

/** D3: the All-projects note takes any PM or Super PM who holds Total Company. */
export function canEditAllProjectsNote(user: {
  globalRole: GlobalRole;
  dashboardAccess: readonly string[];
}): boolean {
  return (
    (user.globalRole === "super_pm" || user.globalRole === "pm") &&
    hasDashboardScope(user, "TOTAL_COMPANY")
  );
}

/** D3: a per-PM note takes that PM (holding PM Portfolio) and any Super PM. */
export function canEditPmNote(
  user: {
    id: string;
    globalRole: GlobalRole;
    dashboardAccess: readonly string[];
  },
  pmId: string,
): boolean {
  if (user.globalRole === "super_pm") return true;
  return (
    user.globalRole === "pm" &&
    user.id === pmId &&
    hasDashboardScope(user, "PM_PORTFOLIO")
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Storage key for a portfolio note. Lower-cased so one PM has one row. */
export function portfolioNoteKey(
  scope: PortfolioScopeKind,
  pmId?: string | null,
): string {
  if (scope === "all") return "ALL";
  if (!isUuid(pmId)) throw new Error("A PM id is required for a PM note.");
  return `PM:${pmId.trim().toLowerCase()}`;
}
