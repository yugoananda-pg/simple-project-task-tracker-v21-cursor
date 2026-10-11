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
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

import {
  backspace,
  isBlank,
  isoFromParts,
  monthCells,
  neighbour,
  partsFromIso,
  stepIso,
  type DateParts,
  type DateSegment,
  typeDigit,
  yearsInRange,
} from "@/src/lib/date-segments";

const DEFAULT_MIN_DATE = "2000-01-01";
const DEFAULT_MAX_DATE = "2100-12-31";
const POPOVER_WIDTH = 296;
/** Header, one fixed grid and padding. The same height in every month and panel. */
const POPOVER_HEIGHT = 292;

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Panel = "days" | "months" | "years";

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
  const parts = partsFromIso(value);
  if (isoFromParts(parts) === null) return null;
  return {
    year: Number(parts.year),
    month: Number(parts.month) - 1,
    day: Number(parts.day),
  };
}

function readValue(input: HTMLInputElement): string {
  const getter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.get;
  return String(getter ? getter.call(input) : input.value);
}

function writeValue(input: HTMLInputElement, next: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function shellClassName(className: string): string {
  return className.replace(/(?<![\w-])focus:/g, "focus-within:");
}

function segmentLabel(segment: DateSegment): string {
  if (segment === "day") return "Day";
  if (segment === "month") return "Month";
  return "Year";
}

/**
 * Date field with a day, month and year the user can click, and a calendar
 * button at the right edge.
 * The calendar is a fixed-height month grid. Its month and year are buttons,
 * so either can be chosen directly. Previous and next only move the grid;
 * the field value changes when a day is chosen, or when the edit is finished.
 * A date is finished when the picker closes, or when day, month and year are
 * no longer active. Until then a complete date stays in the field and is not
 * checked. A half-typed year is not saved.
 */
const DateField = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  function DateField(
    {
      className = "",
      disabled,
      style,
      onClick,
      onMouseDown,
      onFocus,
      onBlur,
      onChange,
      onKeyDown,
      lang,
      value: valueProp,
      defaultValue,
      min: minProp,
      max: maxProp,
      ...props
    },
    forwardedRef,
  ) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const yearListRef = useRef<HTMLDivElement | null>(null);
    const titleId = useId();
    const initial =
      typeof valueProp === "string"
        ? valueProp
        : typeof defaultValue === "string"
          ? defaultValue
          : "";
    const [committedIso, setCommittedIso] = useState(initial);
    const [draft, setDraft] = useState<DateParts | null>(null);
    const [active, setActive] = useState<DateSegment | null>(null);
    const [fresh, setFresh] = useState(true);
    const [open, setOpen] = useState(false);
    const [panel, setPanel] = useState<Panel>("days");
    const [view, setView] = useState(() => {
      const today = new Date();
      return { year: today.getFullYear(), month: today.getMonth() };
    });
    const [coords, setCoords] = useState<CSSProperties | null>(null);
    const [mounted, setMounted] = useState(false);

    const chosenSegment = useRef<DateSegment | null>(null);
    const finishOpenEditRef = useRef<() => void>(() => {});
    const syncExternal = useRef<(next: string) => void>(() => {});
    syncExternal.current = (next: string) => {
      setCommittedIso(next);
      setDraft(null);
    };

    function setInput(node: HTMLInputElement | null) {
      inputRef.current = node;
      assignRef(forwardedRef, node);
      if (!node || node.dataset.spttValueHook === "1") return;
      const desc = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      );
      if (!desc?.get || !desc?.set) return;
      const get = desc.get;
      const set = desc.set;
      Object.defineProperty(node, "value", {
        configurable: true,
        get() {
          return get.call(this);
        },
        set(next: string) {
          const current = String(get.call(this));
          set.call(this, next);
          if (current !== next) syncExternal.current(String(next));
        },
      });
      node.dataset.spttValueHook = "1";
    }

    const externalIso = typeof valueProp === "string" ? valueProp : committedIso;
    const parts = draft ?? partsFromIso(externalIso);
    const min = typeof minProp === "string" ? minProp : DEFAULT_MIN_DATE;
    const max = typeof maxProp === "string" ? maxProp : DEFAULT_MAX_DATE;
    const minYear = Number(min.slice(0, 4));
    const maxYear = Number(max.slice(0, 4));

    useLayoutEffect(() => {
      if (typeof valueProp !== "string") return;
      const input = inputRef.current;
      if (!input || readValue(input) === valueProp) return;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, valueProp);
    }, [valueProp]);

    function writeIso(iso: string) {
      const input = inputRef.current;
      setDraft(null);
      setCommittedIso(iso);
      if (!input || readValue(input) === iso) return;
      writeValue(input, iso);
    }

    const endingEdit = useRef(false);

    function finishEdit() {
      if (!draft) return;
      if (isBlank(draft)) {
        writeIso("");
        return;
      }
      const iso = isoFromParts(draft);
      if (iso) writeIso(iso);
      else setDraft(null);
    }

    function focusLeftField(next: EventTarget | null): boolean {
      if (!(next instanceof Node)) return true;
      if (wrapRef.current?.contains(next)) return false;
      if (popoverRef.current?.contains(next)) return false;
      return true;
    }

    function focusSegment(segment: DateSegment) {
      chosenSegment.current = segment;
      setActive(segment);
      setFresh(true);
      inputRef.current?.focus({ preventScroll: true });
    }

    function openCalendar() {
      const input = inputRef.current;
      if (!input || input.disabled) return;
      const parsed = parseIso(readValue(input));
      const today = new Date();
      const year = parsed?.year ?? today.getFullYear();
      setView(
        parsed
          ? { year: parsed.year, month: parsed.month }
          : { year: today.getFullYear(), month: today.getMonth() },
      );
      setPanel(year < minYear || year > maxYear ? "years" : "days");
      setOpen(true);
      input.focus({ preventScroll: true });
    }

    function finishOpenEdit() {
      const input = inputRef.current;
      setOpen(false);
      if (input && document.activeElement === input) {
        input.blur();
        return;
      }
      finishEdit();
      chosenSegment.current = null;
      setActive(null);
      if (!input) return;
      onBlur?.({
        target: input,
        currentTarget: input,
      } as FocusEvent<HTMLInputElement>);
    }
    finishOpenEditRef.current = finishOpenEdit;

    function chooseDay(iso: string) {
      const input = inputRef.current;
      if (!input || input.disabled) return;
      setDraft(null);
      setCommittedIso(iso);
      writeValue(input, iso);
      setOpen(false);
      chosenSegment.current = null;
      setActive(null);
      // Blur relatedTarget is still the calendar day, so the field's leave
      // handler would skip the parent. Tell it the date is finished here.
      onBlur?.({
        target: input,
        currentTarget: input,
      } as FocusEvent<HTMLInputElement>);
      input.blur();
    }

    function shift(delta: number) {
      if (panel === "years") {
        const list = yearListRef.current;
        if (!list) return;
        list.scrollBy({ top: delta * list.clientHeight });
        return;
      }
      if (panel === "months") {
        setView((current) => ({ ...current, year: current.year + delta }));
        return;
      }
      setView((current) => {
        const next = new Date(current.year, current.month + delta, 1);
        return { year: next.getFullYear(), month: next.getMonth() };
      });
    }

    function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      onKeyDown?.(event);
      if (event.defaultPrevented || disabled) return;
      const segment = active ?? "day";
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        const result = typeDigit(parts, segment, event.key, fresh);
        setDraft(result.parts);
        if (result.advance) {
          chosenSegment.current = result.advance;
          setActive(result.advance);
          setFresh(true);
        } else {
          setFresh(false);
        }
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        const result = backspace(parts, segment, fresh);
        setDraft(result.parts);
        chosenSegment.current = result.segment;
        setActive(result.segment);
        setFresh(false);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const next = neighbour(segment, event.key === "ArrowLeft" ? -1 : 1);
        if (next) focusSegment(next);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const iso = isoFromParts(parts);
        if (!iso) return;
        const stepped = stepIso(iso, segment, event.key === "ArrowUp" ? 1 : -1);
        if (!stepped || stepped < min || stepped > max) return;
        setDraft(partsFromIso(stepped));
        setFresh(true);
        return;
      }
      if (event.key === "/" || event.key === "-" || event.key === ".") {
        event.preventDefault();
        const next = neighbour(segment, 1);
        if (next) focusSegment(next);
      }
    }

    function closeEdit(notifyParent: boolean) {
      if (endingEdit.current) return;
      endingEdit.current = true;
      queueMicrotask(() => {
        endingEdit.current = false;
      });
      finishEdit();
      chosenSegment.current = null;
      setActive(null);
      setOpen(false);
      const input = inputRef.current;
      if (!notifyParent || !input) return;
      onBlur?.({
        target: input,
        currentTarget: input,
      } as FocusEvent<HTMLInputElement>);
    }

    const closeEditRef = useRef(closeEdit);
    closeEditRef.current = closeEdit;

    useEffect(() => {
      const root = wrapRef.current;
      if (!root) return;
      const field: HTMLDivElement = root;
      function leave(notifyParent: boolean) {
        closeEditRef.current(notifyParent);
      }
      function onFocusOut(event: globalThis.FocusEvent) {
        if (!focusLeftField(event.relatedTarget)) return;
        leave(event.target === inputRef.current);
      }
      function onPointerDown(event: PointerEvent) {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (field.contains(target)) return;
        if (popoverRef.current?.contains(target)) return;
        const input = inputRef.current;
        const editing =
          chosenSegment.current != null || document.activeElement === input;
        if (!editing) return;
        if (input && document.activeElement === input) {
          input.blur();
          return;
        }
        leave(true);
      }
      field.addEventListener("focusout", onFocusOut);
      document.addEventListener("pointerdown", onPointerDown, true);
      return () => {
        field.removeEventListener("focusout", onFocusOut);
        document.removeEventListener("pointerdown", onPointerDown, true);
      };
    }, []);

    useEffect(() => {
      setMounted(true);
    }, []);

    useLayoutEffect(() => {
      if (!open) return;
      function place() {
        const anchor = wrapRef.current;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        const gap = 4;
        const left = Math.min(
          Math.max(8, rect.right - POPOVER_WIDTH),
          window.innerWidth - POPOVER_WIDTH - 8,
        );
        const below = rect.bottom + gap;
        const openUp =
          below + POPOVER_HEIGHT > window.innerHeight - 8 &&
          rect.top > POPOVER_HEIGHT;
        setCoords({
          position: "fixed",
          left,
          width: POPOVER_WIDTH,
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
    }, [open]);

    useEffect(() => {
      if (!open || panel !== "years") return;
      const list = yearListRef.current;
      if (!list) return;
      const todayYear = new Date().getFullYear();
      const target =
        view.year >= minYear && view.year <= maxYear ? view.year : todayYear;
      const item = list.querySelector(`[data-year="${target}"]`);
      if (!(item instanceof HTMLElement)) return;
      list.scrollTop =
        item.offsetTop - list.clientHeight / 2 + item.clientHeight / 2;
    }, [open, panel, view.year, minYear, maxYear]);

    useEffect(() => {
      if (!open) return;
      function onPointerDown(event: PointerEvent) {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (wrapRef.current?.contains(target)) return;
        if (popoverRef.current?.contains(target)) return;
        setOpen(false);
      }
      function onKeyDown(event: globalThis.KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        finishOpenEditRef.current();
      }
      document.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("keydown", onKeyDown, true);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("keydown", onKeyDown, true);
      };
    }, [open]);

    const selected = parseIso(
      draft && isoFromParts(draft) ? isoFromParts(draft)! : externalIso,
    );
    const today = new Date();
    const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());
    const cells = monthCells(view.year, view.month);
    const years = yearsInRange(min, max);
    const previousLabel =
      panel === "years"
        ? "Earlier years"
        : panel === "months"
          ? "Previous year"
          : "Previous month";
    const nextLabel =
      panel === "years"
        ? "Later years"
        : panel === "months"
          ? "Next year"
          : "Next month";

    function renderSegment(segment: DateSegment) {
      const raw = parts[segment];
      const placeholder = segment === "year" ? "yyyy" : segment === "month" ? "mm" : "dd";
      const shown = raw || placeholder;
      const isActive = active === segment;
      return (
        <span
          key={segment}
          role="button"
          aria-disabled={disabled || undefined}
          aria-label={segmentLabel(segment)}
          aria-pressed={isActive}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (disabled) return;
            focusSegment(segment);
          }}
          className={[
            "cursor-pointer rounded px-0.5 tabular-nums",
            disabled ? "cursor-not-allowed" : "",
            segment === "year" ? "min-w-[2.5rem]" : "min-w-[1.15rem]",
            isActive
              ? "bg-slate-200 text-zinc-950 dark:bg-slate-600 dark:text-white"
              : "",
            raw
              ? ""
              : "text-zinc-400 dark:text-zinc-500",
          ].join(" ")}
        >
          {shown}
        </span>
      );
    }

    return (
      <div
        ref={wrapRef}
        className="relative min-w-0"
        onBlur={(event) => {
          // Segment buttons can take focus. Leaving any of them, not only the
          // hidden input, must drop a half-typed year.
          if (!focusLeftField(event.relatedTarget)) return;
          closeEdit(event.target !== inputRef.current);
        }}
      >
        <div
          className={`flex items-center gap-0.5 ${shellClassName(className)}`}
          style={{ paddingRight: "1.75rem", ...style }}
          onMouseDown={(event) => {
            onMouseDown?.(event as unknown as MouseEvent<HTMLInputElement>);
            if (event.defaultPrevented || disabled) return;
            if (event.target instanceof Element && event.target.closest("button")) {
              return;
            }
            event.preventDefault();
            focusSegment(active ?? "day");
          }}
        >
          <input
            {...props}
            ref={setInput}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            lang={lang ?? "en-AU"}
            disabled={disabled}
            defaultValue={initial}
            min={min}
            max={max}
            onFocus={(event) => {
              // A click sets the segment before focus. Tabbing in, with nothing
              // chosen, starts on the day.
              setActive(chosenSegment.current ?? "day");
              onFocus?.(event);
            }}
            onBlur={(event) => {
              if (!focusLeftField(event.relatedTarget)) return;
              closeEdit(true);
            }}
            onChange={onChange}
            onKeyDown={onInputKeyDown}
            onClick={onClick}
            className="sr-only"
          />
          {renderSegment("day")}
          <span aria-hidden className="text-zinc-400">
            /
          </span>
          {renderSegment("month")}
          <span aria-hidden className="text-zinc-400">
            /
          </span>
          {renderSegment("year")}
        </div>
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
          onFocus={() => {
            inputRef.current?.focus({ preventScroll: true });
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (open) finishOpenEdit();
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
                  event.preventDefault();
                }}
                className="rounded-xl border border-zinc-200 bg-white p-3 text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <div className="flex h-8 items-center justify-between gap-1">
                  <button
                    type="button"
                    aria-label={previousLabel}
                    onClick={() => shift(-1)}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </button>
                  <div
                    id={titleId}
                    className="flex min-w-0 flex-1 items-center justify-center gap-1"
                  >
                    <button
                      type="button"
                      aria-label="Choose month"
                      aria-pressed={panel === "months"}
                      onClick={() =>
                        setPanel((current) => (current === "months" ? "days" : "months"))
                      }
                      className={[
                        "truncate rounded-md px-2 py-1 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800",
                        panel === "months" ? "bg-zinc-100 dark:bg-zinc-800" : "",
                      ].join(" ")}
                    >
                      {MONTHS[view.month]}
                    </button>
                    <button
                      type="button"
                      aria-label="Choose year"
                      aria-pressed={panel === "years"}
                      onClick={() =>
                        setPanel((current) => (current === "years" ? "days" : "years"))
                      }
                      className={[
                        "rounded-md px-2 py-1 text-sm font-semibold tabular-nums hover:bg-zinc-100 dark:hover:bg-zinc-800",
                        panel === "years" ? "bg-zinc-100 dark:bg-zinc-800" : "",
                      ].join(" ")}
                    >
                      {view.year}
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label={nextLabel}
                    onClick={() => shift(1)}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="mt-2 h-[13.75rem]">
                  {panel === "months" ? (
                    <div className="grid h-full grid-cols-3 grid-rows-4 gap-1">
                      {MONTHS.map((name, index) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            setView((current) => ({ ...current, month: index }));
                            setPanel("days");
                          }}
                          className={[
                            "rounded-md text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
                            index === view.month
                              ? "bg-slate-800 font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                              : "",
                          ].join(" ")}
                        >
                          {name.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  ) : panel === "years" ? (
                    <div ref={yearListRef} className="relative h-full overflow-y-auto">
                      <div className="grid grid-cols-4 gap-1">
                        {years.map((year) => (
                          <button
                            key={year}
                            type="button"
                            data-year={year}
                            onClick={() => {
                              setView((current) => ({ ...current, year }));
                              setPanel("days");
                            }}
                            className={[
                              "rounded-md py-1.5 text-sm tabular-nums hover:bg-zinc-100 dark:hover:bg-zinc-800",
                              year === view.year
                                ? "bg-slate-800 font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                                : "",
                            ].join(" ")}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col">
                      <div className="grid h-7 shrink-0 grid-cols-7 text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        {WEEKDAYS.map((label) => (
                          <span key={label} className="flex items-center justify-center">
                            {label}
                          </span>
                        ))}
                      </div>
                      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
                        {cells.map((day, index) => {
                          if (day == null) {
                            return <span key={`blank-${index}`} />;
                          }
                          const iso = toIso(view.year, view.month, day);
                          const outOfRange = iso < min || iso > max;
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
                                "inline-flex items-center justify-center rounded-md text-xs tabular-nums",
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
                    </div>
                  )}
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
