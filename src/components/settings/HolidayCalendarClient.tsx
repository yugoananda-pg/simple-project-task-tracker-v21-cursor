"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";

import SettingsPageHeader from "@/src/components/settings/SettingsPageHeader";
import ConfirmDialog from "@/src/components/ui/ConfirmDialog";
import {
  createHoliday,
  deleteHoliday,
  updateHoliday,
  type HolidayDto,
} from "@/src/lib/actions/holidays";
import { useToast } from "@/src/components/providers/ToastProvider";

export type HolidayCalendarClientProps = {
  initialHolidays: HolidayDto[];
};

function formatAuDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export default function HolidayCalendarClient({
  initialHolidays,
}: HolidayCalendarClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [holidays, setHolidays] = useState(initialHolidays);
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [isNational, setIsNational] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HolidayDto | null>(null);
  const [isPending, startTransition] = useTransition();

  const sorted = useMemo(
    () =>
      [...holidays].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
      ),
    [holidays],
  );

  function resetForm() {
    setDate("");
    setDescription("");
    setIsNational(true);
    setEditingId(null);
  }

  function beginEdit(holiday: HolidayDto) {
    setEditingId(holiday.id);
    setDate(holiday.date);
    setDescription(holiday.description);
    setIsNational(holiday.isNational);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      if (editingId) {
        const result = await updateHoliday({
          id: editingId,
          date,
          description,
          isNational,
        });
        if (!result.success) {
          showToast(result.error, "error");
          return;
        }
        setHolidays((current) =>
          current.map((row) => (row.id === editingId ? result.data : row)),
        );
        showToast("Holiday updated.", "success");
      } else {
        const result = await createHoliday({ date, description, isNational });
        if (!result.success) {
          showToast(result.error, "error");
          return;
        }
        setHolidays((current) => [...current, result.data]);
        showToast("Holiday added.", "success");
      }
      resetForm();
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const result = await deleteHoliday(id);
      if (!result.success) {
        showToast(result.error, "error");
        setDeleteTarget(null);
        return;
      }
      setHolidays((current) => current.filter((row) => row.id !== id));
      if (editingId === id) resetForm();
      setDeleteTarget(null);
      showToast("Holiday removed.", "success");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <SettingsPageHeader
        current="Holiday calendar"
        title="Global Holiday Calendar"
        description="Register statutory Australian public holidays and corporate shutdowns. Working-day durations exclude weekends and these dates."
      />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {editingId ? "Edit holiday" : "Add holiday"}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-zinc-700 dark:text-zinc-300">
              Date
            </span>
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-900 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:ring-zinc-100"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1.5 block font-medium text-zinc-700 dark:text-zinc-300">
              Description
            </span>
            <input
              type="text"
              required
              maxLength={200}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Australia Day"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-900 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:ring-zinc-100"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={isNational}
              onChange={(event) => setIsNational(event.target.checked)}
              className="size-4 rounded border-zinc-300"
            />
            National / gazetted public holiday
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {isPending
              ? "Saving…"
              : editingId
                ? "Save changes"
                : "Add holiday"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              disabled={isPending}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Registered holidays ({sorted.length})
          </h2>
        </div>
        {sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No holidays registered yet. Add Australia Day, Easter Monday, or a
            corporate shutdown to begin.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {sorted.map((holiday) => (
              <li
                key={holiday.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {formatAuDate(holiday.date)}
                    <span className="ml-2 font-normal text-zinc-600 dark:text-zinc-300">
                      {holiday.description}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {holiday.isNational
                      ? "National / gazetted"
                      : "Corporate shutdown"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => beginEdit(holiday)}
                    disabled={isPending}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(holiday)}
                    disabled={isPending}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete holiday?"
        message={
          deleteTarget
            ? `Remove ${deleteTarget.description} on ${formatAuDate(deleteTarget.date)}? Task working-day durations will recalculate on the next read.`
            : ""
        }
        confirmLabel="Delete holiday"
        isPending={isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
