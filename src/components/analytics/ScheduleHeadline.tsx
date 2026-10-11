"use client";

import { Info } from "lucide-react";

import { PALETTE } from "@/src/components/analytics/charts";
import PunctualityScoreTip from "@/src/components/schedule/PunctualityScoreTip";
import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import {
  formatPercent1,
  formatScore2,
  round1,
  STATUS_FLAGS,
  type StatusFlagId,
} from "@/src/lib/analytics/weighted-progress";

export type ScheduleHeadlineProps = {
  /** Punctuality Score on the stored 0 to 100 scale (89.3 displays as 0.89). */
  ps: number;
  pActual: number;
  pTarget: number;
  delta: number;
  statusFlag: StatusFlagId;
  taskCount: number;
  /** Wording for the card hints: "project" on the hub, "portfolio" on /portfolio. */
  subject?: "project" | "portfolio";
};

/** The PS scale shown by the gauge: 0.00 to 1.25. */
const GAUGE_MAX = 125;
const GAUGE_BANDS: ReadonlyArray<{
  from: number;
  to: number;
  className: string;
  label: string;
}> = [
  { from: 0, to: 85, className: "bg-rose-600", label: "PS < 0.85" },
  { from: 85, to: 95, className: "bg-amber-500", label: "0.85 ≤ PS < 0.95" },
  { from: 95, to: 105, className: "bg-emerald-600", label: "0.95 ≤ PS < 1.05" },
  { from: 105, to: GAUGE_MAX, className: "bg-indigo-600", label: "PS ≥ 1.05" },
];

function gaugePct(value: number): number {
  return Math.min(100, Math.max(0, (value / GAUGE_MAX) * 100));
}

/** Signed percentage points, for example "+4.2" or "−7.6" (true minus sign). */
function formatPoints(delta: number): string {
  const rounded = round1(delta);
  if (rounded === 0) return "0.0";
  return `${rounded > 0 ? "+" : "\u2212"}${Math.abs(rounded).toFixed(1)}`;
}

function BigBar({
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
    <div className="grid grid-cols-[4.25rem_5rem_1fr] items-center gap-x-3">
      <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300">
        <span
          aria-hidden
          className="size-2.5 rounded-full"
          style={{ backgroundColor: colour }}
        />
        {label}
      </span>
      <span className="text-right text-xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
        {formatPercent1(value)}
      </span>
      <span className="h-3 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
        <span
          className="block h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${width}%`, backgroundColor: colour }}
        />
      </span>
    </div>
  );
}

const LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400";

/**
 * The three headline cards at the top of the Analytics page and /portfolio:
 * actual against target, the Punctuality Score, and the Status Flag.
 */
export default function ScheduleHeadline({
  ps,
  pActual,
  pTarget,
  delta,
  statusFlag,
  taskCount,
  subject = "project",
}: ScheduleHeadlineProps) {
  const rounded = round1(delta);
  const tone =
    rounded >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";
  const verdict =
    rounded === 0
      ? "exactly on target"
      : rounded > 0
        ? "ahead of target"
        : "behind target";
  const flag = STATUS_FLAGS[statusFlag];
  const scoreText = formatScore2(ps);
  const markerPct = gaugePct(round1(ps));

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="sptt-card sptt-card-lift flex flex-col px-6 py-5 lg:col-span-6">
        <p className={LABEL}>Actual minus target</p>
        <div className="my-auto flex flex-col gap-5 pt-3 sm:flex-row sm:items-center sm:gap-7">
          <div className="shrink-0">
            <p
              className={`text-5xl font-semibold tabular-nums leading-none tracking-tight ${tone}`}
            >
              {formatPoints(delta)}
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="font-medium">points</span>, {verdict}
            </p>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <BigBar label="Actual" value={pActual} colour={PALETTE.actual} />
            <BigBar label="Target" value={pTarget} colour={PALETTE.reference} />
          </div>
        </div>
      </div>

      <PunctualityScoreTip
        scopeNote={
          subject === "portfolio" ? "Across every project in this scope." : undefined
        }
        className="sptt-card sptt-card-lift cursor-help px-6 py-5 outline-none focus-visible:ring-2 focus-visible:ring-teal-500 lg:col-span-3"
      >
        <p className={`${LABEL} flex items-center gap-1.5`}>
          {subject === "portfolio" ? "Portfolio punctuality" : "Project punctuality"}
          <Info className="size-3.5 text-zinc-400" aria-hidden />
        </p>
        <p className="mt-3 text-5xl font-semibold tabular-nums leading-none tracking-tight text-zinc-900 dark:text-zinc-50">
          {scoreText}
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Score. 1.00 is on schedule.
        </p>
        <div className="mt-3" aria-hidden>
          <div className="relative h-2 rounded-full">
            <div className="absolute inset-0 flex overflow-hidden rounded-full">
              {GAUGE_BANDS.map((band) => (
                <span
                  key={band.from}
                  className={band.className}
                  style={{ width: `${gaugePct(band.to) - gaugePct(band.from)}%` }}
                />
              ))}
            </div>
            <span
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-900 shadow dark:border-zinc-950 dark:bg-zinc-50"
              style={{ left: `${markerPct}%` }}
            />
          </div>
          <div className="relative mt-1 h-3 text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
            <span className="absolute left-0">0</span>
            <span
              className="absolute -translate-x-1/2"
              style={{ left: `${gaugePct(100)}%` }}
            >
              1.00
            </span>
            <span className="absolute right-0">1.25</span>
          </div>
        </div>
      </PunctualityScoreTip>

      <div className="sptt-card sptt-card-lift px-6 py-5 lg:col-span-3">
        <p className={LABEL}>Status flag</p>
        <div className="mt-3">
          <StatusFlagBadge
            flag={statusFlag}
            className="rounded-xl px-5 py-2.5 text-lg font-semibold leading-tight tracking-normal"
          />
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-200">
          {flag.meaning}
        </p>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          {taskCount === 1 ? "1 task" : `${taskCount} tasks`}, weighted by
          planned working days
        </p>
      </div>
    </div>
  );
}
