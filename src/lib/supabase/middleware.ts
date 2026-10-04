import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv, isAuthNetworkError } from "@/src/lib/supabase/env";

const AUTH_ROUTES = new Set(["/login", "/register", "/forgot-password"]);

/** Only these statuses force sign-out. Unknown/RPC failures must not destroy sessions. */
const BLOCKED_APPROVAL_STATUSES = new Set([
  "UNCONFIRMED",
  "PENDING",
  "REJECTED",
  "DEACTIVATED",
]);

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/projects" ||
    pathname.startsWith("/projects/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/portfolio" ||
    pathname.startsWith("/portfolio/") ||
    pathname === "/pending-approval"
  );
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.includes("-auth-token") ||
        (cookie.name.startsWith("sb-") && cookie.value.length > 0),
    );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        supabaseResponse = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });

        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
        }
      },
    },
  });

  // Auth callback / confirm must run without approval gates.
  if (pathname.startsWith("/auth/")) {
    return supabaseResponse;
  }

  let user: { id: string } | null = null;
  let userLookupFailed = false;

  try {
    const {
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      userLookupFailed = isAuthNetworkError(userError);
      console.error(
        "[middleware] getUser failed:",
        userError.message,
        userError.code ?? "",
      );
    }
    user = authUser;
  } catch (error) {
    userLookupFailed = true;
    console.error("[middleware] getUser threw:", error);
  }

  // Transient Auth outages must not look like a sign-out.
  if (!user && userLookupFailed && hasSupabaseAuthCookie(request)) {
    console.warn(
      "[middleware] preserving session through Auth network blip for",
      pathname,
    );
    return supabaseResponse;
  }

  if (!user && isProtectedPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectTo", pathname);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    copyCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  if (user) {
    const { data: approvalStatus, error: statusError } = await supabase.rpc(
      "get_my_approval_status",
    );

    // Fail open on RPC errors — never wipe a legitimate Super PM / approved session.
    if (statusError) {
      console.error(
        "[middleware] get_my_approval_status failed:",
        statusError.message,
      );
      return supabaseResponse;
    }

    const status =
      typeof approvalStatus === "string" ? approvalStatus : null;

    // Force sign-out only for known blocked statuses (not null / unknown).
    if (status && BLOCKED_APPROVAL_STATUSES.has(status)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.search = "";
      redirectUrl.searchParams.set(
        "notice",
        status === "REJECTED"
          ? "rejected"
          : status === "UNCONFIRMED"
            ? "confirm_email"
            : "awaiting_approval",
      );
      const redirectResponse = NextResponse.redirect(redirectUrl);

      const signOutClient = createServerClient(url, anonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              redirectResponse.cookies.set(name, value, options);
            });
          },
        },
      });
      try {
        await signOutClient.auth.signOut();
      } catch (error) {
        console.error("[middleware] signOut during block failed:", error);
      }
      return redirectResponse;
    }

    if (
      status === "APPROVED" &&
      (AUTH_ROUTES.has(pathname) || pathname === "/pending-approval")
    ) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/";
      redirectUrl.search = "";
      const redirectResponse = NextResponse.redirect(redirectUrl);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }
  }

  return supabaseResponse;
}
