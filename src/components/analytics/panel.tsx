import type { ComponentType, ReactNode } from "react";

import { formatPercent1 } from "@/src/lib/analytics/weighted-progress";

/** Section title with a small accent icon. Used once per Analytics pane. */
export function SectionHeading({
  id,
  icon: Icon,
  title,
  description,
}: {
  id: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-600/15 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-300/20">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0">
        <h2
          id={id}
          className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          {title}
        </h2>
        <p className="mt-0.5 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      </div>
    </div>
  );
}

/** Card with a title row. Children sit below the row. */
export function Panel({
  title,
  action,
  className = "",
  bodyClassName = "",
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`sptt-card flex flex-col overflow-hidden ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800/80">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>
        {action}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** Chart card: title, one-line reading of the latest figure, then the plot. */
export function ChartCard({
  title,
  summary,
  className = "",
  summaryClassName = "sm:min-h-10",
  children,
}: {
  title: string;
  summary: string;
  className?: string;
  summaryClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`sptt-card sptt-chart p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h3>
      <p
        className={`mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 ${summaryClassName}`}
      >
        {summary}
      </p>
      <div className="mt-3 h-[260px] sm:h-[280px]">{children}</div>
    </section>
  );
}

/** Shared table look for the Analytics lists. */
export const TABLE_HEAD =
  "bg-zinc-50/80 text-[11px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400";
export const TABLE_ROW =
  "transition-colors duration-150 hover:bg-zinc-50 dark:hover:bg-zinc-900/60";

/** Labelled progress bar used beside a percentage. */
export function ProgressTrack({
  label,
  value,
  colour,
}: {
  label: string;
  value: number;
  colour: string;
}) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
        <span
          className="block h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${width}%`, backgroundColor: colour }}
        />
      </span>
      <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
        {formatPercent1(value)}
      </span>
    </div>
  );
}
