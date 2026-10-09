"use client";

import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import StatusFlagBadge from "@/src/components/schedule/StatusFlagBadge";
import {
  type MacroAxis,
  type MacroMilestone,
  type MacroRow,
  type MilestoneState,
} from "@/src/lib/analytics/portfolio";
import { milestoneVarianceLabel } from "@/src/lib/analytics/schedule-series";
import { formatPercent1 } from "@/src/lib/analytics/weighted-progress";
import { calendarDaysLate } from "@/src/lib/analytics/schedule-composition";
import { dayNumber } from "@/src/lib/analytics/portfolio";
import { formatAuDate } from "@/src/lib/gantt/date-utils";

const ROW_HEIGHT = 60;
const BAR_HEIGHT = 8;
/** Top edge of each bar inside the 32px stack. */
const BAR_TOP = { initial: 0, updated: 12, actual: 24 } as const;

export const MACRO_COLOURS = {
  initial: "#a1a1aa",
  updated: "#0ea5e9",
  actualOn: "#10b981",
  actualLate: "#f59e0b",
} as const;

const MILESTONE_COLOUR: Record<MilestoneState, string> = {
  early: "#10b981",
  ontime: "#10b981",
  late: "#f59e0b",
  overdue: "#e11d48",
  upcoming: "#ffffff",
};

const MILESTONE_STATE_LABEL: Record<MilestoneState, string> = {
  early: "Achieved early",
  ontime: "Achieved on target",
  late: "Achieved late",
  overdue: "Past target, not achieved",
  upcoming: "Upcoming",
};

type Tip = {
  x: number;
  y: number;
  below: boolean;
  content: ReactNode;
  /** The bar or diamond the tip belongs to, so it can follow it on scroll. */
  anchor: HTMLElement;
};

function placeTip(anchor: HTMLElement): Pick<Tip, "x" | "y" | "below"> {
  const rect = anchor.getBoundingClientRect();
  const below = rect.top < 150;
  const x = Math.min(
    Math.max(rect.left + rect.width / 2, 150),
    window.innerWidth - 150,
  );
  return { x, y: below ? rect.bottom + 8 : rect.top - 8, below };
}

function spanDays(start: string, end: string): number {
  const a = dayNumber(start);
  const b = dayNumber(end);
  if (a == null || b == null) return 0;
  return b - a + 1;
}

