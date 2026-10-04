"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { createClient } from "@/src/lib/supabase/client";

const AUTH_BROADCAST_CHANNEL = "sptt-auth-sync";
const REFRESH_DEBOUNCE_MS = 250;

type AuthSessionProviderProps = {
  children: React.ReactNode;
};

/**
 * Syncs RSC trees after real sign-in / sign-out only.
 * Avoids TOKEN_REFRESHED + window-focus refresh storms that re-render pages
 * while switching browser windows and can surface transient UNAUTHORISED errors.
 */
export default function AuthSessionProvider({
  children,
}: AuthSessionProviderProps) {
  const router = useRouter();
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let broadcast: BroadcastChannel | null = null;

    function notifyOtherTabs() {
      try {
        broadcast?.postMessage({ type: "auth-changed", at: Date.now() });
      } catch {
        // BroadcastChannel unavailable — other tabs rely on next navigation.
      }
    }

    function refreshSession() {
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    }

    if (typeof BroadcastChannel !== "undefined") {
      broadcast = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
      broadcast.onmessage = () => {
        refreshSession();
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") {
        return;
      }
      // Hard navigations after auth already reload the tree — skip refresh storms.
      refreshSession();
      notifyOtherTabs();
    });

    return () => {
      subscription.unsubscribe();
      broadcast?.close();
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, [router]);

  return children;
}
