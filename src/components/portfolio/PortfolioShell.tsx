"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import type { PortfolioDto } from "@/src/lib/actions/portfolio";

/**
 * The analytics body reads today's date and draws charts, so it renders in the
 * browser only. That keeps the date the viewer's own and avoids a hydration
 * mismatch with the server clock.
 */
const PortfolioView = dynamic(
  () => import("@/src/components/portfolio/PortfolioView"),
  { ssr: false, loading: () => <PortfolioSkeleton /> },
);

export function PortfolioSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/70"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/70" />
      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        Loading portfolio…
      </p>
    </div>
  );
}

function buildHref(next: {
  scope: "pm" | "all";
  pm?: string | null;
  completed: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("scope", next.scope);
  if (next.scope === "pm" && next.pm) params.set("pm", next.pm);
  if (next.completed) params.set("completed", "1");
  return `/portfolio?${params.toString()}`;
}

export default function PortfolioShell({
  dto,
  exportedBy,
}: {
  dto: PortfolioDto;
  exportedBy: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function go(next: Parameters<typeof buildHref>[0]) {
    startTransition(() => router.push(buildHref(next)));
  }

  const tabs = [
    { id: "pm" as const, label: "By PM", enabled: dto.access.pm },
    { id: "all" as const, label: "All projects", enabled: dto.access.all },
  ].filter((tab) => tab.enabled);

  const subtitle =
    dto.scope === "all"
      ? "Every project you may see, side by side."
      : "The projects owned by one Project Manager.";

  return (
    <section className="mx-auto w-full px-4 py-10 sm:px-6 lg:px-8">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Portfolio
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {subtitle}{" "}
          {dto.includeCompleted
            ? "Completed projects are included."
            : "Active projects only."}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {tabs.length > 1 ? (
            <nav
              aria-label="Portfolio view"
              className="inline-flex gap-0.5 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-950/70"
            >
              {tabs.map((tab) => {
                const active = dto.scope === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    disabled={isPending}
                    onClick={() =>
                      active
                        ? undefined
                        : go({
                            scope: tab.id,
                            pm: dto.pm?.id ?? null,
                            completed: dto.includeCompleted,
                          })
                    }
                    className={[
                      "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-[color,background-color,box-shadow] duration-150",
                      active
                        ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-white/10"
                        : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100",
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          ) : null}

          {dto.scope === "pm" ? (
            <select
              id="portfolio-pm"
              aria-label="Project Manager"
              value={dto.pm?.id ?? ""}
              disabled={isPending || dto.pmOptions.length === 0}
              onChange={(event) =>
                go({
                  scope: "pm",
                  pm: event.target.value,
                  completed: dto.includeCompleted,
                })
              }
              className="w-64 max-w-full rounded-lg border border-zinc-300 bg-white py-2 pl-3 text-sm text-zinc-900 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
            >
              {dto.pmOptions.length === 0 ? (
                <option value="">No Project Managers to show</option>
              ) : null}
              {dto.pmOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.projectCount})
                </option>
              ))}
            </select>
          ) : (
            <div
              id="portfolio-project-filter"
              className={isPending ? "pointer-events-none opacity-60" : undefined}
            />
          )}

          {dto.canIncludeCompleted ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={dto.includeCompleted}
                disabled={isPending}
                onChange={(event) =>
                  go({
                    scope: dto.scope,
                    pm: dto.pm?.id ?? null,
                    completed: event.target.checked,
                  })
                }
                className="size-4 rounded border-zinc-300"
              />
              Include Completed projects
            </label>
          ) : null}
        </div>
        <div
          id="portfolio-export"
          className={
            isPending ? "pointer-events-none shrink-0 opacity-60" : "shrink-0"
          }
        />
      </div>
      <div id="portfolio-filter-hint" className="empty:hidden" />

      <div className="relative mt-8 min-h-[12rem]">
        {isPending ? (
          <div
            className="absolute inset-0 z-30 flex items-start justify-center rounded-xl bg-white/55 pt-24 backdrop-blur-[1px] dark:bg-zinc-950/50"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Updating portfolio…
            </div>
          </div>
        ) : null}
        <div className={isPending ? "pointer-events-none opacity-50" : undefined}>
          <PortfolioView
            // A new scope, PM, or cohort starts with a clean project filter.
            key={`${dto.scope}:${dto.pm?.id ?? ""}:${dto.includeCompleted}`}
            dto={dto}
            exportedBy={exportedBy}
          />
        </div>
      </div>
    </section>
  );
}
