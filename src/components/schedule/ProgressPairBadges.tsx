"use client";

import { formatPercent1 } from "@/src/lib/analytics/weighted-progress";

type ProgressPairBadgesProps = {
  actual: number;
  target: number;
  /** `inline` (default) side-by-side; `stack` for compact Gantt Progress column. */
  layout?: "inline" | "stack";
  /** `sm` trims the stacked badges so they fit a compact Gantt row. */
  size?: "md" | "sm";
  className?: string;
};

const actualClassName =
  "border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-400";
const targetClassName =
  "border border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-400";

export default function ProgressPairBadges({
  actual,
  target,
  layout = "inline",
  size = "md",
  className = "",
}: ProgressPairBadgesProps) {
  const badgeBase = `inline-flex w-full items-center justify-center rounded-md px-1.5 text-[10px] font-semibold tracking-wide tabular-nums ${
    size === "sm" ? "py-0 leading-4" : "py-0.5"
  }`;

  if (layout === "stack") {
    return (
      <span
        className={[
          `inline-flex w-full flex-col ${size === "sm" ? "gap-0.5" : "gap-1"}`,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span
          className={[badgeBase, actualClassName].join(" ")}
          title="Actual progress"
        >
          Actual {formatPercent1(actual)}
        </span>
        <span
          className={[badgeBase, targetClassName].join(" ")}
          title="Target progress"
        >
          Target {formatPercent1(target)}
        </span>
      </span>
    );
  }

  return (
    <span
      className={["inline-flex flex-wrap items-center gap-1.5", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={[
          "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide tabular-nums",
          actualClassName,
        ].join(" ")}
        title="Actual progress"
      >
        Actual {formatPercent1(actual)}
      </span>
      <span
        className={[
          "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide tabular-nums",
          targetClassName,
        ].join(" ")}
        title="Target progress"
      >
        Target {formatPercent1(target)}
      </span>
    </span>
  );
}
