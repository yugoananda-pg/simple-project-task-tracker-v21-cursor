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
import { X } from "lucide-react";

import type { ProjectMemberUser } from "@/src/lib/actions/projects";
import {
  listTaskPics,
  normalisePicName,
  picKey,
  picLabel,
  type TaskPic,
} from "@/src/lib/assignee-display";
import type { Task } from "@/src/lib/types";
import PicLabel from "@/src/components/tasks/PicLabel";

type PicRecord = Pick<Task, "id" | "assigneeId" | "assigneeName" | "assignees">;

type AssigneePicFieldProps = {
  task: PicRecord;
  members: ProjectMemberUser[];
  /** Names used before without a user account. */
  suggestions?: string[];
  disabled?: boolean;
  label?: string;
  hideHint?: boolean;
  /** Issues still have one PIC. Tasks use several chips. */
  single?: boolean;
  labelClassName: string;
  fieldClassName: string;
  onCommit: (
    patch: Pick<Task, "assigneeId" | "assigneeName" | "assignees">,
  ) => void;
};

function menuPositionFor(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect();
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
  suggestions = [],
  disabled = false,
  label = "Assignees (PIC)",
  hideHint = false,
  single = false,
  labelClassName,
  fieldClassName,
  onCommit,
}: AssigneePicFieldProps) {
  const selected = listTaskPics(task);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedKeys = useMemo(
    () => new Set(selected.map(picKey)),
    [selected],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members.filter((member) => {
      if (selectedKeys.has(`user:${member.id}`)) return false;
      if (!needle) return true;
      return (
        member.name.toLowerCase().includes(needle) ||
        member.email.toLowerCase().includes(needle)
      );
    });
  }, [members, query, selectedKeys]);

  const suggestionMatches = useMemo(() => {
    const memberNames = new Set(
      members.map((member) => member.name.trim().toLowerCase()),
    );
    const needle = query.trim().toLowerCase();
    return suggestions
      .map((name) => normalisePicName(name))
      .filter((name) => {
        const key = name.toLowerCase();
        if (!key || memberNames.has(key)) return false;
        if (selectedKeys.has(`custom:${key}`)) return false;
        if (!needle) return true;
        return key.includes(needle);
      })
      .slice(0, 20);
  }, [members, query, selectedKeys, suggestions]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;

    function placeMenu() {
      const anchor = rootRef.current;
      if (!anchor) return;
      setMenuStyle(menuPositionFor(anchor));
    }

    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open, filtered.length, suggestionMatches.length, query, selected.length]);

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
      setQuery("");
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function commit(next: TaskPic[]) {
    const first = next[0];
    onCommit({
      assignees: next,
      assigneeId: first?.userId ?? null,
      assigneeName: first?.name ?? "",
    });
  }

  function addPic(pic: TaskPic) {
    const key = picKey(pic);
    if (selectedKeys.has(key)) return;
    commit(single ? [pic] : [...selected, pic]);
    setQuery("");
    setOpen(!single);
    inputRef.current?.focus();
  }

  function removePic(pic: TaskPic) {
    const key = picKey(pic);
    commit(selected.filter((item) => picKey(item) !== key));
  }

  function addTyped() {
    const trimmed = normalisePicName(query);
    if (!trimmed) return;
    const exact = members.find(
      (member) => member.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exact) {
      addPic({ userId: exact.id, name: exact.name });
      return;
    }
    addPic({ userId: null, name: trimmed });
  }

  if (disabled) {
    return (
      <div className="w-full min-w-0 max-w-full">
        <p className={labelClassName}>{label}</p>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100">
          <PicLabel task={task} visibleNames={4} />
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
              : "Choose people to add"}
        </li>
        {selected.length > 0 ? (
          <li>
            <button
              type="button"
              className="flex w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                commit([]);
                setQuery("");
              }}
            >
              Clear all
            </button>
          </li>
        ) : null}
        {filtered.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              className="flex w-full flex-col px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addPic({ userId: member.id, name: member.name })}
            >
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {member.name}
              </span>
              <span className="text-[11px] text-zinc-500">{member.email}</span>
            </button>
          </li>
        ))}
        {suggestionMatches.length > 0 ? (
          <li className="border-t border-zinc-100 px-3 py-1.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            Previously used
          </li>
        ) : null}
        {suggestionMatches.map((name) => (
          <li key={name.toLowerCase()}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              className="flex w-full px-3 py-2 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:text-zinc-50 dark:hover:bg-zinc-900"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addPic({ userId: null, name })}
            >
              {name}
            </button>
          </li>
        ))}
        {query.trim() &&
        !members.some(
          (member) => member.name.toLowerCase() === query.trim().toLowerCase(),
        ) &&
        !suggestionMatches.some(
          (name) => name.toLowerCase() === query.trim().toLowerCase(),
        ) ? (
          <li>
            <button
              type="button"
              className="flex w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
              onMouseDown={(event) => event.preventDefault()}
              onClick={addTyped}
            >
              Add custom PIC: “{normalisePicName(query)}”
            </button>
          </li>
        ) : null}
        {members.length > 0 && filtered.length === 0 && !query.trim() ? (
          <li className="px-3 py-2 text-sm text-zinc-500">
            Everyone on the roster is already assigned.
          </li>
        ) : null}
      </ul>
    ) : null;

  return (
    <div ref={rootRef} className="relative w-full min-w-0 max-w-full">
      <p className={labelClassName}>{label}</p>
      <div
        className={`${fieldClassName} flex min-h-[2.5rem] flex-wrap items-center gap-1.5 py-1.5`}
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((pic) => (
          <span
            key={picKey(pic)}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-zinc-100 py-0.5 pl-2 pr-1 text-[11px] font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <span className="min-w-0 truncate">{picLabel(pic)}</span>
            <button
              type="button"
              aria-label={`Remove ${picLabel(pic)}`}
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-700 dark:hover:text-zinc-50"
              onClick={(event) => {
                event.stopPropagation();
                removePic(pic);
              }}
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
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
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (filtered[0] && query.trim()) {
                const needle = query.trim().toLowerCase();
                const exact = filtered.find(
                  (member) => member.name.toLowerCase() === needle,
                );
                addPic({
                  userId: (exact ?? filtered[0]!).id,
                  name: (exact ?? filtered[0]!).name,
                });
                return;
              }
              addTyped();
            }
            if (event.key === "Backspace" && !query && selected.length > 0) {
              removePic(selected[selected.length - 1]!);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setQuery("");
            }
          }}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          placeholder={
            single
              ? selected.length === 0
                ? "Choose a PIC…"
                : "Replace PIC…"
              : selected.length === 0
                ? "Add people…"
                : "Add another…"
          }
          autoComplete="off"
          maxLength={120}
        />
      </div>

      {listbox ? createPortal(listbox, document.body) : null}

      {hideHint ? null : (
        <p className="mt-1 break-words text-[11px] text-zinc-500 dark:text-zinc-400">
          {single
            ? "Choose one person, or type a custom PIC and press Enter."
            : "Add as many people as the task needs. Choose a name, or type a custom PIC and press Enter."}
        </p>
      )}
    </div>
  );
}
