"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

const DEFAULT_MIN_DATE = "2000-01-01";
const DEFAULT_MAX_DATE = "2100-12-31";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function parseIso(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });
}

/** Monday-first blanks, then the days of the displayed month. */
function monthCells(year: number, month: number): Array<number | null> {
  const first = new Date(year, month, 1).getDay();
  const leading = (first + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= count; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function setNativeValue(input: HTMLInputElement, next: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * Native date input with a calendar button at the right edge.
 * The button opens an in-page month grid. Previous and next month only
 * move the grid; the field value changes when a day is chosen.
 * Typing in the input still works. The browser picker is not used: its
 * month arrows commit the neighbouring month and close the popup.
 */
const DateField = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  function DateField(
    { className = "", disabled, style, onClick, onMouseDown, lang, ...props },
    forwardedRef,
  ) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const titleId = useId();
    const [open, setOpen] = useState(false);
    const [picked, setPicked] = useState<string>("");
    const [view, setView] = useState(() => {
      const today = new Date();
      return { year: today.getFullYear(), month: today.getMonth() };
    });
    const [coords, setCoords] = useState<CSSProperties | null>(null);
    const [mounted, setMounted] = useState(false);

    function setInput(node: HTMLInputElement | null) {
      inputRef.current = node;
      assignRef(forwardedRef, node);
    }

    function openCalendar() {
      const input = inputRef.current;
      if (!input || input.disabled) return;
      const parsed = parseIso(input.value);
      const today = new Date();
      setPicked(parsed ? input.value : "");
      setView(
        parsed
          ? { year: parsed.year, month: parsed.month }
          : { year: today.getFullYear(), month: today.getMonth() },
      );
      setOpen(true);
      input.focus({ preventScroll: true });
    }

    function chooseDay(iso: string) {
      const input = inputRef.current;
      if (!input || input.disabled) return;
      setPicked(iso);
      setNativeValue(input, iso);
      setOpen(false);
    }

    function shiftMonth(delta: number) {
      setView((current) => {
        const next = new Date(current.year, current.month + delta, 1);
        return { year: next.getFullYear(), month: next.getMonth() };
      });
    }

    useEffect(() => {
      setMounted(true);
    }, []);

    useLayoutEffect(() => {
      if (!open) return;
      function place() {
        const anchor = wrapRef.current;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        const width = 280;
        const estimated = 320;
        const gap = 4;
        const left = Math.min(
          Math.max(8, rect.right - width),
          window.innerWidth - width - 8,
        );
        const below = rect.bottom + gap;
        const openUp = below + estimated > window.innerHeight - 8 && rect.top > estimated;
        setCoords({
          position: "fixed",
          left,
          width,
          zIndex: 80,
          ...(openUp
            ? { bottom: window.innerHeight - rect.top + gap }
            : { top: below }),
        });
      }
      place();
      window.addEventListener("resize", place);
      window.addEventListener("scroll", place, true);
      return () => {
        window.removeEventListener("resize", place);
        window.removeEventListener("scroll", place, true);
      };
    }, [open, view.year, view.month]);

    useEffect(() => {
      if (!open) return;
      function onPointerDown(event: PointerEvent) {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (wrapRef.current?.contains(target)) return;
        if (popoverRef.current?.contains(target)) return;
        setOpen(false);
      }
      function onKeyDown(event: KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      document.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("keydown", onKeyDown, true);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("keydown", onKeyDown, true);
      };
    }, [open]);

    const selected = parseIso(picked);
    const today = new Date();
    const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());
    // Default bounds match the years the server accepts (2000 to 2100).
    const min = typeof props.min === "string" ? props.min : DEFAULT_MIN_DATE;
    const max = typeof props.max === "string" ? props.max : DEFAULT_MAX_DATE;
    const cells = monthCells(view.year, view.month);

    return (
      <div ref={wrapRef} className="relative min-w-0">
        <input
          {...props}
          ref={setInput}
          min={min}
          max={max}
          type="date"
          lang={lang ?? "en-AU"}
          disabled={disabled}
          onMouseDown={(event) => {
            onMouseDown?.(event);
            if (event.defaultPrevented || disabled) return;
            // Keep the native popup closed. Its month arrows write the
            // neighbouring month into the field and dismiss the calendar.
            event.preventDefault();
            openCalendar();
          }}
          onClick={(event) => {
            event.preventDefault();
            onClick?.(event);
          }}
          style={{ paddingRight: "1.75rem", ...style }}
          className={`sptt-date-input ${className}`}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Open calendar"
          aria-expanded={open}
          aria-haspopup="dialog"
          title="Open calendar"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (open) setOpen(false);
            else openCalendar();
          }}
          className="absolute inset-y-0 right-0 z-10 flex w-7 items-center justify-center text-zinc-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <Calendar className="pointer-events-none h-3.5 w-3.5" aria-hidden />
        </button>
        {mounted && open && coords
          ? createPortal(
              <div
                ref={popoverRef}
                role="dialog"
                aria-modal="false"
                aria-labelledby={titleId}
                style={coords}
                onMouseDown={(event) => {
                  // Keep the date input focused so browsing months does not blur-commit.
                  event.preventDefault();
                }}
                className="rounded-xl border border-zinc-200 bg-white p-3 text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() => shiftMonth(-1)}
                    className="inline-flex size-8 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </button>
                  <p id={titleId} className="text-sm font-semibold">
                    {monthTitle(view.year, view.month)}
                  </p>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() => shiftMonth(1)}
                    className="inline-flex size-8 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {WEEKDAYS.map((label) => (
                    <span key={label} className="py-1">
                      {label}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {cells.map((day, index) => {
                    if (day == null) {
                      return <span key={`blank-${index}`} />;
                    }
                    const iso = toIso(view.year, view.month, day);
                    const outOfRange =
                      (min != null && iso < min) || (max != null && iso > max);
                    const isSelected =
                      selected != null &&
                      selected.year === view.year &&
                      selected.month === view.month &&
                      selected.day === day;
                    const isToday = iso === todayIso;
                    return (
                      <button
                        key={iso}
                        type="button"
                        disabled={outOfRange}
                        onClick={() => chooseDay(iso)}
                        className={[
                          "inline-flex h-8 items-center justify-center rounded-md text-xs tabular-nums",
                          outOfRange
                            ? "cursor-not-allowed text-zinc-300 dark:text-zinc-600"
                            : isSelected
                              ? "bg-slate-800 font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                              : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                          isToday && !isSelected
                            ? "ring-1 ring-slate-400 dark:ring-slate-500"
                            : "",
                        ].join(" ")}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  },
);

export default DateField;
