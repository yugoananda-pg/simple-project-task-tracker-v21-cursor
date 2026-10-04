import { Suspense } from "react";

import ConfirmEmailClient from "@/src/components/auth/ConfirmEmailClient";

function ConfirmFallback() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          Loading confirmation…
        </p>
      </div>
    </section>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<ConfirmFallback />}>
      <ConfirmEmailClient />
    </Suspense>
  );
}
