"use client";

import { memo, useMemo, type ReactNode } from "react";
import { Cell, Label, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { plainChartTooltip } from "@/src/components/analytics/ChartTooltip";
import { EffortBars } from "@/src/components/analytics/charts";
import {
  ChartCard,
  Panel,
  TABLE_HEAD,
  TABLE_ROW,
} from "@/src/components/analytics/panel";
import {
  buildScheduleComposition,
  type CompositionTask,
} from "@/src/lib/analytics/schedule-composition";

const LEGEND_STYLE = { paddingTop: 8 } as const;

function DonutCentre({
  viewBox,
  total,
}: {
  viewBox?: unknown;
  total: number;
}) {
  const box = viewBox as { cx?: number; cy?: number } | undefined;
  if (!box || box.cx == null || box.cy == null) return null;
  const cx = Number(box.cx);
  const cy = Number(box.cy);
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="central"
      fill="var(--sptt-chart-axis)"
    >
      <tspan x={cx} dy="-0.35em" fontSize="24" fontWeight="650">
        {total}
      </tspan>
      <tspan x={cx} dy="1.35em" fontSize="11">
        tasks
      </tspan>
    </text>
  );
}

function statusSummary(
  rows: { label: string; count: number }[],
): string {
  if (rows.every((row) => row.count === 0)) {
    return "No tasks on this project.";
  }
  return rows.map((row) => `${row.label} ${row.count}`).join(", ") + ".";
}

function effortSummary(
  rows: { label: string; plannedDays: number }[],
  total: number,
): string {
  if (total === 0) {
    return "No dated tasks to measure planned effort.";
  }
  const parts = rows
    .filter((row) => row.plannedDays > 0)
    .map((row) => `${row.label} ${row.plannedDays}`);
  return `Planned effort is ${total} working day${total === 1 ? "" : "s"}. ${parts.join(", ")}.`;
}

function ScheduleCompositionBase({
  tasks,
  holidayDateKeys,
  today,
  chartsVisible,
  children,
}: {
  children?: ReactNode;
  tasks: CompositionTask[];
  holidayDateKeys: string[];
  today: string;
  chartsVisible: boolean;
}) {
  const composition = useMemo(
    () =>
      buildScheduleComposition({
        tasks,
        holidayKeys: holidayDateKeys,
        today,
      }),
    [tasks, holidayDateKeys, today],
  );
  const pieRows = composition.statusCounts.filter((row) => row.count > 0);
  const taskTotal = composition.statusCounts.reduce(
    (sum, row) => sum + row.count,
    0,
  );
  const overdueCount = composition.overdue.length;
  const showProject = composition.overdue.some((row) => row.projectName);

  return (
    <div className="space-y-4">
      {chartsVisible ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Task status"
            summary={statusSummary(composition.statusCounts)}
          >
            {pieRows.length === 0 ? null : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieRows}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={64}
                    outerRadius={94}
                    paddingAngle={2}
                    cornerRadius={4}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {pieRows.map((row) => (
                      <Cell key={row.status} fill={row.colour} />
                    ))}
                    <Label
                      content={({ viewBox }) => (
                        <DonutCentre viewBox={viewBox} total={taskTotal} />
                      )}
                    />
                  </Pie>
                  <Tooltip content={plainChartTooltip} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={LEGEND_STYLE}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          <ChartCard
            title="Effort by process group"
            summary={`${effortSummary(composition.effortByGroup, composition.plannedDays)} Each bar is planned working days, the same length used to weight the S-curve.`}
          >
            <EffortBars data={composition.effortByGroup} />
          </ChartCard>
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel
        title="Overdue tasks"
        bodyClassName="max-h-[28rem] overflow-auto"
        action={
          overdueCount > 0 ? (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">
              {overdueCount}
            </span>
          ) : null
        }
      >
        {overdueCount === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500 dark:text-zinc-400">
            No tasks are past their due date.
          </p>
        ) : (
          <>
            <p className="px-5 pt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {overdueCount} task{overdueCount === 1 ? " is" : "s are"} past{" "}
              {overdueCount === 1 ? "its" : "their"} due date. Days late are
              calendar days.
            </p>
            <table className="mt-3 min-w-full text-left text-sm">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className="px-5 py-2 font-semibold">Task</th>
                  {showProject ? (
                    <th className="px-5 py-2 font-semibold">Project</th>
                  ) : null}
                  <th className="px-5 py-2 font-semibold">PIC</th>
                  <th className="px-5 py-2 text-right font-semibold">Days late</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {composition.overdue.map((row) => (
                  <tr key={row.id} className={TABLE_ROW}>
                    <td className="px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-50">
                      {row.title}
                    </td>
                    {showProject ? (
                      <td className="px-5 py-2.5 text-zinc-700 dark:text-zinc-200">
                        {row.projectName}
                      </td>
                    ) : null}
                    <td className="px-5 py-2.5 text-zinc-700 dark:text-zinc-200">
                      {row.pic}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-medium text-rose-700 dark:text-rose-300">
                      {row.daysLate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>
        {children}
      </div>
    </div>
  );
}

export default memo(ScheduleCompositionBase);
