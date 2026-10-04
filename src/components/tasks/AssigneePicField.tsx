"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import type { ProjectMemberUser } from "@/src/lib/actions/projects";
import {
  getTaskPicDisplayName,
  isCustomPic,
} from "@/src/lib/assignee-display";
import type { Task } from "@/src/lib/types";
import PicLabel from "@/src/components/tasks/PicLabel";

type AssigneePicFieldProps = {
  task: Task;
  members: ProjectMemberUser[];
  disabled?: boolean;
  labelClassName: string;
  fieldClassName: string;
  onCommit: (patch: Pick<Task, "assigneeId" | "assigneeName">) => void;
};

function displayNameForTask(task: Task): string {
  const name = getTaskPicDisplayName(task);
  return name === "Unassigned" ? "" : name;
}

function menuPositionFor(input: HTMLInputElement): CSSProperties {
  const rect = input.getBoundingClientRect();
  const gap = 4;
  const preferredMax = 288;
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    preferredMax,
    Math.max(140, openUpward ? spaceAbove : spaceBelow),
  );

  return {
    position: "fixed",
    left: rect.left,
    width: Math.max(rect.width, 220),
    maxHeight,
    zIndex: 100,
    ...(openUpward
      ? { bottom: window.innerHeight - rect.top + gap }
      : { top: rect.bottom + gap }),
  };
}

