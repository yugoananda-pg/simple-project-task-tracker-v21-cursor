/** Sentinel URL/query value for “All projects” portfolio scope (not a user id). */
export const PROJECT_LIST_SCOPE_ALL = "all";

/**
 * sessionStorage key for the last non-default Portfolio scope.
 * Used only by “← Back to projects” so hub → list keeps the filter.
 * Brand / Projects / typed `/` intentionally do **not** restore — they reset to
 * My projects and clear this key.
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

function expireLegacyPortfolioScopeCookie(): void {
  try {
    document.cookie = `${PORTFOLIO_SCOPE_STORAGE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    /* private mode / blocked storage */
  }
}

/** Persist non-default scope for “Back to projects”. Empty clears memory. */
export function persistPortfolioScopeClient(next: string): void {
  try {
    expireLegacyPortfolioScopeCookie();
    if (!next) {
      sessionStorage.removeItem(PORTFOLIO_SCOPE_STORAGE_KEY);
      return;
    }
    if (!isValidPortfolioScope(next)) return;
    sessionStorage.setItem(PORTFOLIO_SCOPE_STORAGE_KEY, next);
  } catch {
    /* private mode / blocked storage */
  }
}

/** Read remembered scope (empty = My projects). */
export function readPortfolioScopeClient(): string {
  try {
    const saved = sessionStorage.getItem(PORTFOLIO_SCOPE_STORAGE_KEY) ?? "";
    return isValidPortfolioScope(saved) ? saved : "";
  } catch {
    return "";
  }
}

/**
 * Href for “← Back to projects”: restores last non-default scope when present.
 * Brand / Projects should keep linking to bare `/` (My projects reset).
 */
export function projectsHomeHrefFromScope(saved: string): string {
  if (!saved || !isValidPortfolioScope(saved)) return "/";
  return `/?owner=${encodeURIComponent(saved)}`;
}
