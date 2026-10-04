"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { confirmEmailAction } from "@/src/lib/actions/auth";
import {
  CONFIRM_LINK_EXPIRED_MESSAGE,
  CONFIRM_LINK_FAILED_MESSAGE,
} from "@/src/lib/auth-messages";

export default function ConfirmEmailClient() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoStartedRef = useRef(false);

  const code = searchParams.get("code")?.trim() ?? "";
  const tokenHash = searchParams.get("token_hash")?.trim() ?? "";
  const type = searchParams.get("type")?.trim() ?? "signup";
  const providerError = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");

  const inboundError = useMemo(() => {
    if (!providerError && !errorCode) return null;
    const desc = (errorDescription ?? "").toLowerCase();
    if (
      errorCode === "otp_expired" ||
      desc.includes("expired") ||
      desc.includes("invalid")
    ) {
      return CONFIRM_LINK_EXPIRED_MESSAGE;
    }
    return CONFIRM_LINK_FAILED_MESSAGE;
  }, [providerError, errorCode, errorDescription]);

  const canConfirm = Boolean(code || tokenHash) && !inboundError;

  function runConfirm() {
    if (!canConfirm) return;
    startTransition(async () => {
      setError(null);
      const formData = new FormData();
      if (code) formData.set("code", code);
      if (tokenHash) formData.set("token_hash", tokenHash);
      formData.set("type", type);
      try {
        const result = await confirmEmailAction({}, formData);
        if (result.redirectTo) {
          window.location.assign(result.redirectTo);
          return;
        }
        if (result.error) setError(result.error);
      } catch {
        setError(CONFIRM_LINK_FAILED_MESSAGE);
      }
    });
  }

  // Real browsers run JS; most mail scanners only GET the URL and never execute
  // this, so auto-confirm keeps one-click UX without reintroducing otp_expired.
  useEffect(() => {
    if (!canConfirm || autoStartedRef.current) return;
    autoStartedRef.current = true;
    runConfirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when token is present
  }, [canConfirm]);

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Confirm your email
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {isPending
              ? "Confirming your email…"
              : "Finishing confirmation. If nothing happens, use the button below."}
          </p>
        </div>

        {inboundError ? (
          <p
            className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
            role="status"
          >
            {inboundError}
          </p>
        ) : null}

        {error ? (
          <p
            className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {canConfirm ? (
          <button
            type="button"
            onClick={runConfirm}
            disabled={isPending}
            className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {isPending ? "Confirming…" : "Confirm email"}
          </button>
        ) : (
          <Link
            href="/login?notice=confirm_email"
            className="flex w-full items-center justify-center rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Go to sign in &amp; resend link
          </Link>
        )}

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          <Link
            href="/login"
            className="font-medium text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </section>
  );
}
