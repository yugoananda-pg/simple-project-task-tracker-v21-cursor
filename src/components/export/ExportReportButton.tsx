"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FileDown, Loader2 } from "lucide-react";

import type { ExportFormat } from "@/src/lib/export/executive-deck-generator";

type ExportReportButtonProps = {
  /** Builds and downloads the chosen file. Throw to show the error line. */
  onExport: (format: ExportFormat) => Promise<void>;
};

/**
 * One control: Export report, then PDF or PowerPoint. The file is built in
 * the browser from the figures already on the screen.
 */
export default function ExportReportButton({ onExport }: ExportReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(format: ExportFormat) {
    setOpen(false);
    setError(null);
    setBusy(format);
    setStatus(format === "pdf" ? "Preparing the PDF…" : "Preparing the PowerPoint…");
    try {
      await onExport(format);
      setStatus("Download started.");
    } catch (caught) {
      const message =
        caught instanceof Error && caught.message.trim()
          ? caught.message
          : "The report could not be prepared. Try again.";
      setError(message);
      setStatus("");
    } finally {
      setBusy(null);
    }
  }

  const waiting = busy != null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={waiting}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-70 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        {waiting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <FileDown className="size-4" aria-hidden />
        )}
        {waiting
          ? busy === "pdf"
            ? "Preparing PDF…"
            : "Preparing PowerPoint…"
          : "Export report"}
        <ChevronDown
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Export format"
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/70"
            onClick={() => void run("pdf")}
          >
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              PDF
            </span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Same slides, ready to send
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/70"
            onClick={() => void run("pptx")}
          >
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              PowerPoint
            </span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Editable 16:9 deck
            </span>
          </button>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      {error ? (
        <p role="alert" className="absolute right-0 mt-2 w-64 text-right text-xs text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
