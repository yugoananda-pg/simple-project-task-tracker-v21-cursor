/**
 * Validated Supabase public environment variables.
 */

function stripEnvValue(value: string | undefined): string {
  if (!value) return "";
  let trimmed = value.trim();
  // Tolerate quoted .env values if the loader left the quotes in place.
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = stripEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = stripEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }

  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.");
  }

  return { url, anonKey };
}

export function getSupabaseServiceRoleKey(): string | null {
  const key = stripEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return key || null;
}

/** True when Auth/network layer failed transiently (not bad credentials). */
export function isAuthNetworkError(error: {
  message?: string;
  name?: string;
  status?: number | string;
  code?: string;
} | null | undefined): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const name = (error.name ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("enotfound") ||
    message.includes("econnrefused") ||
    message.includes("socket") ||
    name.includes("fetcherror") ||
    name.includes("authretryablefetcherror") ||
    code === "unexpected_failure"
  );
}
