"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  Bold,
  Heading2,
  Highlighter,
  Italic,
  Link2,
  List,
  Pencil,
  ListOrdered,
  Strikethrough,
  Underline,
} from "lucide-react";

import { Panel } from "@/src/components/analytics/panel";
import type { ActionResult } from "@/src/lib/actions/errors";
import {
  noteIsEmpty,
  sanitizeNoteHtml,
} from "@/src/lib/analytics/note-html";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

const PROSE =
  "text-sm leading-relaxed text-zinc-800 dark:text-zinc-100 [&_a]:text-slate-700 [&_a]:underline dark:[&_a]:text-slate-200 [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:my-2 [&_ol]:list-decimal [&_p+p]:mt-2 [&_ul]:my-2 [&_ul]:list-disc [&_mark]:bg-amber-100 dark:[&_mark]:bg-amber-900/60";

export type SavedNote = { html: string; updatedAt: string; updatedByName: string };

export type ReportNoteProps = {
  className?: string;
  /** Card heading and the editor's accessible name, for example "Project note". */
  title: string;
  /** Shown when nothing has been written. */
  emptyText: string;
  /** One sentence under the editor heading. */
  editHint: string;
  html: string;
  updatedAt: string | null;
  updatedByName: string | null;
  canEdit: boolean;
  save: (html: string) => Promise<ActionResult<SavedNote>>;
};

export default function ReportNote({
  title,
  emptyText,
  editHint,
  html,
  updatedAt,
  updatedByName,
  canEdit,
  save,
  className = "",
}: ReportNoteProps) {
  const [body, setBody] = useState(html);
  const [stamp, setStamp] = useState(updatedAt);
  const [author, setAuthor] = useState(updatedByName);
  const [open, setOpen] = useState(false);
  const empty = noteIsEmpty(body);

  return (
    <Panel
      title={title}
      className={className}
      action={
        canEdit ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/70"
          >
            <Pencil className="size-3" aria-hidden />
            Edit
          </button>
        ) : null
      }
    >
      <div className="px-5 py-4">
        {empty ? (
          <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {emptyText}
          </p>
        ) : (
          <div
            className={PROSE}
            dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(body) }}
          />
        )}
        {stamp && author && !empty ? (
          <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
            Updated by {author} · {formatWhen(stamp)}
          </p>
        ) : null}
      </div>
      {open ? (
        <NoteDialog
          title={title}
          editHint={editHint}
          save={save}
          initialHtml={body}
          onClose={() => setOpen(false)}
          onSaved={(next, at, name) => {
            setBody(next);
            setStamp(at);
            setAuthor(name);
            setOpen(false);
          }}
        />
      ) : null}
    </Panel>
  );
}

function NoteDialog({
  title,
  editHint,
  save: saveNote,
  initialHtml,
  onClose,
  onSaved,
}: {
  title: string;
  editHint: string;
  save: (html: string) => Promise<ActionResult<SavedNote>>;
  initialHtml: string;
  onClose: () => void;
  onSaved: (html: string, updatedAt: string, updatedByName: string) => void;
}) {
  const titleId = useId();
  const editorRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    node.innerHTML = noteIsEmpty(initialHtml)
      ? "<p><br></p>"
      : sanitizeNoteHtml(initialHtml);
    node.focus();
  }, [initialHtml]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPending, onClose]);

  function run(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function highlight() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const mark = document.createElement("mark");
    try {
      range.surroundContents(mark);
    } catch {
      document.execCommand(
        "insertHTML",
        false,
        `<mark>${selection.toString()}</mark>`,
      );
    }
  }

  function applyLink() {
    const href = linkUrl.trim();
    if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) {
      setError("Use a full http, https, or mailto address.");
      return;
    }
    run("createLink", href);
    setLinkOpen(false);
    setLinkUrl("");
    setError(null);
  }

  function save() {
    const raw = editorRef.current?.innerHTML ?? "";
    startTransition(async () => {
      const result = await saveNote(raw);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSaved(result.data.html, result.data.updatedAt, result.data.updatedByName);
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/60 px-4 dark:bg-black/70"
      role="presentation"
      onClick={isPending ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id={titleId}
          className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Edit {title.toLowerCase()}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          {editHint}
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          <ToolButton label="Bold" onClick={() => run("bold")}>
            <Bold className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Italic" onClick={() => run("italic")}>
            <Italic className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Underline" onClick={() => run("underline")}>
            <Underline className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Strikethrough" onClick={() => run("strikeThrough")}>
            <Strikethrough className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Heading" onClick={() => run("formatBlock", "h2")}>
            <Heading2 className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Bullet list" onClick={() => run("insertUnorderedList")}>
            <List className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Numbered list" onClick={() => run("insertOrderedList")}>
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Highlight" onClick={highlight}>
            <Highlighter className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Link" onClick={() => setLinkOpen((open) => !open)}>
            <Link2 className="h-3.5 w-3.5" />
          </ToolButton>
        </div>
        {linkOpen ? (
          <div className="mt-2 flex gap-2">
            <input
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://"
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
            <button
              type="button"
              onClick={applyLink}
              className="rounded-lg border border-zinc-300 px-2 py-1.5 text-xs font-semibold dark:border-zinc-600"
            >
              Apply link
            </button>
          </div>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={title}
          className={`mt-3 min-h-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-slate-400 dark:border-zinc-600 dark:bg-zinc-950 ${PROSE}`}
          onInput={() => setError(null)}
        />
        {error ? (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}