export default function AssigneePicField({
  task,
  members,
  disabled = false,
  labelClassName,
  fieldClassName,
  onCommit,
}: AssigneePicFieldProps) {
  const [query, setQuery] = useState(() => displayNameForTask(task));
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const blurTimer = useRef<number | null>(null);
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keep the closed-field label in sync when the task assignee changes externally.
  useEffect(() => {
    if (!open) {
      setQuery(displayNameForTask(task));
    }
  }, [task.assigneeId, task.assigneeName, open, task]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(needle) ||
        member.email.toLowerCase().includes(needle),
    );
  }, [members, query]);

  useLayoutEffect(() => {
    if (!open || !inputRef.current) return;

    function placeMenu() {
      const input = inputRef.current;
      if (!input) return;
      setMenuStyle(menuPositionFor(input));
    }

    placeMenu();
    window.addEventListener("resize", placeMenu);
    // Capture scroll from the drawer body so the menu tracks the field.
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open, filtered.length, query]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        listRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setQuery(displayNameForTask(task));
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, task]);

  function clearBlurTimer() {
    if (blurTimer.current != null) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }

  function openPicker() {
    clearBlurTimer();
    skipBlurCommit.current = false;
    // Empty search so the full roster is visible immediately.
    setQuery("");
    if (inputRef.current) {
      setMenuStyle(menuPositionFor(inputRef.current));
    }
    setOpen(true);
  }

  function commitRegistered(member: ProjectMemberUser) {
    skipBlurCommit.current = true;
    clearBlurTimer();
    setQuery(member.name);
    setOpen(false);
    onCommit({ assigneeId: member.id, assigneeName: member.name });
  }

  function commitCustomOrClear(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      setQuery("");
      onCommit({ assigneeId: null, assigneeName: "" });
      return;
    }
    const exact = members.find(
      (member) => member.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exact) {
      commitRegistered(exact);
      return;
    }
    setQuery(trimmed);
    onCommit({ assigneeId: null, assigneeName: trimmed });
  }

  if (disabled) {
    return (
      <div className="w-full min-w-0 max-w-full">
        <p className={labelClassName}>Assignee (PIC)</p>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100">
          <PicLabel task={task} />
        </div>
      </div>
    );
  }

  const listbox =
    open && mounted ? (
      <ul
        ref={listRef}
        id={`assignee-list-${task.id}`}
        role="listbox"
        style={menuStyle}
        className="overflow-y-auto overscroll-contain rounded-lg border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
      >
        <li className="sticky top-0 z-10 border-b border-zinc-100 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          {members.length === 0
            ? "No assignable people on this project"
            : query.trim()
              ? `${filtered.length} match${filtered.length === 1 ? "" : "es"}`
              : `${members.length} team member${members.length === 1 ? "" : "s"}`}
        </li>
        <li>
          <button
            type="button"
            className="flex w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
            onMouseDown={(event) => {
              event.preventDefault();
              skipBlurCommit.current = true;
            }}
            onClick={() => {
              clearBlurTimer();
              setQuery("");
              setOpen(false);
              onCommit({ assigneeId: null, assigneeName: "" });
            }}
          >
            Unassigned
          </button>
        </li>
        {filtered.map((member) => {
          const selected = task.assigneeId === member.id;
          return (
            <li key={member.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={[
                  "flex w-full flex-col px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900",
                  selected ? "bg-slate-50 dark:bg-slate-900/40" : "",
                ].join(" ")}
                onMouseDown={(event) => {
                  event.preventDefault();
                  skipBlurCommit.current = true;
                }}
                onClick={() => commitRegistered(member)}
              >
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {member.name}
                  {selected ? " · current" : ""}
                </span>
                <span className="text-[11px] text-zinc-500">{member.email}</span>
              </button>
            </li>
          );
        })}
        {query.trim() &&
        !members.some(
          (member) =>
            member.name.toLowerCase() === query.trim().toLowerCase(),
        ) ? (
          <li>
            <button
              type="button"
              className="flex w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
              onMouseDown={(event) => {
                event.preventDefault();
                skipBlurCommit.current = true;
              }}
              onClick={() => {
                clearBlurTimer();
                commitCustomOrClear(query);
                setOpen(false);
              }}
            >
              Use custom PIC: “{query.trim()}”
            </button>
          </li>
        ) : null}
        {members.length > 0 && filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-zinc-500">
            No match. Keep typing, or choose a custom PIC above.
          </li>
        ) : null}
      </ul>
    ) : null;

  return (
    <div ref={rootRef} className="relative w-full min-w-0 max-w-full">
      <label htmlFor={`assignee-${task.id}`} className={labelClassName}>
        Assignee (PIC)
      </label>
      <input
        ref={inputRef}
        id={`assignee-${task.id}`}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`assignee-list-${task.id}`}
        aria-autocomplete="list"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open && inputRef.current) {
            setMenuStyle(menuPositionFor(inputRef.current));
          }
          setOpen(true);
        }}
        onFocus={openPicker}
        onClick={openPicker}
        onBlur={() => {
          if (skipBlurCommit.current) {
            skipBlurCommit.current = false;
            return;
          }
          blurTimer.current = window.setTimeout(() => {
            setOpen(false);
            if (!query.trim()) {
              // Leaving an empty search restores the previous assignee label
              // (does not clear assignment unless the user chose Unassigned).
              setQuery(displayNameForTask(task));
              return;
            }
            const exact = members.find(
              (member) =>
                member.name.toLowerCase() === query.trim().toLowerCase(),
            );
            if (exact) {
              commitRegistered(exact);
              return;
            }
            setQuery(displayNameForTask(task));
          }, 150);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            clearBlurTimer();
            if (filtered[0] && query.trim()) {
              const needle = query.trim().toLowerCase();
              const exact = filtered.find(
                (member) => member.name.toLowerCase() === needle,
              );
              if (exact) {
                commitRegistered(exact);
                return;
              }
              if (filtered.length === 1) {
                commitRegistered(filtered[0]!);
                return;
              }
            }
            commitCustomOrClear(query);
            setOpen(false);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            clearBlurTimer();
            setOpen(false);
            setQuery(displayNameForTask(task));
          }
        }}
        className={fieldClassName}
        placeholder={
          open
            ? "Type to filter the team…"
            : "Click to choose assignee…"
        }
        autoComplete="off"
        maxLength={120}
      />

      {listbox ? createPortal(listbox, document.body) : null}

      <p className="mt-1 break-words text-[11px] text-zinc-500 dark:text-zinc-400">
        {isCustomPic(task)
          ? "Custom unregistered PIC — press Enter to save typed names."
          : "Click the field to see the full team. Type to filter the list instantly."}
      </p>
    </div>
  );
}
