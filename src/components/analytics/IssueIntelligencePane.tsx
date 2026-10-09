"use client";

import { memo, useMemo } from "react";
import { ChevronRight, ShieldAlert } from "lucide-react";

import {
  CountBars,
  PALETTE,
  SEVERITY_COLOURS,
  STATUS_COLOURS,
  TrendChart,
  type TrendSeries,
} from "@/src/components/analytics/charts";
import {
  ChartCard,
  Panel,
  SectionHeading,
} from "@/src/components/analytics/panel";
import {
  issuePsLabel,
  type IssueIntelligence,
} from "@/src/lib/analytics/issue-intelligence";
import { formatPercent1 } from "@/src/lib/analytics/weighted-progress";
import { formatAuDate } from "@/src/lib/gantt/date-utils";
import type { IssueActivityType } from "@/src/lib/types";

const REALISATION_SERIES: readonly TrendSeries[] = [
  { key: "target", name: "Target", colour: PALETTE.reference, dashed: true },
  { key: "actual", name: "Actual", colour: PALETTE.actual, filled: true },
];
const BURN_DOWN_SERIES: readonly TrendSeries[] = [
  {
    key: "remaining",
    name: "Remaining",
    colour: PALETTE.issueRemaining,
    filled: true,
  },
  { key: "ideal", name: "Ideal", colour: PALETTE.reference, dashed: true },
];

const EVENT_BADGE: Record<IssueActivityType, { label: string; tone: string }> = {
  RAISED: {
    label: "Raised",
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200",
  },
  STATUS_CHANGED: {
    label: "Status",
    tone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-200",
  },
  PROGRESS_CHANGED: {
    label: "Progress",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200",
  },
  PIC_CHANGED: {
    label: "PIC",
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200",
  },
  DATES_CHANGED: {
    label: "Dates",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
  },
  CLASSIFICATION_CHANGED: {
    label: "Class",
    tone: "bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-200",
  },
  COMMENTED: {
    label: "Comment",
    tone: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700/60 dark:text-zinc-200",
  },
  CLOSED: {
    label: "Closed",
    tone: "bg-slate-200 text-slate-700 dark:bg-slate-500/25 dark:text-slate-200",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200",
  },
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function Kpi({
  label,
  value,
  hint,
  about,
  dot,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  about: string;
  /** Colour dot that ties a count tile to its chart colour. */
  dot?: string;
  tone?: "warn" | "danger";
}) {
  const valueTone =
    tone === "danger"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-900 dark:text-zinc-50";
  return (
    <div
      tabIndex={0}
      className="sptt-card sptt-card-lift group/kpi relative min-w-0 cursor-help px-4 py-3.5 outline-none hover:z-30 focus-within:z-30"
      onMouseEnter={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dataset.side =
          rect.left + 304 > window.innerWidth - 12 ? "end" : "start";
      }}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {dot ? (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: dot }}
          />
        ) : null}
        <span className="truncate">{label}</span>
      </p>
      <p
        className={`mt-1.5 truncate text-2xl font-semibold tabular-nums tracking-tight ${valueTone}`}
      >
        {value}
      </p>
      {hint ? (
        <p
          className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400"
          title={hint}
        >
          {hint}
        </p>
      ) : null}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-72 rounded-lg border border-zinc-300 bg-white p-3 text-left shadow-lg group-hover/kpi:block group-focus-within/kpi:block group-data-[side=end]/kpi:right-0 group-data-[side=end]/kpi:left-auto"
      >
        <p className="text-xs font-semibold text-zinc-950">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-800">{about}</p>
      </div>
    </div>
  );
}

