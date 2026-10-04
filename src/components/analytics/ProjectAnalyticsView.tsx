"use client";

import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  computeProjectAnalytics,
  type OverdueTaskRow,
} from "@/src/lib/analytics/task-metrics";
import { formatAuDate } from "@/src/lib/gantt/date-utils";
import type { Task } from "@/src/lib/types";
import PicLabel from "@/src/components/tasks/PicLabel";

export type ProjectAnalyticsViewProps = {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  readOnly?: boolean;
  /** When false, Recharts is not mounted (avoids 0×0 measure in hidden tab panels). */
  chartsVisible?: boolean;
};

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "rgb(24 24 27)",
    border: "1px solid rgb(63 63 70)",
    borderRadius: "0.5rem",
    color: "rgb(250 250 250)",
    fontSize: "12px",
  },
  itemStyle: { color: "rgb(250 250 250)" },
  labelStyle: { color: "rgb(161 161 170)" },
};

const CHART_AXIS_COLOUR = "#a1a1aa";
const CHART_GRID_COLOUR = "rgba(113, 113, 122, 0.35)";

type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  accent?: "default" | "success" | "warning" | "danger";
};

function KpiCard({ label, value, hint, accent = "default" }: KpiCardProps) {
  const accentClassName =
    accent === "success"
      ? "border-emerald-300/60 dark:border-emerald-500/40"
      : accent === "warning"
        ? "border-amber-300/60 dark:border-amber-500/40"
        : accent === "danger"
          ? "border-red-300/60 dark:border-red-500/40"
          : "border-zinc-200 dark:border-zinc-700";

  return (
    <div
      className={[
        "rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950 dark:shadow-black/20",
        accentClassName,
      ].join(" ")}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
    </div>
  );
}

function ChartFrame({ children }: { children?: ReactNode }) {
  return (
    <div className="h-[300px] w-full min-w-0 min-h-[300px]">{children}</div>
  );
}

