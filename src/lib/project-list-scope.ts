/** Sentinel URL/query value for “All projects” portfolio scope (not a user id). */
export const PROJECT_LIST_SCOPE_ALL = "all";

/**
 * Cookie + sessionStorage key for the last Portfolio scope a PM / Super PM chose.
 * Empty / absent means “My projects”. Cookie enables server-side restore on bare `/`
 * (brand link, Projects nav, typed URL); sessionStorage mirrors for client UX.
 */
export const PORTFOLIO_SCOPE_STORAGE_KEY = "sptt.portfolioScope.v1";

const OWNER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when value is `all` or a plausible user UUID (peer PM portfolio). */
export function isValidPortfolioScope(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === PROJECT_LIST_SCOPE_ALL) return true;
  return OWNER_UUID_RE.test(trimmed);
}

/** Persist scope for client navigations (sessionStorage + cookie). */
export function persistPortfolioScopeClient(next: string): void {
  try {
    if (!next) {
      sessionStorage.removeItem(PORTFOLIO_SCOPE_STORAGE_KEY);
      document.cookie = `${PORTFOLIO_SCOPE_STORAGE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
      return;
    }
    if (!isValidPortfolioScope(next)) return;
    sessionStorage.setItem(PORTFOLIO_SCOPE_STORAGE_KEY, next);
    document.cookie = `${PORTFOLIO_SCOPE_STORAGE_KEY}=${encodeURIComponent(next)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    /* private mode / blocked storage */
  }
}

export function readPortfolioScopeFromCookieHeader(
  cookieHeaderValue: string | undefined,
): string {
  if (!cookieHeaderValue) return "";
  try {
    const decoded = decodeURIComponent(cookieHeaderValue).trim();
    return isValidPortfolioScope(decoded) ? decoded : "";
  } catch {
    return "";
  }
}
