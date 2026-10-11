import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";

import { Panel } from "@/src/components/analytics/panel";
import type { Insight } from "@/src/lib/analytics/insights";

const TONE: Record<
  Insight["tone"],
  { icon: LucideIcon; badge: string; label: string }
> = {
  good: {
    icon: CheckCircle2,
    badge:
      "bg-emerald-50 text-emerald-600 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-300/25",
    label: "Good",
  },
  watch: {
    icon: AlertTriangle,
    badge:
      "bg-amber-50 text-amber-600 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-300/25",
    label: "Watch",
  },
  urgent: {
    icon: AlertOctagon,
    badge:
      "bg-rose-50 text-rose-600 ring-rose-600/20 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-300/25",
    label: "Urgent",
  },
  neutral: {
    icon: Info,
    badge:
      "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-300/25",
    label: "Note",
  },
};

/**
 * Rule-based takeaways. Each line has a tone icon so a reader can scan for the
 * amber and rose ones first. The text itself is written by `insights.ts`.
 */
export default function Takeaways({
  insights,
  className = "",
}: {
  insights: ReadonlyArray<Insight>;
  className?: string;
}) {
  return (
    <Panel
      title="Key takeaways"
      className={className}
      action={
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {insights.length}
        </span>
      }
    >
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
        {insights.map((insight) => {
          const tone = TONE[insight.tone];
          const Icon = tone.icon;
          return (
            <li key={insight.id} className="flex items-start gap-3.5 px-5 py-3.5">
              <span
                className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ${tone.badge}`}
              >
                <Icon className="size-4" aria-hidden />
                <span className="sr-only">{tone.label}: </span>
              </span>
              <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-100">
                {insight.text}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
