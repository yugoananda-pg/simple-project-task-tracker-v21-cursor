import Link from "next/link";

import NotificationBadge from "@/src/components/ui/NotificationBadge";
import { countPendingApprovals } from "@/src/lib/actions/users";
import { requireApprovedPageUser } from "@/src/lib/rbac";

export default async function SettingsPage() {
  const user = await requireApprovedPageUser();
  const isSuperPm = user.globalRole === "super_pm";
  const pendingApprovalCount = isSuperPm ? await countPendingApprovals() : 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Settings
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {isSuperPm
          ? "Manage your account and platform administration."
          : "Manage your account."}
      </p>

      <ul className="mt-8 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900">
        <li>
          <Link
            href="/settings/account"
            className="flex items-center justify-between gap-3 px-4 py-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Account
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Display name and password (email cannot be changed)
              </p>
            </div>
            <span className="text-sm text-zinc-400" aria-hidden>
              →
            </span>
          </Link>
        </li>

        {isSuperPm ? (
          <>
            <li>
              <Link
                href="/settings/users"
                className="flex items-center justify-between gap-3 px-4 py-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    <span>Users &amp; privileges</span>
                    <NotificationBadge count={pendingApprovalCount} />
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    Approvals, direct account creation, password reset, privileges,
                    and safe deactivation
                    {pendingApprovalCount > 0
                      ? ` · ${pendingApprovalCount} awaiting approval`
                      : ""}
                  </p>
                </div>
                <span className="text-sm text-zinc-400" aria-hidden>
                  →
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/settings/viewer-visibility"
                className="flex items-center justify-between gap-3 px-4 py-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Viewer project visibility
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    Choose Selected projects or every Active project. Access
                    stays read-only.
                  </p>
                </div>
                <span className="text-sm text-zinc-400" aria-hidden>
                  →
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/settings/holidays"
                className="flex items-center justify-between px-4 py-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Global Holiday Calendar
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    Statutory holidays and corporate shutdowns for working-day
                    maths
                  </p>
                </div>
                <span className="text-sm text-zinc-400" aria-hidden>
                  →
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/settings/deleted-projects"
                className="flex items-center justify-between px-4 py-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Deleted Projects
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    Soft-delete recycle bin — restore or permanently purge
                  </p>
                </div>
                <span className="text-sm text-zinc-400" aria-hidden>
                  →
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/settings/purged-projects"
                className="flex items-center justify-between px-4 py-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Purged Project Register
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    Append-only tombstones for physically removed programmes
                  </p>
                </div>
                <span className="text-sm text-zinc-400" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          </>
        ) : null}
      </ul>
    </div>
  );
}