function IssueIntelligencePaneBase({
  intel,
  chartsVisible,
  onOpenIssueLog,
  onOpenIssue,
  subject = "project",
}: {
  intel: IssueIntelligence;
  chartsVisible: boolean;
  /** Leave out on the portfolio, where there is no single Issue Log to open. */
  onOpenIssueLog?: () => void;
  onOpenIssue?: (issueId: string) => void;
  subject?: "project" | "portfolio";
}) {
  const portfolio = subject === "portfolio";
  const latestRealisation = useMemo(() => {
    for (let index = intel.realisation.length - 1; index >= 0; index -= 1) {
      if (intel.realisation[index].actual != null) {
        return intel.realisation[index];
      }
    }
    return undefined;
  }, [intel.realisation]);
  const latestBurn = intel.burnDown.at(-1);
  const countOf = (key: string) =>
    intel.statusCounts.find((row) => row.key === key)?.count ?? 0;

  return (
    <section aria-labelledby="issue-intelligence-heading" className="space-y-5">
      <SectionHeading
        id="issue-intelligence-heading"
        icon={ShieldAlert}
        title="Issue Intelligence"
        description={
          portfolio
            ? "Fix activity for unplanned impediments across every project in this scope. These figures stay out of the portfolio punctuality score and the schedule curve above."
            : "Fix activity for unplanned impediments. These figures stay out of the project punctuality score and the schedule curve above."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Non-cancelled"
          value={String(intel.totalNonCancelled)}
          hint={`${intel.cancelled} cancelled`}
          about={`Issues still on ${portfolio ? "the registers in this scope" : "this project’s register"}. Cancelled issues are the smaller line under the number and are left out of this total. Closure rate and the issue charts use this set.`}
        />
        <Kpi
          label="Critical, still active"
          value={String(intel.criticalActive)}
          tone={intel.criticalActive > 0 ? "danger" : undefined}
          about="Issues marked Critical that are still Open, In progress, or Blocked. A critical issue that is already resolved or closed is not included. A number above zero means a severe impediment is still live."
        />
        <Kpi
          label="Overdue"
          value={String(intel.overdue)}
          tone={intel.overdue > 0 ? "warn" : undefined}
          about="Active issues whose current due date is before today. Active means Open, In progress, or Blocked. Resolved and closed issues are left out, even when they finished late."
        />
        <Kpi
          label="Mean fix progress"
          value={formatPercent1(intel.meanProgress)}
          hint="Active issues only"
          about="The average progress percentage of issues that are still Open, In progress, or Blocked. It describes fix work, and it does not move the project schedule percentage above."
        />
        <Kpi
          label="Mean issue PS"
          value={issuePsLabel(intel.meanIssuePs)}
          about="The average punctuality score of active issues, using issue dates and issue progress. An em dash means there is no active issue. This is not the project punctuality score."
        />
        <Kpi
          label="Closure rate"
          value={formatPercent1(intel.closureRate)}
          about="Resolved and closed issues, divided by non-cancelled issues. 100% means every issue still on the register has been resolved or closed. Cancelled issues are left out of both parts."
        />
        <Kpi
          label="Open"
          dot={STATUS_COLOURS.open}
          value={String(countOf("open"))}
          about="Issues that have been logged and are not being worked yet. This is a count of issues, not a percentage of the schedule."
        />
        <Kpi
          label="In progress"
          dot={STATUS_COLOURS.in_progress}
          value={String(countOf("in_progress"))}
          about="Issues someone is fixing now. Progress can be anywhere from just started to nearly done. These stay in the active set used by the averages above."
        />
        <Kpi
          label="Blocked"
          dot={STATUS_COLOURS.blocked}
          value={String(countOf("blocked"))}
          about="Issues that cannot move until something else is cleared. They remain active, so they still affect mean fix progress and mean issue PS."
        />
        <Kpi
          label="Resolved"
          dot={STATUS_COLOURS.resolved}
          value={String(countOf("resolved"))}
          about="Issues whose fix is done and waiting to be closed. They count toward the closure rate and are left out of the active averages."
        />
        <Kpi
          label="Closed"
          dot={STATUS_COLOURS.closed}
          value={String(countOf("closed"))}
          about="Issues that are finished and closed on the Issue Log. They count toward the closure rate and are left out of the active averages."
        />
        <Kpi
          label="Last activity"
          value={intel.lastActivity ? intel.lastActivity.displayId : "—"}
          hint={
            intel.lastActivity
              ? `${intel.lastActivity.actor} · ${formatWhen(intel.lastActivity.at)}`
              : "No activity yet"
          }
          about="The newest line on the issue activity stream: who did it, when, and which issue. The large text is the issue number. The stream under the charts has the full line."
        />
      </div>

      {intel.empty ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            {portfolio
              ? "No issues have been logged in this scope."
              : "No issues have been logged for this project."}
          </p>
          {onOpenIssueLog ? (
            <button
              type="button"
              onClick={onOpenIssueLog}
              className="mt-4 rounded-lg bg-slate-800 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Open Issue Log
            </button>
          ) : null}
        </div>
      ) : chartsVisible ? (
        <div className="grid gap-4 lg:grid-cols-6">
          <ChartCard
            className="lg:col-span-3"
            title="Issue Fix Realisation"
            summary={
              latestRealisation
                ? `On ${formatAuDate(latestRealisation.date)}, target is ${formatPercent1(latestRealisation.target)} and actual is ${formatPercent1(latestRealisation.actual ?? 0)}.`
                : "No dated issues to plot yet."
            }
          >
            <TrendChart
              data={intel.realisation}
              series={REALISATION_SERIES}
              percent
            />
          </ChartCard>
          <ChartCard
            className="lg:col-span-3"
            title="Issue burn-down"
            summary={
              latestBurn
                ? `Remaining active issues: ${latestBurn.remaining}${latestBurn.ideal == null ? "." : `. Ideal close-out on this date: ${latestBurn.ideal}.`}`
                : "No issue dates to plot yet."
            }
          >
            <TrendChart data={intel.burnDown} series={BURN_DOWN_SERIES} />
          </ChartCard>
          <ChartCard
            className="lg:col-span-2"
            title="Status"
            summary={
              intel.statusCounts
                .filter((row) => row.count > 0)
                .map((row) => `${row.label} ${row.count}`)
                .join(", ") || "No issues."
            }
          >
            <CountBars
              data={intel.statusCounts}
              colours={STATUS_COLOURS}
              fill={PALETTE.reference}
              name="Issues"
              labelWidth={84}
            />
          </ChartCard>
          <ChartCard
            className="lg:col-span-2"
            title="Severity"
            summary={
              intel.severityStack
                .filter((row) => row.count > 0)
                .map((row) => `${row.label} ${row.count}`)
                .join(", ") || "No issues."
            }
          >
            <CountBars
              data={intel.severityStack}
              colours={SEVERITY_COLOURS}
              fill={PALETTE.reference}
              name="Issues"
              labelWidth={72}
            />
          </ChartCard>
          <ChartCard
            className="lg:col-span-2"
            title="PIC load"
            summary={
              intel.picLoad.length === 0
                ? "No active issues."
                : intel.picLoad
                    .map((row) => `${row.label} ${row.count}`)
                    .join(", ")
            }
          >
            <CountBars
              data={intel.picLoad}
              fill={PALETTE.pic}
              name="Active issues"
              labelWidth={108}
              wrap
            />
          </ChartCard>
          <ChartCard
            className="lg:col-span-3"
            title="Category"
            summary={
              intel.categoryStack
                .map((row) => `${row.label} ${row.count}`)
                .join(", ") || "No issues."
            }
          >
            <CountBars
              data={intel.categoryStack}
              fill={PALETTE.category}
              name="Issues"
              labelWidth={120}
            />
          </ChartCard>
          <ChartCard
            className="lg:col-span-3"
            title="Fix schedule flag"
            summary={
              intel.flagHistogram
                .map((row) => `${row.label} ${row.count}`)
                .join(", ") || "No flags."
            }
          >
            <CountBars
              data={intel.flagHistogram}
              fill={PALETTE.flag}
              name="Issues"
              labelWidth={206}
            />
          </ChartCard>
        </div>
      ) : null}

      {intel.stream.length > 0 ? (
        <Panel title="Recent activity" bodyClassName="max-h-[28rem] overflow-y-auto">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {intel.stream.map((row) => {
              const badge = EVENT_BADGE[row.eventType];
              const content = (
                <>
                  <span className="w-32 shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {formatWhen(row.at)}
                  </span>
                  <span
                    className={`inline-flex w-[5.5rem] shrink-0 justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.tone}`}
                  >
                    {badge.label}
                  </span>
                  <span className="w-16 shrink-0 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {row.displayId}
                  </span>
                  {row.projectName ? (
                    <span className="max-w-[12rem] shrink-0 truncate text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      {row.projectName}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 text-sm text-zinc-700 dark:text-zinc-200">
                    {row.summary}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {row.actor}
                  </span>
                  {onOpenIssue ? (
                    <ChevronRight
                      className="size-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-zinc-500 dark:text-zinc-600"
                      aria-hidden
                    />
                  ) : null}
                </>
              );
              return (
                <li key={row.id}>
                  {onOpenIssue ? (
                    <button
                      type="button"
                      onClick={() => onOpenIssue(row.issueId)}
                      className="group/row flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </section>
  );
}

export default memo(IssueIntelligencePaneBase);
