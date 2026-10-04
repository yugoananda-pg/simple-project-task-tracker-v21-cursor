import { NextResponse } from "next/server";

/**
 * Compatibility entry for Supabase redirects.
 * Email confirmation is completed on /auth/confirm via an explicit button click
 * so mail scanners cannot consume one-time tokens on a bare GET.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const confirmUrl = new URL("/auth/confirm", url.origin);

  // Preserve every query param (code, token_hash, type, error*, next, …).
  url.searchParams.forEach((value, key) => {
    confirmUrl.searchParams.set(key, value);
  });

  return NextResponse.redirect(confirmUrl);
}
