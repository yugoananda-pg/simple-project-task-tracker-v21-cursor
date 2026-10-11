"use client";

import { useMemo } from "react";

import { Panel } from "@/src/components/analytics/panel";
import {
  MacroLegend,
  TimelineGrid,
  type TimelineMarker,
} from "@/src/components/portfolio/MacroTimeline";
import {
  buildMacroAxis,
  buildProcessGroupRows,
  type ProcessGroupRow,
} from "@/src/lib/analytics/portfolio";
import { formatScore2 } from "@/src/lib/analytics/weighted-progress";
import { isPlausibleLocalDate } from "@/src/lib/task-defaults";
import type { Milestone, Task } from "@/src/lib/types";

/**
 * The project as five rows, one per process group, each with the same three
 * bars as the portfolio macro timeline. It sits at the top of the Analytics tab
 * so a reader sees the shape of the schedule before any chart.
 */
export default function ProcessGroupTimeline({
  tasks,
  milestones,
  lifecycleStatus,
  holidayDateKeys,
  today,
}: {
  tasks: Task[];
  milestones: Milestone[];
  lifecycleStatus: "ACTIVE" | "COMPLETED";
  holidayDateKeys: string[];
  today: string;
}) {
  const markers = useMemo(() => {
    const lines: TimelineMarker[] = [];
    for (const milestone of milestones) {
      const achieved = Boolean(milestone.actualAchieved);
      const raw = (achieved ? milestone.actualAchieved : milestone.updatedTarget) ?? "";
      const date = raw.slice(0, 10);
      if (!isPlausibleLocalDate(date)) continue;
      lines.push({
        id: milestone.id,
        name: milestone.name,
        date,
        achieved,
      });
    }
    return lines;
  }, [milestones]);
  const rows = useMemo(
    () =>
      buildProcessGroupRows({
        tasks,
        lifecycleStatus,
        holidayKeys: holidayDateKeys,
        today,
      }),
    [tasks, lifecycleStatus, holidayDateKeys, today],
  );
  const axis = useMemo(
    () =>
      buildMacroAxis(
        rows,
        today,
        markers.map((marker) => marker.date),
      ),
    [rows, today, markers],
  );
  const showPending = markers.some((marker) => !marker.achieved);
  const showAchieved = markers.some((marker) => marker.achieved);

  return (
    <Panel title="Schedule by process group">
      <div className="border-b border-zinc-100 px-5 py-3 dark:border-zinc-800/80">
        <p className="mb-2 max-w-4xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          Each group runs from the earliest start to the latest end of its
          tasks. Three bars per group show the initial plan, the current plan
          and the work actually done. Dashed lines are milestones. Hover or
          focus a bar or a line for its dates.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <MacroLegend withMilestones={false} />
          {showPending ? (
            <MilestoneLineKey
              colour="var(--sptt-milestone-pending)"
              label="Milestone (pending)"
            />
          ) : null}
          {showAchieved ? (
            <MilestoneLineKey
              colour="var(--sptt-milestone-achieved)"
              label="Milestone (achieved)"
            />
          ) : null}
        </div>
      </div>
      {axis ? (
        <TimelineGrid<ProcessGroupRow>
          rows={rows}
          axis={axis}
          today={today}
          rowKey={(row) => row.bucket}
          nameHeading="Process group"
          nameWidthClass="w-36 sm:w-56"
          rowHeight={56}
          markers={markers}
          renderName={(row) => (
            <>
              <span className="text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                {row.name}
              </span>
              <span className="mt-0.5 text-[11px] leading-tight sm:truncate text-zinc-500 dark:text-zinc-400">
                {row.taskCount === 0
                  ? "No tasks"
                  : [
                      `${row.taskCount} ${row.taskCount === 1 ? "task" : "tasks"}`,
                      row.ps != null ? `score ${formatScore2(row.ps)}` : null,
                      row.overdueTasks > 0
                        ? `${row.overdueTasks} overdue`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </span>
            </>
          )}
        />
      ) : (
        <p className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No task has dates yet. Add task dates to draw this timeline.
        </p>
      )}
    </Panel>
  );
}

function MilestoneLineKey({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
      <span
        aria-hidden
        className="h-3 border-l border-dashed"
        style={{ borderColor: colour }}
      />
      {label}
    </span>
  );
}
