"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

import { getAboutInfo } from "@/src/lib/actions/about";
import { APP_CREDITS, APP_NAME, APP_RELEASE, type AboutInfo } from "@/src/lib/app-info";

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatChecked(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export default function AboutDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [info, setInfo] = useState<AboutInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getAboutInfo()
      .then((result) => {
        if (!live) return;
        if (result.success) setInfo(result.data);
        else setError(result.error);
      })
      .catch(() => {
        if (live) setError("The system details could not be loaded.");
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const credits = info?.credits ?? APP_CREDITS;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/60 px-4 dark:bg-black/70"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-5 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              About {info?.appName ?? APP_NAME}
            </h2>
            <p className="mt-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {info?.release ?? APP_RELEASE}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <section aria-label="Database">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Database
            </h3>
            {error ? (
              <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            ) : !info ? (
              <div className="mt-2 h-5 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            ) : (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm">
                <span
                  aria-hidden
                  className={`size-2.5 rounded-full ${info.database.connected ? "bg-emerald-500" : "bg-rose-500"}`}
                />
                <span className="font-medium">
                  {info.database.connected ? "Connected" : "Not reachable"}
                </span>
                {info.database.connected && info.database.latencyMs != null ? (
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {info.database.latencyMs} ms
                  </span>
                ) : null}
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Checked {formatChecked(info.checkedAt)}
                </span>
              </p>
            )}
          </section>

          <section aria-label="Runtime stack">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Runtime stack
            </h3>
            {!info ? (
              <div className="mt-2 space-y-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    key={index}
                    className="h-4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"
                  />
                ))}
              </div>
            ) : (
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {info.stack.map((item) => (
                  <div key={item.name} className="flex justify-between gap-3">
                    <dt className="text-zinc-600 dark:text-zinc-300">{item.name}</dt>
                    <dd className="font-mono text-xs tabular-nums text-zinc-900 dark:text-zinc-50">
                      {item.version}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section
            aria-label="Credits"
            className="rounded-xl border border-teal-600/15 bg-teal-50/70 px-4 py-3.5 dark:border-teal-300/20 dark:bg-teal-400/10"
          >
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-200">
              Architectural credits
            </h3>
            <p className="mt-1.5 text-base font-semibold">{credits.name}</p>
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              {credits.role}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
