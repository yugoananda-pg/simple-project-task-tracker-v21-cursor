"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import PasswordInput from "@/src/components/auth/PasswordInput";
import { useToast } from "@/src/components/providers/ToastProvider";
import SettingsPageHeader from "@/src/components/settings/SettingsPageHeader";
import {
  changeOwnPassword,
  updateOwnName,
  type OwnAccountDto,
} from "@/src/lib/actions/account";

export type AccountSettingsClientProps = {
  account: OwnAccountDto;
};

export default function AccountSettingsClient({
  account,
}: AccountSettingsClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(account.name);

  function handleNameSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateOwnName({ name });
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      setName(result.data.name);
      showToast("Display name updated.", "success");
      router.refresh();
    });
  }

  function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await changeOwnPassword({
        currentPassword: String(formData.get("currentPassword") ?? ""),
        newPassword: String(formData.get("newPassword") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
      });
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      form.reset();
      showToast("Password updated. Use the new password next time you sign in.", "success");
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <SettingsPageHeader
        current="Account"
        title="Account"
        description="Update your display name and password. Your email address cannot be changed here — registering a new email means creating a new account."
      />

      <div className="space-y-8">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Profile
          </h2>
          <form className="mt-4 space-y-4" onSubmit={handleNameSave}>
            <div>
              <label
                htmlFor="account-email"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Email
              </label>
              <input
                id="account-email"
                type="email"
                value={account.email}
                readOnly
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
              />
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Email is permanent for this account. To use a different address,
                register a new account, transfer work, then ask a Super PM to
                remove the old account.
              </p>
            </div>
            <div>
              <label
                htmlFor="account-name"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Display name
              </label>
              <input
                id="account-name"
                name="name"
                type="text"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isPending}
                autoComplete="name"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            >
              {isPending ? "Saving…" : "Save name"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Change password
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Enter your current password, then choose a new one.
          </p>
          <form className="mt-4 space-y-4" onSubmit={handlePasswordChange}>
            <div>
              <label
                htmlFor="current-password"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Current password
              </label>
              <PasswordInput
                id="current-password"
                name="currentPassword"
                autoComplete="current-password"
                disabled={isPending}
              />
            </div>
            <div>
              <label
                htmlFor="new-password"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                New password
              </label>
              <PasswordInput
                id="new-password"
                name="newPassword"
                autoComplete="new-password"
                disabled={isPending}
              />
            </div>
            <div>
              <label
                htmlFor="confirm-password"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Confirm new password
              </label>
              <PasswordInput
                id="confirm-password"
                name="confirmPassword"
                autoComplete="new-password"
                disabled={isPending}
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            >
              {isPending ? "Updating…" : "Update password"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
