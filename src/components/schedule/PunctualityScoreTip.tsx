"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const BANDS: ReadonlyArray<{ bar: string; label: string }> = [
  { bar: "bg-indigo-600", label: "PS ≥ 1.05 — Ahead / Completed early" },
  { bar: "bg-emerald-600", label: "0.95 ≤ PS < 1.05 — On track / Completed on time" },
  { bar: "bg-amber-500", label: "0.85 ≤ PS < 0.95 — Slipping / Completed late" },
  { bar: "bg-rose-600", label: "PS < 0.85 — Critically delayed / Completed severely late" },
];

type TipBox = { top: number; left: number; width: number };

/**
 * Opens at once (no hover delay) and stays inside the window, including
 * above a sticky table header. Portalled so overflow on the page cannot clip it.
 */
function useFloatingTip(open: boolean) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<TipBox | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const anchor = anchorRef.current;
      const tip = tipRef.current;
      if (!anchor || !tip) return;
      const rect = anchor.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const width = Math.min(416, window.innerWidth - margin * 2);
      const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
      const spaceAbove = rect.top - gap - margin;
      const placeAbove = spaceBelow < tipRect.height && spaceAbove > spaceBelow;
      let top = placeAbove ? rect.top - gap - tipRect.height : rect.bottom + gap;
      top = Math.max(margin, Math.min(top, window.innerHeight - tipRect.height - margin));
      let left = rect.left;
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      setBox({ top, left, width });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return { anchorRef, tipRef, box };
}

type PunctualityScoreTipProps = {
  children: ReactNode;
  className?: string;
  /** Extra footer line, for example the portfolio scope. */
  scopeNote?: string;
};

/** Shared Punctuality Score explainer. Instant on hover and on keyboard focus. */
export default function PunctualityScoreTip({
  children,
  className = "",
  scopeNote,
}: PunctualityScoreTipProps) {
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const { anchorRef, tipRef, box } = useFloatingTip(open);

  return (
    <div
      ref={anchorRef}
      tabIndex={0}
      aria-describedby={open ? tipId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      className={className}
    >
      {children}
      {open
        ? createPortal(
            <div
              ref={tipRef}
              id={tipId}
              role="tooltip"
              style={{
                position: "fixed",
                top: box?.top ?? 0,
                left: box?.left ?? 0,
                width: box?.width ?? 416,
                visibility: box ? "visible" : "hidden",
              }}
              className="pointer-events-none z-50 rounded-lg border border-zinc-800 bg-zinc-900/95 p-3 text-xs text-zinc-300 shadow-xl backdrop-blur-md"
            >
              <p className="font-semibold text-zinc-50">Punctuality Score (PS)</p>
              <p className="mt-1 leading-snug">
                1.00 is right on schedule. Above 1.00, you&apos;re ahead. Below
                1.00, you&apos;re slipping.
              </p>
              <ul className="mt-2 space-y-1 leading-snug">
                <li>
                  <span className="font-medium text-zinc-100">In progress:</span>{" "}
                  Actual progress against elapsed working days.
                </li>
                <li>
                  <span className="font-medium text-zinc-100">Completed:</span>{" "}
                  Planned duration against the actual finish.
                </li>
              </ul>
              <ul className="mt-2 space-y-1">
                {BANDS.map((band) => (
                  <li key={band.label} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`h-2 w-5 shrink-0 rounded-full ${band.bar}`}
                    />
                    <span className="tabular-nums">{band.label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-zinc-800 pt-2 text-[11px] leading-snug text-zinc-400">
                Note: Calculated on planned working days only (weekends and
                public holidays excluded). Early handovers are never penalised.
                Issue work is left out.
                {scopeNote ? ` ${scopeNote}` : ""}
              </p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
