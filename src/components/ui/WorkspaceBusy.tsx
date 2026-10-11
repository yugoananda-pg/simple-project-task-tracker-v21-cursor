"use client";

import { Loader2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * Busy flag lives outside ProjectDetailView state on purpose. A pending flag
 * on that view re-renders Kanban, Gantt, List, Issues and Analytics before a
 * spinner can paint, so the page looks frozen. This store re-renders only the
 * overlay.
 */
let depth = 0;
let label = "";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function beginWorkspaceBusy(nextLabel: string) {
  label = nextLabel;
  depth += 1;
  emit();
}

export function endWorkspaceBusy() {
  depth = Math.max(0, depth - 1);
  if (depth === 0) label = "";
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return depth === 0 ? "" : label;
}

function getServerSnapshot() {
  return "";
}

/** Runs after the browser has painted the frame that is already committed. */
export function afterNextPaint(work: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(work);
  });
}

export function WorkspaceBusyOverlay() {
  const activeLabel = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  if (!activeLabel || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-white/55 backdrop-blur-[1px] dark:bg-zinc-950/50"
      aria-busy="true"
      aria-live="polite"
    >
      <div
        role="status"
        className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {activeLabel}
      </div>
    </div>,
    document.body,
  );
}
