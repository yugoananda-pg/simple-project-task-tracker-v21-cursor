"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Box = { top: number; left: number; maxWidth: number };

/**
 * The full task title, the moment the pointer is over the name.
 * Portalled so a frozen column or a scroll pane cannot clip it.
 */
export default function TaskNameTip({
  name,
  children,
  className = "",
  hoverOnly = false,
  inline = false,
}: {
  name: string;
  children: ReactNode;
  className?: string;
  /** List title fields: show on hover, and close when the field is focused for editing. */
  hoverOnly?: boolean;
  /** PIC stacks sit in a row; keep the tip wrapper inline. */
  inline?: boolean;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const pointerOver = useRef(false);
  const parentFocused = useRef(false);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const label = name.trim();

  function show(pointer: boolean, focused: boolean) {
    pointerOver.current = pointer;
    parentFocused.current = focused;
    setOpen(pointer || focused);
  }

  useEffect(() => {
    if (hoverOnly) return;
    const parent = anchorRef.current?.closest("button, a");
    if (!parent) return;
    const onFocus = () => show(pointerOver.current, true);
    const onBlur = () => show(pointerOver.current, false);
    parent.addEventListener("focus", onFocus);
    parent.addEventListener("blur", onBlur);
    return () => {
      parent.removeEventListener("focus", onFocus);
      parent.removeEventListener("blur", onBlur);
    };
  }, [hoverOnly]);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const anchor = anchorRef.current;
      const tip = tipRef.current;
      if (!anchor || !tip) return;
      const rect = anchor.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const maxWidth = Math.min(360, window.innerWidth - margin * 2);
      const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
      const placeAbove = spaceBelow < tipRect.height && rect.top > spaceBelow;
      let top = placeAbove
        ? rect.top - gap - tipRect.height
        : rect.bottom + gap;
      top = Math.max(
        margin,
        Math.min(top, window.innerHeight - tipRect.height - margin),
      );
      let left = rect.left;
      left = Math.max(margin, Math.min(left, window.innerWidth - maxWidth - margin));
      setBox({ top, left, maxWidth });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, label]);

  if (!label) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span
      ref={anchorRef}
      className={`${inline ? "inline-flex" : "block"} min-w-0 max-w-full ${className}`.trim()}
      onMouseEnter={() => show(true, parentFocused.current)}
      onMouseLeave={() => show(false, parentFocused.current)}
      onFocus={() => {
        if (hoverOnly) show(false, false);
      }}
    >
      {children}
      {open
        ? createPortal(
            <div
              ref={tipRef}
              role="tooltip"
              style={{
                position: "fixed",
                top: box?.top ?? 0,
                left: box?.left ?? 0,
                maxWidth: box?.maxWidth ?? 360,
                visibility: box ? "visible" : "hidden",
              }}
              className="pointer-events-none z-[80] whitespace-normal break-words rounded-md bg-zinc-900 px-2.5 py-1.5 text-left text-xs font-medium leading-snug text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-950"
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
