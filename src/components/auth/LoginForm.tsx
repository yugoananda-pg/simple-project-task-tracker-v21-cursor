"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import PasswordInput from "@/src/components/auth/PasswordInput";
import {
  resendSignupConfirmationAction,
  signInAction,
  type AuthActionState,
} from "@/src/lib/actions/auth";
import {
  AWAITING_APPROVAL_MESSAGE,
  CONFIRM_LINK_EXPIRED_MESSAGE,
  CONFIRM_LINK_FAILED_MESSAGE,
  EMAIL_UNCONFIRMED_MESSAGE,
  REJECTED_REGISTRATION_MESSAGE,
} from "@/src/lib/auth-messages";

const NOTICE_COPY: Record<string, string> = {
  awaiting_approval: AWAITING_APPROVAL_MESSAGE,
  rejected: REJECTED_REGISTRATION_MESSAGE,
  confirm_email: EMAIL_UNCONFIRMED_MESSAGE,
  confirm_expired: CONFIRM_LINK_EXPIRED_MESSAGE,
  confirm_failed: CONFIRM_LINK_FAILED_MESSAGE,
};

function StatusBanner({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
      role="status"
    >
      {message}
    </p>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
      role="alert"
    >
      {message}
    </p>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
      role="status"
    >
      {message}
    </p>
  );
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";
  const notice = searchParams.get("notice");
  const urlNotice = notice ? NOTICE_COPY[notice] : null;

  const [state, setState] = useState<AuthActionState>({});
  const [resendState, setResendState] = useState<AuthActionState>({});
  const [isPending, startTransition] = useTransition();
  const [isResendPending, startResendTransition] = useTransition();
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (state.emailHint) setEmail(state.emailHint);
  }, [state.emailHint]);

  useEffect(() => {
    if (resendState.emailHint) setEmail(resendState.emailHint);
  }, [resendState.emailHint]);

  const statusMessage = state.notice ?? urlNotice;

  function handleSignIn(formData: FormData) {
    startTransition(async () => {
      setResendState({});
      try {
        const result = await signInAction({}, formData);
        if (result.redirectTo) {
          // Full reload clears pending transitions + syncs Auth cookies.
          window.location.assign(result.redirectTo);
          return;
        }
        setState(result);
      } catch {
        setState({
          error: "Unable to sign in. Please try again.",
          emailHint: String(formData.get("email") ?? ""),
        });
      }
    });
  }

  function handleResend(formData: FormData) {
    startResendTransition(async () => {
      setState((current) => ({
        emailHint: current.emailHint,
        notice: current.notice,
      }));
      const result = await resendSignupConfirmationAction({}, formData);
      setResendState(result);
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Access your projects after Super PM approval.
          </p>
        </div>

        <div className="mb-5 space-y-3">
          {statusMessage ? <StatusBanner message={statusMessage} /> : null}
          {state.error ? <ErrorBanner message={state.error} /> : null}
          {resendState.success ? (
            <SuccessBanner message={resendState.success} />
          ) : null}
          {resendState.error ? (
            <ErrorBanner message={resendState.error} />
          ) : null}
        </div>

        <form className="space-y-5" action={handleSignIn} noValidate>
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isPending || isResendPending}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-slate-400"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-slate-600 underline-offset-2 hover:underline dark:text-slate-300"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              disabled={isPending || isResendPending}
              placeholder="Your password"
            />
          </div>

          <button
            type="submit"
            disabled={isPending || isResendPending}
            className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {isPending ? "Signing you in…" : "Sign in"}
          </button>
        </form>

        <form action={handleResend} className="mt-4">
          <input type="hidden" name="email" value={email} />
          <button
            type="submit"
            disabled={isPending || isResendPending || !email.trim()}
            className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {isResendPending
              ? "Sending confirmation…"
              : "Resend confirmation email"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
          >
            Create one
          </Link>
        </p>
      </div>
    </section>
  );
}
