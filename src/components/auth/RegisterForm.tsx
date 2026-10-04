"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import PasswordInput from "@/src/components/auth/PasswordInput";
import {
  resendSignupConfirmationAction,
  signUpAction,
  type AuthActionState,
} from "@/src/lib/actions/auth";

const INITIAL_STATE: AuthActionState = {};

export default function RegisterForm() {
  const [state, formAction, isPending] = useActionState(
    signUpAction,
    INITIAL_STATE,
  );
  const [resendState, resendAction, isResendPending] = useActionState(
    resendSignupConfirmationAction,
    INITIAL_STATE,
  );
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (state.emailHint) setEmail(state.emailHint);
  }, [state.emailHint]);

  useEffect(() => {
    if (resendState.emailHint) setEmail(resendState.emailHint);
  }, [resendState.emailHint]);

  const statusSuccess = resendState.success ?? state.success;
  const statusError = resendState.error ?? state.error;

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Create account
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Confirm your email, then wait for a Super PM to approve you before
            signing in.
          </p>
        </div>

        <form className="space-y-5" action={formAction} noValidate>
          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              disabled={isPending || isResendPending}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-slate-400"
              placeholder="Your name"
            />
          </div>

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
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Password
            </label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              disabled={isPending || isResendPending}
              placeholder="At least 6 characters"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Confirm password
            </label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              disabled={isPending || isResendPending}
              placeholder="Re-enter your password"
            />
          </div>

          {statusSuccess ? (
            <p
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
              role="status"
            >
              {statusSuccess}
            </p>
          ) : null}

          {statusError ? (
            <p
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
              role="alert"
            >
              {statusError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isPending || isResendPending}
            className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {isPending ? "Creating your account…" : "Create account"}
          </button>
        </form>

        <form action={resendAction} className="mt-4">
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
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
          >
            Sign in
          </Link>
        </p>
      </div>
    </section>
  );
}
