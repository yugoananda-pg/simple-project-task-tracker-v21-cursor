import Link from "next/link";

import UserDropdownMenu from "@/src/components/layout/UserDropdownMenu";
import { countPendingApprovals } from "@/src/lib/actions/users";
import { canOpenPortfolio } from "@/src/lib/dashboard-access";
import {
  canAccessCompletedWorkspace,
  getSessionUser,
} from "@/src/lib/rbac";

export default async function AppHeader() {
  const user = await getSessionUser();
  // Unapproved / pending accounts must look signed-out (Sign in), even if a
  // stale Auth cookie briefly survives edge sign-out.
  const isSignedIn = user?.approvalStatus === "APPROVED";
  const showCompleted =
    isSignedIn && user != null && canAccessCompletedWorkspace(user);

  // The PM Portfolio or Total Company tick decides this, whatever the role.
  const showPortfolio = isSignedIn && user != null && canOpenPortfolio(user);

  const pendingApprovalCount =
    isSignedIn && user?.globalRole === "super_pm"
      ? await countPendingApprovals()
      : 0;

  return (
    <header className="border-b border-slate-700/80 bg-slate-800 text-slate-50 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mx-auto flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href={isSignedIn ? "/" : "/login"}
          className={[
            "shrink-0 whitespace-nowrap text-sm font-semibold tracking-tight text-slate-50 transition hover:text-white",
            // On phones the Projects link already leads home, which frees room for the nav.
            isSignedIn ? "hidden sm:block" : "",
          ].join(" ")}
        >
          Simple Project Task Tracker 2.1
        </Link>

        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {isSignedIn && user ? (
            <>
              <nav aria-label="Primary" className="flex items-center gap-3 sm:gap-4">
                <Link
                  href="/"
                  className="text-sm font-medium text-slate-300 transition hover:text-white"
                >
                  Projects
                </Link>
                {showPortfolio ? (
                  <Link
                    href="/portfolio"
                    className="text-sm font-medium text-slate-300 transition hover:text-white"
                  >
                    Portfolio
                  </Link>
                ) : null}
                {showCompleted ? (
                  <Link
                    href="/projects/completed"
                    className="text-sm font-medium text-slate-300 transition hover:text-white"
                  >
                    Completed
                  </Link>
                ) : null}
              </nav>
              <UserDropdownMenu
                name={user.name}
                email={user.email}
                globalRole={user.globalRole}
                pendingApprovalCount={pendingApprovalCount}
              />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-white"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
