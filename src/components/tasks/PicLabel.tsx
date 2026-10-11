"use client";

import {
  getTaskPicDisplayName,
  getTaskPicSummary,
  listTaskPics,
  picLabel,
  type TaskPicInfo,
} from "@/src/lib/assignee-display";
import TaskNameTip from "@/src/components/ui/TaskNameTip";

type PicLabelProps = {
  task: TaskPicInfo;
  className?: string;
  showCustomTag?: boolean;
  /** How many names to show before “+N”. Compact cards use 1. */
  visibleNames?: number;
};

/** Instant CSS tooltip — no browser title delay. */
export default function PicLabel({
  task,
  className = "",
  showCustomTag = true,
  visibleNames = 2,
}: PicLabelProps) {
  const pics = listTaskPics(task);
  const full = getTaskPicDisplayName(task);
  const summary = getTaskPicSummary(task, visibleNames);
  const onlyCustom = pics.length === 1 && !pics[0]!.userId;

  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`.trim()}>
      <TaskNameTip name={full} inline className="min-w-0">
        <span className="min-w-0 truncate" aria-label={full}>
          {summary}
        </span>
      </TaskNameTip>
      {showCustomTag && onlyCustom ? (
        <span className="group relative shrink-0">
          <span className="rounded bg-zinc-200 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
            Custom
          </span>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity duration-0 group-hover:opacity-100 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Unregistered PIC
          </span>
        </span>
      ) : null}
    </span>
  );
}

export function PicAvatars({
  task,
  compact = false,
}: {
  task: TaskPicInfo;
  compact?: boolean;
}) {
  const pics = listTaskPics(task);
  if (pics.length === 0) return null;
  const shown = pics.slice(0, 3);
  const extra = pics.length - shown.length;
  const size = compact ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[10px]";

  const full = pics.map(picLabel).join(", ");

  return (
    <TaskNameTip name={full} inline className="shrink-0">
      <span className="inline-flex items-center" aria-hidden>
        {shown.map((pic, index) => {
          const custom = !pic.userId;
          return (
            <span
              key={`${pic.userId ?? pic.name}-${index}`}
              className={[
                "inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-white dark:ring-zinc-950",
                size,
                index > 0 ? "-ml-1.5" : "",
                custom
                  ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                  : "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200",
              ].join(" ")}
            >
              {(picLabel(pic).trim()[0] ?? "?").toUpperCase()}
            </span>
          );
        })}
        {extra > 0 ? (
          <span
            className={[
              "inline-flex items-center justify-center rounded-full bg-zinc-100 font-semibold text-zinc-600 ring-2 ring-white dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-950",
              size,
              "-ml-1.5",
            ].join(" ")}
          >
            +{extra}
          </span>
        ) : null}
      </span>
    </TaskNameTip>
  );
}
