"use client";

import { Maximize2, Minimize2 } from "lucide-react";

/**
 * Switches a view between normal and expanded. Expanded hides the project
 * header and milestones so the Gantt or Kanban gets the whole screen.
 */
export default function ExpandViewButton({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = expanded ? Minimize2 : Maximize2;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={expanded}
      title={
        expanded
          ? "Show the project header and milestones again"
          : "Hide the project header and milestones to see more of this view"
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      <Icon className="size-3.5" aria-hidden />
      {expanded ? "Exit expanded view" : "Expand view"}
    </button>
  );
}
