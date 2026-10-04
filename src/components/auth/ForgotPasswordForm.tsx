"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  requestPasswordResetAction,
  type AuthActionState,
} from "@/src/lib/actions/auth";

export default function ForgotPasswordForm() {
  const [state, setState] = useState<AuthActionState>({});
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await requestPasswordResetAction({}, formData);
      setState(result);
      if (result.emailHint) setEmail(result.emailHint);
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Forgot password
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Enter your email and we will send a temporary password if an
            approved account exists. If you cannot access email, ask a Super PM
            to reset your password under Settings.
          </p>
        </div>

        <div className="mb-5 space-y-3">
          {state.error ? (
            <p
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
              role="alert"
            >
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
              role="status"
            >
              {state.success}
            </p>
          ) : null}
        </div>

        <form className="space-y-5" action={handleSubmit} noValidate>
          <div>
            <label
              htmlFor="forgot-email"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Email
            </label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isPending}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-slate-400"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {isPending ? "Sending temporary password…" : "Send temporary password"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Remembered your password?{" "}
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