function ChartCard({
  title,
  description,
  children,
  emptyMessage,
  isEmpty,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  emptyMessage: string;
  isEmpty: boolean;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:shadow-black/20">
      <div className="mb-4">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        ) : null}
      </div>
      {isEmpty ? (
        <div className="flex min-h-[14rem] items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {emptyMessage}
          </p>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function OverduePanel({
  rows,
  onTaskClick,
  readOnly = false,
}: {
  rows: OverdueTaskRow[];
  onTaskClick?: (task: Task) => void;
  readOnly?: boolean;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:shadow-black/20">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Overdue tasks alert
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Incomplete tasks past their effective due date.
          </p>
        </div>
        <span
          className={[
            "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
            rows.length > 0
              ? "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200"
              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
          ].join(" ")}
        >
          {rows.length > 0 ? `${rows.length} overdue` : "All clear"}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-emerald-300/70 bg-emerald-50 px-4 py-6 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            No overdue tasks — great work!
          </p>
          <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
            Every open task is on or ahead of its effective due date.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
          {rows.map((row) => {
            const content = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {row.task.title}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <PicLabel task={row.task} className="inline-flex" /> · Due{" "}
                    {formatAuDate(
                      row.task.updatedDueDate ?? row.task.initialDueDate,
                    )}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold tabular-nums text-white dark:bg-red-500">
                  {row.daysOverdue === 1
                    ? "1 day overdue"
                    : `${row.daysOverdue} days overdue`}
                </span>
              </>
            );

            if (onTaskClick) {
              return (
                <li key={row.task.id}>
                  <button
                    type="button"
                    onClick={() => onTaskClick(row.task)}
                    title={
                      readOnly
                        ? `${row.task.title} — view task details (read-only)`
                        : row.task.title
                    }
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900 dark:hover:bg-zinc-900/80 dark:focus-visible:outline-zinc-100"
                  >
                    {content}
                  </button>
                </li>
              );
            }

            return (
              <li
                key={row.task.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                {content}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function ProjectAnalyticsView({
  tasks,
  onTaskClick,
  readOnly = false,
  chartsVisible = true,
}: ProjectAnalyticsViewProps) {
  const analytics = useMemo(() => computeProjectAnalytics(tasks), [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-base font-medium text-zinc-900 dark:text-zinc-50">
            No analytics available yet
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {readOnly
              ? "This project has no task data to analyse yet."
              : "Add tasks to this project to unlock progress dashboards and workload insights."}
          </p>
        </div>
    );
  }

  const pieData = analytics.statusCounts.filter((item) => item.count > 0);
  const hasWorkload = analytics.workloadRows.some((row) => row.total > 0);
  const hasProcessGroups = analytics.processGroupRows.some(
    (row) => row.total > 0,
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total tasks"
          value={String(analytics.totalTasks)}
          hint={
            analytics.totalTasks === 1
              ? "1 task tracked"
              : `${analytics.totalTasks} tasks tracked`
          }
        />
        <KpiCard
          label="Completion"
          value={`${analytics.completionPercent}%`}
          hint={`${analytics.completedCount} of ${analytics.totalTasks} completed`}
          accent="success"
        />
        <KpiCard
          label="Overdue tasks"
          value={String(analytics.overdueCount)}
          hint={
            analytics.overdueCount === 0
              ? "Nothing overdue right now"
              : "Requires attention"
          }
          accent={analytics.overdueCount > 0 ? "danger" : "default"}
        />
        <KpiCard
          label="Active assignees"
          value={String(analytics.activeAssigneeCount)}
          hint="PICs with open assigned tasks"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Status distribution"
          description="Share of tasks by workflow status."
          isEmpty={pieData.length === 0}
          emptyMessage="No status data to chart yet."
        >
          {chartsVisible ? (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.status} fill={entry.colour} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [value ?? 0, name ?? "Tasks"]}
                    {...CHART_TOOLTIP_STYLE}
                  />
                  <Legend
                    verticalAlign="bottom"
                    formatter={(value) => (
                      <span className="text-xs text-zinc-600 dark:text-zinc-300">
                        {value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartFrame>
          ) : (
            <ChartFrame aria-hidden />
          )}
        </ChartCard>

        <ChartCard
          title="Workload per PIC"
          description="Open vs completed tasks grouped by assignee."
          isEmpty={!hasWorkload}
          emptyMessage="No assignee workload to display yet."
        >
          {chartsVisible ? (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={analytics.workloadRows}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid stroke={CHART_GRID_COLOUR} vertical={false} />
                  <XAxis
                    dataKey="assigneeLabel"
                    tick={{ fill: CHART_AXIS_COLOUR, fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: CHART_AXIS_COLOUR, fontSize: 11 }}
                  />
                  <Tooltip
                    {...CHART_TOOLTIP_STYLE}
                    labelFormatter={(label, payload) => {
                      const row = payload?.[0]?.payload as
                        | { isCustomPic?: boolean }
                        | undefined;
                      if (row?.isCustomPic) {
                        return `${label} (Unregistered PIC)`;
                      }
                      return String(label ?? "");
                    }}
                  />
                  <Legend
                    formatter={(value) => (
                      <span className="text-xs text-zinc-600 dark:text-zinc-300">
                        {value}
                      </span>
                    )}
                  />
                  <Bar
                    dataKey="open"
                    name="Open"
                    stackId="workload"
                    fill="#0ea5e9"
                  />
                  <Bar
                    dataKey="completed"
                    name="Completed"
                    stackId="workload"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          ) : (
            <ChartFrame aria-hidden />
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Process group breakdown"
          description="Task volume and completion within each PMBOK process group."
          isEmpty={!hasProcessGroups}
          emptyMessage="No process group data to display yet."
        >
          <div className="space-y-3">
            {analytics.processGroupRows.map((row) => (
              <div
                key={row.bucket}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900/70"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {row.label}
                  </p>
                  <p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {row.completed}/{row.total} completed · {row.completionPercent}%
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all dark:bg-emerald-400"
                    style={{ width: `${row.completionPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <OverduePanel
          rows={analytics.overdueTasks}
          onTaskClick={onTaskClick}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
