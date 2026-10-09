"use client";

import { useEffect, useState, useTransition } from "react";

import { useToast } from "@/src/components/providers/ToastProvider";
import {
  createProjectFromWorkbook,
  downloadTaskImportTemplate,
  previewProjectWorkbook,
  type TaskImportPreview,
} from "@/src/lib/actions/task-import";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function downloadBase64(fileName: string, fileBase64: string) {
  const binary = atob(fileBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export default function TaskImportDialog({
  onCancel,
  onCreated,
  onPendingChange,
}: {
  onCancel: () => void;
  onCreated: (project: { id: string; name: string; taskCount: number }) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"template" | "preview" | "commit" | null>(
    null,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [preview, setPreview] = useState<TaskImportPreview | null>(null);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  function resetFile() {
    setFileName(null);
    setFileBase64(null);
    setPreview(null);
  }

  function handleClose() {
    if (isPending) return;
    resetFile();
    onCancel();
  }

  function handleDownloadTemplate() {
    setBusy("template");
    startTransition(async () => {
      try {
        const result = await downloadTaskImportTemplate();
        if (!result.success) {
          showToast(result.error, "error");
          return;
        }
        downloadBase64(result.data.fileName, result.data.fileBase64);
      } finally {
        setBusy(null);
      }
    });
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      showToast("Use an Excel .xlsx file.", "error");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showToast("The workbook must be under 2 MB.", "error");
      return;
    }
    setBusy("preview");
    startTransition(async () => {
      try {
        const encoded = await fileToBase64(file);
        const result = await previewProjectWorkbook({
          fileBase64: encoded,
        });
        if (!result.success) {
          showToast(result.error, "error");
          resetFile();
          return;
        }
        setFileName(file.name);
        setFileBase64(encoded);
        setPreview(result.data);
      } finally {
        setBusy(null);
      }
    });
  }

  function handleCommit() {
    if (!fileBase64 || !preview || preview.errors.length > 0) return;
    setBusy("commit");
    startTransition(async () => {
      try {
        const result = await createProjectFromWorkbook({ fileBase64 });
        if (!result.success) {
          showToast(result.error, "error");
          return;
        }
        showToast(
          `Created “${result.data.name}” with ${result.data.taskCount} tasks.`,
          "success",
        );
        resetFile();
        onCreated(result.data);
      } finally {
        setBusy(null);
      }
    });
  }

  const blocked = !preview || preview.errors.length > 0 || preview.rows.length === 0;

  return (
    <div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Cell B1 becomes the project name. Headers stay on row 2 and tasks
          start at row 3. Download the template if you are not sure of the
          layout. Validation runs before the project is created. Tasks are
          saved unassigned.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={handleDownloadTemplate}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {busy === "template" ? "Preparing template…" : "Download template"}
          </button>
          <label className="inline-flex cursor-pointer items-center rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900">
            {busy === "preview" ? "Reading…" : "Choose workbook"}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                handleFile(file);
              }}
            />
          </label>
        </div>

        {fileName ? (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            {fileName}
          </p>
        ) : null}

        {preview ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-zinc-800 dark:text-zinc-100">
              {preview.projectName
                ? `New project: ${preview.projectName}. `
                : ""}
              {preview.taskCount === 1
                ? "1 task"
                : `${preview.taskCount} tasks`}
            </p>

            {preview.notices.length > 0 ? (
              <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
                {preview.notices.map((notice, index) => (
                  <li key={`${notice.rowNumber}-${index}`}>{notice.message}</li>
                ))}
              </ul>
            ) : null}

            {preview.errors.length > 0 ? (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
                {preview.errors.map((error, index) => (
                  <li key={`${error.rowNumber}-${index}`}>
                    {error.rowNumber > 0 ? `Row ${error.rowNumber}: ` : ""}
                    {error.message}
                  </li>
                ))}
              </ul>
            ) : null}

            {preview.rows.length > 0 ? (
              <ul className="max-h-52 divide-y divide-zinc-200 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
                {preview.rows.slice(0, 40).map((row) => (
                  <li key={row.rowNumber} className="px-3 py-2 text-sm">
                    <p className="text-zinc-900 dark:text-zinc-50">
                      <span className="font-medium">{row.processGroup}</span>
                      {" · "}
                      {row.title} · {row.progress}%
                    </p>
                    {row.warnings.map((warning) => (
                      <p
                        key={warning}
                        className="mt-0.5 text-xs text-amber-800 dark:text-amber-200"
                      >
                        {warning}
                      </p>
                    ))}
                  </li>
                ))}
                {preview.rows.length > 40 ? (
                  <li className="px-3 py-2 text-xs text-zinc-500">
                    And {preview.rows.length - 40} more rows.
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={handleClose}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || blocked}
            onClick={handleCommit}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy === "commit" ? "Creating…" : "Create project"}
          </button>
        </div>
    </div>
  );
}