function hatched(colour: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, ${colour} 16%, transparent)`,
    backgroundImage: `repeating-linear-gradient(135deg, ${colour} 0 3px, transparent 3px 7px)`,
    border: `1px solid ${colour}`,
  };
}

function TipBody({
  title,
  lines,
}: {
  title: string;
  lines: Array<[string, string]>;
}) {
  return (
    <>
      <p className="text-xs font-semibold">{title}</p>
      <dl className="mt-1 space-y-0.5">
        {lines.map(([term, value]) => (
          <div key={term} className="flex gap-2 text-[11px] leading-snug">
            <dt className="w-16 shrink-0 opacity-70">{term}</dt>
            <dd className="min-w-0 flex-1">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function milestoneTip(
  milestone: MacroMilestone,
  projectName: string,
  today: string,
): ReactNode {
  const variance =
    milestone.state === "overdue"
      ? `${calendarDaysLate(milestone.target, today)} calendar day${calendarDaysLate(milestone.target, today) === 1 ? "" : "s"} past target`
      : milestone.state === "upcoming"
        ? "Not yet due"
        : milestoneVarianceLabel(milestone.varianceDays);
  const lines: Array<[string, string]> = [
    ["Project", projectName],
    ["Target", formatAuDate(milestone.target)],
    [
      "Achieved",
      milestone.achieved ? formatAuDate(milestone.achieved) : "Not yet",
    ],
    ["Variance", variance],
  ];
  if (milestone.description.trim()) {
    lines.unshift(["About", milestone.description.trim()]);
  }
  return <TipBody title={milestone.name} lines={lines} />;
}

type RowProps = {
  row: MacroRow;
  axis: MacroAxis;
  today: string;
  onTip: (event: { currentTarget: HTMLElement }, content: ReactNode) => void;
  onTipEnd: () => void;
};

function TrackRowBase({ row, axis, today, onTip, onTipEnd }: RowProps) {
  const actualColour =
    row.tone === "on" ? MACRO_COLOURS.actualOn : MACRO_COLOURS.actualLate;

  const bar = (
    kind: "initial" | "updated",
    label: string,
    span: { start: string; end: string } | null,
    colour: string,
  ) => {
    if (!span) return null;
    const left = axis.pct(span.start);
    const width = Math.max(axis.pct(span.end) - left, 0);
    return (
      <div
        className="absolute rounded-full"
        style={{
          left: `${left}%`,
          width: `${width}%`,
          minWidth: 6,
          top: BAR_TOP[kind],
          height: BAR_HEIGHT,
          backgroundColor: colour,
        }}
        onMouseEnter={(event) =>
          onTip(
            event,
            <TipBody
              title={label}
              lines={[
                ["From", formatAuDate(span.start)],
                ["To", formatAuDate(span.end)],
                ["Length", `${spanDays(span.start, span.end)} calendar days`],
              ]}
            />,
          )
        }
        onMouseLeave={onTipEnd}
      />
    );
  };

  const actual = row.actual;
  const actualLeft = actual ? axis.pct(actual.start) : 0;
  const solidRight = actual ? axis.pct(actual.solidEnd) : 0;
  const todayRight = actual?.toToday ? axis.pct(today) : solidRight;

  const summary = [
    row.initial
      ? `Initial ${formatAuDate(row.initial.start)} to ${formatAuDate(row.initial.end)}.`
      : "No initial dates.",
    row.updated
      ? `Updated ${formatAuDate(row.updated.start)} to ${formatAuDate(row.updated.end)}.`
      : "No updated dates.",
    actual
      ? `Actual from ${formatAuDate(actual.start)} to ${formatAuDate(actual.toToday ? today : actual.solidEnd)}${actual.toToday ? ", still running" : ""}.`
      : "Work has not started.",
  ].join(" ");

  return (
    <div
      className="relative border-b border-zinc-100 dark:border-zinc-800/70"
      style={{ height: ROW_HEIGHT }}
    >
      <span className="sr-only">{summary}</span>
      <div
        className="absolute inset-x-0"
        style={{ top: (ROW_HEIGHT - 32) / 2, height: 32 }}
      >
        {bar("initial", "Initial planned span", row.initial, MACRO_COLOURS.initial)}
        {bar("updated", "Updated planned span", row.updated, MACRO_COLOURS.updated)}
        {actual ? (
          <>
            <div
              className="absolute rounded-full"
              style={{
                left: `${actualLeft}%`,
                width: `${Math.max(solidRight - actualLeft, 0)}%`,
                minWidth: 6,
                top: BAR_TOP.actual,
                height: BAR_HEIGHT,
                backgroundColor: actualColour,
              }}
              onMouseEnter={(event) =>
                onTip(
                  event,
                  <TipBody
                    title="Actual realisation span"
                    lines={[
                      ["From", formatAuDate(actual.start)],
                      [
                        "To",
                        actual.toToday
                          ? `${formatAuDate(today)} (today, still running)`
                          : formatAuDate(actual.solidEnd),
                      ],
                      [
                        "Length",
                        `${spanDays(actual.start, actual.toToday ? today : actual.solidEnd)} calendar days`,
                      ],
                    ]}
                  />,
                )
              }
              onMouseLeave={onTipEnd}
            />
            {actual.toToday ? (
              <div
                className="absolute rounded-full"
                style={{
                  left: `${solidRight}%`,
                  width: `${Math.max(todayRight - solidRight, 0)}%`,
                  minWidth: 6,
                  top: BAR_TOP.actual,
                  height: BAR_HEIGHT,
                  ...hatched(actualColour),
                }}
                onMouseEnter={(event) =>
                  onTip(
                    event,
                    <TipBody
                      title="Still running"
                      lines={[
                        ["Since", formatAuDate(actual.solidEnd)],
                        ["To", `${formatAuDate(today)} (today)`],
                      ]}
                    />,
                  )
                }
                onMouseLeave={onTipEnd}
              />
            ) : null}
          </>
        ) : null}
        {row.milestones.map((milestone) => {
          const filled = milestone.state !== "upcoming";
          return (
            <button
              key={milestone.id}
              type="button"
              aria-label={`${milestone.name}. ${MILESTONE_STATE_LABEL[milestone.state]}. Target ${formatAuDate(milestone.target)}.`}
              className="absolute z-10 size-3 rotate-45 rounded-[2px] outline-none ring-2 ring-white focus-visible:ring-teal-500 dark:ring-zinc-900"
              style={{
                left: `${axis.pct(milestone.target)}%`,
                top: BAR_TOP.updated + BAR_HEIGHT / 2,
                marginLeft: -6,
                marginTop: -6,
                backgroundColor: MILESTONE_COLOUR[milestone.state],
                border: filled ? "none" : `2px solid ${MACRO_COLOURS.updated}`,
              }}
              onMouseEnter={(event) =>
                onTip(event, milestoneTip(milestone, row.name, today))
              }
              onFocus={(event) =>
                onTip(event, milestoneTip(milestone, row.name, today))
              }
              onMouseLeave={onTipEnd}
              onBlur={onTipEnd}
            />
          );
        })}
      </div>
    </div>
  );
}

const TrackRow = memo(TrackRowBase);

function LegendSwatch({
  style,
  label,
  diamond,
}: {
  style: CSSProperties;
  label: string;
  diamond?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
      <span
        aria-hidden
        className={
          diamond
            ? "size-2.5 rotate-45 rounded-[2px]"
            : "h-2 w-5 rounded-full"
        }
        style={style}
      />
      {label}
    </span>
  );
}

export function MacroLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Legend">
      <li>
        <LegendSwatch
          style={{ backgroundColor: MACRO_COLOURS.initial }}
          label="Initial plan"
        />
      </li>
      <li>
        <LegendSwatch
          style={{ backgroundColor: MACRO_COLOURS.updated }}
          label="Updated plan"
        />
      </li>
      <li>
        <LegendSwatch
          style={{ backgroundColor: MACRO_COLOURS.actualOn }}
          label="Actual, punctuality 95% or more"
        />
      </li>
      <li>
        <LegendSwatch
          style={{ backgroundColor: MACRO_COLOURS.actualLate }}
          label="Actual, below 95%"
        />
      </li>
      <li>
        <LegendSwatch
          style={hatched(MACRO_COLOURS.actualOn)}
          label="Still running to today"
        />
      </li>
      <li>
        <LegendSwatch
          diamond
          style={{ backgroundColor: MILESTONE_COLOUR.ontime }}
          label="Milestone achieved"
        />
      </li>
      <li>
        <LegendSwatch
          diamond
          style={{ backgroundColor: MILESTONE_COLOUR.late }}
          label="Achieved late"
        />
      </li>
      <li>
        <LegendSwatch
          diamond
          style={{ backgroundColor: MILESTONE_COLOUR.overdue }}
          label="Past target"
        />
      </li>
      <li>
        <LegendSwatch
          diamond
          style={{
            backgroundColor: "#ffffff",
            border: `2px solid ${MACRO_COLOURS.updated}`,
          }}
          label="Upcoming"
        />
      </li>
    </ul>
  );
}

export default function MacroTimeline({
  rows,
  axis,
  today,
  showOwner,
}: {
  rows: MacroRow[];
  axis: MacroAxis;
  today: string;
  showOwner: boolean;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onTip = useCallback(
    (event: { currentTarget: HTMLElement }, content: ReactNode) => {
      const anchor = event.currentTarget;
      setTip({ ...placeTip(anchor), content, anchor });
    },
    [],
  );
  const onTipEnd = useCallback(() => setTip(null), []);

  // Follow the bar when the page or the track scrolls. Focusing a diamond
  // scrolls it into view, so hiding on scroll would also hide the tip for
  // keyboard users.
  const anchor = tip?.anchor ?? null;
  useEffect(() => {
    if (!anchor) return;
    const follow = () => {
      if (!anchor.isConnected) {
        setTip(null);
        return;
      }
      setTip((current) =>
        current && current.anchor === anchor
          ? { ...current, ...placeTip(anchor) }
          : current,
      );
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [anchor]);

  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <div className="flex min-w-[64rem]">
        {/* Names */}
        <div className="sticky left-0 z-20 w-64 shrink-0 border-r border-zinc-100 bg-[var(--sptt-card-bg)] dark:border-zinc-800/70">
          <div className="flex h-9 items-end border-b border-zinc-200 px-5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            Project
          </div>
          {rows.map((row) => (
            <div
              key={row.projectId}
              className="flex flex-col justify-center border-b border-zinc-100 px-5 dark:border-zinc-800/70"
              style={{ height: ROW_HEIGHT }}
            >
              <Link
                href={`/projects/${row.projectId}`}
                className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
                title={row.name}
              >
                {row.name}
              </Link>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                {row.lifecycleStatus === "COMPLETED" ? (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                    Completed
                  </span>
                ) : null}
                <span className="truncate">
                  {[
                    row.customProjectId.trim() || null,
                    showOwner ? row.ownerName : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") ||
                    `${row.taskCount} ${row.taskCount === 1 ? "task" : "tasks"}`}
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* Track */}
        <div className="relative min-w-[32rem] flex-1">
          <div className="relative h-9 border-b border-zinc-200 dark:border-zinc-800">
            {axis.ticks.map((tick) => (
              <span
                key={tick.key}
                className="absolute bottom-1.5 whitespace-nowrap pl-1.5 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400"
                style={{ left: `${tick.pct}%` }}
              >
                {tick.label}
              </span>
            ))}
            {axis.todayPct != null ? (
              <span
                className="absolute top-0.5 z-[6] -translate-x-1/2 rounded bg-rose-500 px-1.5 py-px text-[10px] font-semibold leading-3 text-white"
                style={{ left: `${axis.todayPct}%` }}
              >
                Today
              </span>
            ) : null}
          </div>
          <div className="relative">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {axis.ticks.map((tick) => (
                <span
                  key={tick.key}
                  className="absolute inset-y-0 w-px bg-zinc-200/70 dark:bg-zinc-800"
                  style={{ left: `${tick.pct}%` }}
                />
              ))}
              {axis.todayPct != null ? (
                <span
                  className="absolute inset-y-0 z-[5] w-0.5 bg-rose-500/80"
                  style={{ left: `${axis.todayPct}%` }}
                />
              ) : null}
            </div>
            <div className="relative px-0">
              {rows.map((row) => (
                <TrackRow
                  key={row.projectId}
                  row={row}
                  axis={axis}
                  today={today}
                  onTip={onTip}
                  onTipEnd={onTipEnd}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Figures */}
        <div className="shrink-0 border-l border-zinc-100 dark:border-zinc-800/70">
          <div className="flex h-9 items-end border-b border-zinc-200 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <span className="w-20 px-3 text-right">Target</span>
            <span className="w-20 px-3 text-right">Actual</span>
            <span className="w-52 px-3">Status flag</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.projectId}
              className="flex items-center border-b border-zinc-100 text-sm tabular-nums dark:border-zinc-800/70"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="w-20 px-3 text-right text-zinc-600 dark:text-zinc-300">
                {formatPercent1(row.pTarget)}
              </span>
              <span className="w-20 px-3 text-right font-medium text-zinc-900 dark:text-zinc-50">
                {formatPercent1(row.pActual)}
              </span>
              <span className="w-52 px-3">
                <StatusFlagBadge
                  flag={row.statusFlag}
                  className="whitespace-nowrap"
                />
              </span>
            </div>
          ))}
        </div>
      </div>

      {tip ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[80] w-max max-w-[18rem] rounded-lg bg-zinc-900 px-3 py-2 text-left text-white shadow-xl dark:bg-zinc-100 dark:text-zinc-950"
          style={{
            left: tip.x,
            top: tip.y,
            transform: tip.below ? "translateX(-50%)" : "translate(-50%, -100%)",
          }}
        >
          {tip.content}
        </div>
      ) : null}
    </div>
  );
}
