"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import AboutDialog from "@/src/components/layout/AboutDialog";
import NotificationBadge from "@/src/components/ui/NotificationBadge";
import { signOutAction } from "@/src/lib/actions/auth";
import { createClient } from "@/src/lib/supabase/client";
import { getRoleLabel } from "@/src/lib/role-labels";
import type { GlobalRole } from "@/src/lib/types";

export type UserDropdownMenuProps = {
  name: string;
  email: string;
  globalRole: GlobalRole;
  pendingApprovalCount?: number;
};

export default function UserDropdownMenu({
  name,
  email,
  globalRole,
  pendingApprovalCount = 0,
}: UserDropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [isSigningOut, startSignOut] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const showApprovalCue =
    globalRole === "super_pm" && pendingApprovalCount > 0;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function handleSignOut() {
    startSignOut(async () => {
      try {
        await signOutAction();
        // Also clear the browser client session, then hard-navigate.
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {
        // Still leave the page even if one sign-out path fails.
      }
      window.location.assign("/login");
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={isSigningOut}
        className="relative inline-flex items-center gap-1.5 rounded-lg border border-slate-500/70 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:border-slate-300 hover:bg-slate-700/60 disabled:opacity-60"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="max-w-[5.5rem] truncate sm:max-w-[10rem]">{name}</span>
        {showApprovalCue ? (
          <NotificationBadge count={pendingApprovalCount} tone="onDark" />
        ) : null}
        <ChevronDown
          className={[
            "size-4 shrink-0 transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-600/80 bg-slate-800 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="border-b border-slate-700/80 px-4 py-3 dark:border-zinc-700">
            <p className="truncate text-sm font-semibold text-slate-50">
              {name}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-400">{email}</p>
            <span className="mt-2 inline-flex items-center rounded-full border border-slate-500/60 bg-slate-700/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-100">
              {getRoleLabel(globalRole)}
            </span>
          </div>

          <div className="px-2 py-2">
            <a
              href="/settings"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-700/60 dark:hover:bg-zinc-800"
              onClick={() => setOpen(false)}
            >
              <span className="flex-1">Settings</span>
              {showApprovalCue ? (
                <NotificationBadge
                  count={pendingApprovalCount}
                  tone="onDark"
                />
              ) : null}
            </a>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-700/60 dark:hover:bg-zinc-800"
              onClick={() => {
                setOpen(false);
                setAboutOpen(true);
              }}
            >
              About
            </button>
          </div>

          <div className="border-t border-slate-700/80 px-2 py-2 dark:border-zinc-700">
            <button
              type="button"
              role="menuitem"
              disabled={isSigningOut}
              onClick={handleSignOut}
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-300 transition hover:bg-red-950/40 hover:text-red-200 disabled:opacity-60"
            >
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      ) : null}
      {aboutOpen ? (
        <AboutDialog
          onClose={() => {
            setAboutOpen(false);
            // The menu item that opened the dialog is gone, so hand focus back.
            triggerRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
