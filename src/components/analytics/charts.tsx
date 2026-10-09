"use client";

import { memo, useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  dateChartTooltip,
  plainChartTooltip,
} from "@/src/components/analytics/ChartTooltip";
import { formatAuDate } from "@/src/lib/gantt/date-utils";

export const AXIS = "var(--sptt-chart-axis)";
export const GRID = "var(--sptt-chart-grid)";
export const TRACK = "var(--sptt-chart-track)";

/**
 * One palette for every chart. Reference lines (target, ideal) are always the
 * same neutral dashed slate. Progress is emerald. Remaining work is sky for
 * tasks and amber for issues, so the two panes read as different subjects.
 */
export const PALETTE = {
  reference: "#94a3b8",
  actual: "#10b981",
  taskRemaining: "#0ea5e9",
  issueRemaining: "#f59e0b",
  effort: "#6366f1",
  pic: "#8b5cf6",
  category: "#0ea5e9",
  flag: "#14b8a6",
} as const;

export const STATUS_COLOURS: Record<string, string> = {
  open: "#0ea5e9",
  in_progress: "#6366f1",
  blocked: "#f43f5e",
  resolved: "#10b981",
  closed: "#64748b",
};

export const SEVERITY_COLOURS: Record<string, string> = {
  critical: "#e11d48",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#94a3b8",
};

const TICK = { fill: AXIS, fontSize: 11 } as const;
const CURSOR = { stroke: AXIS, strokeOpacity: 0.3 } as const;
const TREND_MARGIN = { top: 8, right: 12, left: 0, bottom: 0 } as const;
const BAR_MARGIN = { top: 4, right: 32, left: 4, bottom: 4 } as const;
const LEGEND_STYLE = { paddingTop: 8 } as const;

function dateTick(value: unknown): string {
  return formatAuDate(String(value));
}

export type TrendSeries = {
  key: string;
  name: string;
  colour: string;
  dashed?: boolean;
  /** Soft gradient under the line. Use for the one headline series. */
  filled?: boolean;
};

function TrendChartBase({
  data,
  series,
  percent = false,
}: {
  data: readonly object[];
  series: readonly TrendSeries[];
  percent?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data as object[]} margin={TREND_MARGIN}>
        <defs>
          {series
            .filter((line) => line.filled)
            .map((line) => (
              <linearGradient
                key={line.key}
                id={`${uid}-${line.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={line.colour} stopOpacity={0.24} />
                <stop offset="100%" stopColor={line.colour} stopOpacity={0.02} />
              </linearGradient>
            ))}
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={dateTick}
          tick={TICK}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
        />
        <YAxis
          domain={percent ? [0, 100] : undefined}
          allowDecimals={false}
          unit={percent ? "%" : undefined}
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={percent ? 42 : 32}
        />
        <Tooltip content={dateChartTooltip} cursor={CURSOR} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={LEGEND_STYLE} />
        {series.map((line) => (
          <Area
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.colour}
            strokeWidth={line.dashed ? 1.5 : 2.25}
            strokeDasharray={line.dashed ? "5 4" : undefined}
            fill={line.filled ? `url(#${uid}-${line.key})` : "none"}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Line and area chart for the S-curve, burn-downs, and issue realisation. */
export const TrendChart = memo(TrendChartBase);

function wrapLabel(value: string, max = 22): string[] {
  if (value.length <= max) return [value];
  const cut = value.lastIndexOf(" ", max);
  const at = cut > 8 ? cut : max;
  const rest = value.slice(at).trim();
  return rest ? [value.slice(0, at).trim(), ...wrapLabel(rest, max)] : [value];
}

function WrappedTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const lines = wrapLabel(payload?.value ?? "");
  const firstDy = 4 - (lines.length - 1) * 6;
  return (
    <text x={x} y={y} textAnchor="end" fill={AXIS} fontSize={11}>
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? firstDy : 12}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

const WRAPPED = <WrappedTick />;
const BAR_BACKGROUND = { fill: TRACK, radius: 6 } as const;
const COUNT_DOMAIN: [number, (max: number) => number] = [
  0,
  (max) => Math.max(1, max),
];

function CountBarsBase({
  data,
  fill,
  colours,
  name,
  labelWidth,
  wrap,
}: {
  data: readonly { key: string; label: string; count: number }[];
  fill?: string;
  /** Per-row colour by row key. Falls back to `fill`. */
  colours?: Record<string, string>;
  name: string;
  labelWidth: number;
  wrap?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data as { key: string; label: string; count: number }[]}
        layout="vertical"
        margin={BAR_MARGIN}
      >
        <XAxis type="number" hide domain={COUNT_DOMAIN} />
        <YAxis
          type="category"
          dataKey="label"
          width={labelWidth}
          tick={wrap ? WRAPPED : TICK}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <Tooltip content={plainChartTooltip} cursor={false} />
        <Bar
          dataKey="count"
          name={name}
          fill={fill}
          radius={[0, 6, 6, 0]}
          barSize={14}
          background={BAR_BACKGROUND}
          isAnimationActive={false}
        >
          {colours
            ? data.map((row) => (
                <Cell key={row.key} fill={colours[row.key] ?? fill} />
              ))
            : null}
          <LabelList
            dataKey="count"
            position="right"
            fill={AXIS}
            fontSize={11}
            fontWeight={600}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal count bars with the figure at the bar end. */
export const CountBars = memo(CountBarsBase);

function EffortBarsBase({
  data,
}: {
  data: readonly { label: string; plannedDays: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data as { label: string; plannedDays: number }[]}
        margin={{ top: 20, right: 8, left: 0, bottom: 0 }}
      >
        <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
        <XAxis
          dataKey="label"
          tick={TICK}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
        />
        <YAxis
          allowDecimals={false}
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip content={plainChartTooltip} cursor={false} />
        <Bar
          dataKey="plannedDays"
          name="Planned working days"
          fill={PALETTE.effort}
          radius={[6, 6, 0, 0]}
          maxBarSize={44}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="plannedDays"
            position="top"
            fill={AXIS}
            fontSize={11}
            fontWeight={600}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export const EffortBars = memo(EffortBarsBase);
