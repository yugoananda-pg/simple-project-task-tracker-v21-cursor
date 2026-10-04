"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import PasswordInput from "@/src/components/auth/PasswordInput";
import { useToast } from "@/src/components/providers/ToastProvider";
import SettingsPageHeader from "@/src/components/settings/SettingsPageHeader";
import ConfirmDialog from "@/src/components/ui/ConfirmDialog";
import {
  approveUser,
  deactivateUser,
  deleteRegistrationApplicant,
  getUserDeletionImpact,
  hardDeleteUser,
  provisionUserBySuperPm,
  reactivateUser,
  rejectUser,
  resendApprovalEmail,
  resetUserPasswordBySuperPm,
  updateManagedUserName,
  updateUserPrivileges,
  type ManagedUserDto,
  type UserDeletionImpact,
} from "@/src/lib/actions/users";
import { getRoleLabel } from "@/src/lib/role-labels";
import type {
  ApprovalStatus,
  CompletedProjectAccess,
  DashboardScope,
  GlobalRole,
} from "@/src/lib/types";

export type UserGovernanceClientProps = {
  initialUsers: ManagedUserDto[];
  currentUserId: string;
};

type TabId = "approvals" | "create" | "privileges" | "deletion";

const STATUS_ORDER: ApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED"];

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const DASHBOARD_OPTIONS: { id: DashboardScope; label: string }[] = [
  { id: "PROJECT", label: "Per-project Analytics" },
  { id: "PM_PORTFOLIO", label: "PM Portfolio" },
  { id: "TOTAL_COMPANY", label: "Total Company" },
];

const ROLE_FILTERS: { id: "all" | GlobalRole; label: string }[] = [
  { id: "all", label: "All roles" },
  { id: "super_pm", label: "Super PM" },
  { id: "pm", label: "PM" },
  { id: "member", label: "Member" },
  { id: "viewer", label: "Viewer" },
];

const COMPLETED_ACCESS_LABEL: Record<CompletedProjectAccess, string> = {
  NONE: "Completed: None",
  ASSIGNED: "Completed: Assigned",
  ALL: "Completed: All",
};

function formatAuDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function matchesDirectoryQuery(
  row: Pick<ManagedUserDto, "name" | "email">,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    row.name.toLowerCase().includes(needle) ||
    row.email.toLowerCase().includes(needle)
  );
}

/** True when purge is due within the next 2 calendar days (inclusive of overdue). */
function isPurgeDueSoon(purgeDueAt: string | null, now = Date.now()): boolean {
  if (!purgeDueAt) return false;
  const due = new Date(purgeDueAt).getTime();
  if (Number.isNaN(due)) return false;
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
  return due - now <= twoDaysMs;
}

export default function UserGovernanceClient({
  initialUsers,
  currentUserId,
}: UserGovernanceClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabId>("approvals");
  const [users, setUsers] = useState(initialUsers);
  const [isPending, startTransition] = useTransition();
  const [impact, setImpact] = useState<UserDeletionImpact | null>(null);
  const [projectAssignments, setProjectAssignments] = useState<
    Record<string, string>
  >({});
  const [hardDeleteTarget, setHardDeleteTarget] = useState<ManagedUserDto | null>(
    null,
  );
  const [applicantDeleteTarget, setApplicantDeleteTarget] =
    useState<ManagedUserDto | null>(null);
  const [reactivateTarget, setReactivateTarget] =
    useState<ManagedUserDto | null>(null);
  const [passwordResetTarget, setPasswordResetTarget] =
    useState<ManagedUserDto | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<{
    name: string;
    email: string;
    temporaryPassword: string;
  } | null>(null);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [approvalQuery, setApprovalQuery] = useState("");
  const [privilegeQuery, setPrivilegeQuery] = useState("");
  const [privilegeRoleFilter, setPrivilegeRoleFilter] = useState<
    "all" | GlobalRole
  >("all");
  const [expandedPrivilegeId, setExpandedPrivilegeId] = useState<string | null>(
    null,
  );
  const [deletionQuery, setDeletionQuery] = useState("");
  const [deletionRoleFilter, setDeletionRoleFilter] = useState<
    "all" | GlobalRole
  >("all");
  const [loadingDeletionUserId, setLoadingDeletionUserId] = useState<
    string | null
  >(null);

  const activeUsers = useMemo(
    () =>
      users
        .filter(
          (row) => !row.deactivatedAt && row.approvalStatus === "APPROVED",
        )
        .sort((a, b) =>
          a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
        ),
    [users],
  );

  const deactivatableUsers = useMemo(
    () => activeUsers.filter((row) => row.id !== currentUserId),
    [activeUsers, currentUserId],
  );

  const filteredDeactivatableUsers = useMemo(() => {
    return deactivatableUsers.filter((row) => {
      if (!matchesDirectoryQuery(row, deletionQuery)) return false;
      if (deletionRoleFilter === "all") return true;
      return row.globalRole === deletionRoleFilter;
    });
  }, [deactivatableUsers, deletionQuery, deletionRoleFilter]);

  const grouped = useMemo(() => {
    const map: Record<ApprovalStatus, ManagedUserDto[]> = {
      PENDING: [],
      APPROVED: [],
      REJECTED: [],
    };
    for (const row of users) {
      if (row.deactivatedAt) continue;
      // Pending Super PM queue only after the registrant confirmed email.
      if (row.approvalStatus === "PENDING" && !row.emailConfirmedAt) continue;
      map[row.approvalStatus].push(row);
    }
    // Oldest first — fairness for the pending queue; stable scan order elsewhere.
    for (const status of STATUS_ORDER) {
      map[status].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [users]);

  const filteredGrouped = useMemo(() => {
    const map: Record<ApprovalStatus, ManagedUserDto[]> = {
      PENDING: [],
      APPROVED: [],
      REJECTED: [],
    };
    for (const status of STATUS_ORDER) {
      map[status] = grouped[status].filter((row) =>
        matchesDirectoryQuery(row, approvalQuery),
      );
    }
    return map;
  }, [approvalQuery, grouped]);

  const filteredPrivilegeUsers = useMemo(() => {
    return activeUsers.filter((row) => {
      if (!matchesDirectoryQuery(row, privilegeQuery)) return false;
      if (privilegeRoleFilter === "all") return true;
      return row.globalRole === privilegeRoleFilter;
    });
  }, [activeUsers, privilegeQuery, privilegeRoleFilter]);

  const deactivated = useMemo(() => {
    return users
      .filter((row) => row.deactivatedAt)
      .sort((a, b) => {
        // Soonest purge first so Super PMs attend to deadlines before A–Z noise.
        const aDue = a.purgeDueAt ? new Date(a.purgeDueAt).getTime() : Infinity;
        const bDue = b.purgeDueAt ? new Date(b.purgeDueAt).getTime() : Infinity;
        if (aDue !== bDue) return aDue - bDue;
        return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      });
  }, [users]);

  const filteredDeactivated = useMemo(
    () =>
      deactivated.filter((row) => matchesDirectoryQuery(row, deletionQuery)),
    [deactivated, deletionQuery],
  );

  function applyUpdate(updated: ManagedUserDto) {
    setUsers((current) =>
      current.map((row) => (row.id === updated.id ? updated : row)),
    );
  }

  function removeUser(userId: string) {
    setUsers((current) => current.filter((row) => row.id !== userId));
  }

  function handleApprove(userId: string, globalRole: GlobalRole) {
    startTransition(async () => {
      const result = await approveUser({ userId, globalRole });
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      applyUpdate(result.data.user);
      const roleLabel = getRoleLabel(result.data.user.globalRole);
      if (result.data.emailDelivered) {
        showToast(
          `User approved as ${roleLabel}. Approval email is being sent.`,
          "success",
        );
      } else {
        showToast(
          `User approved as ${roleLabel}. Approval email was not sent: ${result.data.emailSkipReason ?? "mail not configured"}.`,
          "error",
        );
      }
      router.refresh();
    });
  }

  function handleReject(userId: string) {
    startTransition(async () => {
      const result = await rejectUser(userId);
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      applyUpdate(result.data.user);
      if (result.data.emailDelivered) {
        showToast("User rejected. Notification email is being sent.", "success");
      } else {
        showToast(
          `User rejected. Notification email was not sent: ${result.data.emailSkipReason ?? "mail not configured"}.`,
          "error",
        );
      }
      router.refresh();
    });
  }

  function handleResendApprovalEmail(userId: string) {
    startTransition(async () => {
      const result = await resendApprovalEmail(userId);
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      if (result.data.emailDelivered) {
        showToast("Approval email sent.", "success");
      } else {
        showToast(
          `Approval email was not sent: ${result.data.emailSkipReason ?? "mail not configured"}.`,
          "error",
        );
      }
    });
  }

  function confirmDeleteApplicant() {
    if (!applicantDeleteTarget) return;
    startTransition(async () => {
      const result = await deleteRegistrationApplicant(applicantDeleteTarget.id);
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      removeUser(applicantDeleteTarget.id);
      setApplicantDeleteTarget(null);
      showToast("Registration account permanently deleted.", "success");
      router.refresh();
    });
  }

  function handleProvisionAccount(form: HTMLFormElement) {
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await provisionUserBySuperPm({
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        temporaryPassword: String(formData.get("temporaryPassword") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
        globalRole: String(formData.get("globalRole") ?? "member") as GlobalRole,
      });
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      setUsers((current) => [result.data, ...current]);
      form.reset();
      showToast(
        `${result.data.name} created as ${getRoleLabel(result.data.globalRole)} and can sign in immediately. Share the temporary password securely offline.`,
        "success",
      );
      router.refresh();
    });
  }

  function goToPrivilegeEditor(userId: string) {
    setTab("privileges");
    setPrivilegeQuery("");
    setPrivilegeRoleFilter("all");
    setExpandedPrivilegeId(userId);
    window.setTimeout(() => {
      document
        .getElementById(`privilege-${userId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  function confirmPasswordReset() {
    if (!passwordResetTarget) return;
    const target = passwordResetTarget;
    startTransition(async () => {
      const result = await resetUserPasswordBySuperPm(target.id);
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      setPasswordResetTarget(null);
      setRevealedPassword({
        name: result.data.name,
        email: result.data.email,
        temporaryPassword: result.data.temporaryPassword,
      });
      showToast(
        `Temporary password generated for ${result.data.name}. Share it securely offline.`,
        "success",
      );
    });
  }

  function handleSaveManagedName(row: ManagedUserDto) {
    const nextName = (nameDrafts[row.id] ?? row.name).trim();
    startTransition(async () => {
      const result = await updateManagedUserName({
        userId: row.id,
        name: nextName,
      });
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      applyUpdate(result.data);
      setNameDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      showToast("Display name updated.", "success");
      router.refresh();
    });
  }

  function handlePrivilegeSave(row: ManagedUserDto, form: HTMLFormElement) {
    const formData = new FormData(form);
    const globalRole = String(formData.get("globalRole") ?? row.globalRole);
    const completedProjectAccess = String(
      formData.get("completedProjectAccess") ?? row.completedProjectAccess,
    );
    const dashboardAccess = DASHBOARD_OPTIONS.map((opt) => opt.id).filter(
      (id) => formData.get(`dash_${id}`) === "on",
    );

    startTransition(async () => {
      const result = await updateUserPrivileges({
        userId: row.id,
        globalRole: globalRole as GlobalRole,
        dashboardAccess: dashboardAccess as DashboardScope[],
        completedProjectAccess:
          completedProjectAccess as CompletedProjectAccess,
      });
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      applyUpdate(result.data);
      showToast("Privileges updated.", "success");
      router.refresh();
    });
  }

  function openDeletion(userId: string) {
    setLoadingDeletionUserId(userId);
    startTransition(async () => {
      try {
        const result = await getUserDeletionImpact(userId);
        if (!result.success) {
          showToast(result.error, "error");
          return;
        }
        setImpact(result.data);
        const initial: Record<string, string> = {};
        for (const project of result.data.ownedProjects) {
          initial[project.id] = "";
        }
        setProjectAssignments(initial);
      } finally {
        setLoadingDeletionUserId(null);
      }
    });
  }

  function pmHandoverReady(data: UserDeletionImpact): boolean {
    if (data.mode !== "pm_handover") return true;
    if (data.ownedProjects.length === 0) return true;
    return data.ownedProjects.every(
      (project) => Boolean(projectAssignments[project.id]),
    );
  }

  function confirmDeactivation() {
    if (!impact) return;
    startTransition(async () => {
      const assignments =
        impact.mode === "pm_handover"
          ? impact.ownedProjects
              .filter((project) => projectAssignments[project.id])
              .map((project) => ({
                projectId: project.id,
                newOwnerId: projectAssignments[project.id],
              }))
          : undefined;

      const result = await deactivateUser({
        userId: impact.userId,
        projectAssignments: assignments,
      });
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      applyUpdate(result.data);
      setImpact(null);
      showToast(
        "Account deactivated. A 30-day purge window has started.",
        "success",
      );
      router.refresh();
    });
  }

  function confirmReactivate() {
    if (!reactivateTarget) return;
    startTransition(async () => {
      const result = await reactivateUser(reactivateTarget.id);
      if (!result.success) {
        showToast(result.error, "error");
        setReactivateTarget(null);
        return;
      }
      applyUpdate(result.data);
      setReactivateTarget(null);
      showToast("Account reactivated.", "success");
      router.refresh();
    });
  }

  function confirmHardDelete() {
    if (!hardDeleteTarget) return;
    startTransition(async () => {
      const result = await hardDeleteUser(hardDeleteTarget.id);
      if (!result.success) {
        showToast(result.error, "error");
        return;
      }
      removeUser(hardDeleteTarget.id);
      setHardDeleteTarget(null);
      showToast("Account permanently deleted.", "success");
      router.refresh();
    });
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "approvals", label: "Approvals" },
    { id: "create", label: "Create account" },
    { id: "privileges", label: "Privilege matrix" },
    { id: "deletion", label: "Safe deletion" },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <SettingsPageHeader
        current="Users & privileges"
        title="Users & privileges"
        description="Approve self-service registrations, provision known people directly, reset passwords when email is unavailable, edit display names, delegate dashboard and Completed visibility, and safely deactivate accounts with asset handover, reactivation, or permanent purge. Email addresses cannot be changed — a new email requires a new account."
      />

      <div
        role="tablist"
        aria-label="User governance sections"
        className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-700"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={[
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              tab === item.id
                ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <div className="max-w-lg space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Create an approved account for someone you already know when they
            cannot complete email confirmation. This bypasses confirmation and
            the approval queue. Share the temporary password with them securely
            (for example in person). Self-service registration remains the path
            for unknown applicants.
          </p>
          <form
            className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900"
            onSubmit={(event) => {
              event.preventDefault();
              handleProvisionAccount(event.currentTarget);
            }}
          >
            <div>
              <label
                htmlFor="provision-name"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Name
              </label>
              <input
                id="provision-name"
                name="name"
                type="text"
                required
                disabled={isPending}
                autoComplete="name"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                placeholder="Full name"
              />
            </div>
            <div>
              <label
                htmlFor="provision-email"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Email
              </label>
              <input
                id="provision-email"
                name="email"
                type="email"
                required
                disabled={isPending}
                autoComplete="off"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                placeholder="name@organisation.com"
              />
            </div>
            <div>
              <label
                htmlFor="provision-role"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Assigned role
              </label>
              <select
                id="provision-role"
                name="globalRole"
                defaultValue="member"
                disabled={isPending}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              >
                <option value="pm">PM</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
                <option value="super_pm">Super PM</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="provision-password"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Temporary password
              </label>
              <PasswordInput
                id="provision-password"
                name="temporaryPassword"
                autoComplete="new-password"
                disabled={isPending}
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label
                htmlFor="provision-confirm"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Confirm temporary password
              </label>
              <PasswordInput
                id="provision-confirm"
                name="confirmPassword"
                autoComplete="new-password"
                disabled={isPending}
                placeholder="Re-enter password"
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            >
              {isPending ? "Creating account…" : "Create approved account"}
            </button>
          </form>
        </div>
      ) : null}

      {tab === "approvals" ? (
        <div className="space-y-6">
          <div className="sticky top-0 z-10 -mx-1 space-y-2 border-b border-zinc-200 bg-zinc-50/95 px-1 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Find registration
              <input
                type="search"
                value={approvalQuery}
                onChange={(event) => setApprovalQuery(event.target.value)}
                placeholder="Type a name or email…"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </label>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Pending queue is oldest-first. Results update as you type.
            </p>
          </div>

          {STATUS_ORDER.map((status) => {
            const rows = filteredGrouped[status];
            const totalForStatus = grouped[status].length;
            return (
              <section key={status} aria-labelledby={`status-${status}`}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h2
                    id={`status-${status}`}
                    className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300"
                  >
                    {STATUS_LABEL[status]}
                  </h2>
                  <span className="text-xs text-zinc-500">
                    {approvalQuery.trim()
                      ? `${rows.length} of ${totalForStatus}`
                      : totalForStatus}
                  </span>
                </div>
                {totalForStatus === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700">
                    No {STATUS_LABEL[status].toLowerCase()} accounts.
                  </p>
                ) : rows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700">
                    No {STATUS_LABEL[status].toLowerCase()} accounts match “
                    {approvalQuery.trim()}”.
                  </p>
                ) : (
                  <ul className="max-h-[28rem] divide-y divide-zinc-200 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900">
                    {rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                            {row.name}
                          </p>
                          <p className="truncate text-xs text-zinc-500">
                            {row.email}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {status === "PENDING"
                              ? "Role will be assigned on approval"
                              : getRoleLabel(row.globalRole)}{" "}
                            · Registered {formatAuDateTime(row.createdAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {status === "PENDING" || status === "REJECTED" ? (
                            <>
                              <label className="sr-only" htmlFor={`role-${row.id}`}>
                                Role for {row.name}
                              </label>
                              <select
                                id={`role-${row.id}`}
                                defaultValue="member"
                                disabled={isPending}
                                className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                                aria-label={`Assign role when approving ${row.name}`}
                              >
                                <option value="pm">PM</option>
                                <option value="member">Member</option>
                                <option value="viewer">Viewer</option>
                                <option value="super_pm">Super PM</option>
                              </select>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => {
                                  const select = document.getElementById(
                                    `role-${row.id}`,
                                  ) as HTMLSelectElement | null;
                                  const role = (select?.value ??
                                    "member") as GlobalRole;
                                  handleApprove(row.id, role);
                                }}
                                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                              >
                                Approve
                              </button>
                              {status === "PENDING" ? (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => handleReject(row.id)}
                                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300"
                                >
                                  Reject
                                </button>
                              ) : null}
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => setApplicantDeleteTarget(row)}
                                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300"
                              >
                                Delete permanently
                              </button>
                            </>
                          ) : null}
                          {status === "APPROVED" ? (
                            <>
                              <button
                                type="button"
                                disabled={isPending || row.id === currentUserId}
                                onClick={() => setPasswordResetTarget(row)}
                                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                              >
                                Reset password
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleResendApprovalEmail(row.id)}
                                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                              >
                                Resend approval email
                              </button>
                            </>
                          ) : null}
                          {status === "APPROVED" &&
                          row.globalRole !== "super_pm" ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => goToPrivilegeEditor(row.id)}
                              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                            >
                              Edit privileges
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {tab === "privileges" ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Super PM always has Completed visibility <strong>ALL</strong>. Owning
            PMs always see their own completed projects regardless of the stored
            value. Scan the directory, then expand one person to edit.
          </p>

          <div className="sticky top-0 z-10 -mx-1 space-y-3 border-b border-zinc-200 bg-zinc-50/95 px-1 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Find user
              <input
                type="search"
                value={privilegeQuery}
                onChange={(event) => setPrivilegeQuery(event.target.value)}
                placeholder="Type a name or email…"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </label>
            <div
              role="group"
              aria-label="Filter by role"
              className="flex flex-wrap gap-1.5"
            >
              {ROLE_FILTERS.map((filter) => {
                const selected = privilegeRoleFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPrivilegeRoleFilter(filter.id)}
                    className={[
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                      selected
                        ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800",
                    ].join(" ")}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Showing {filteredPrivilegeUsers.length} of {activeUsers.length}{" "}
              {activeUsers.length === 1
                ? "approved account"
                : "approved accounts"}{" "}
              · A–Z by name
            </p>
          </div>

          {activeUsers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500">
              No approved active users to configure.
            </p>
          ) : filteredPrivilegeUsers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500">
              No users match that search
              {privilegeRoleFilter !== "all"
                ? ` and ${getRoleLabel(privilegeRoleFilter)} filter`
                : ""}
              .
            </p>
          ) : (
            <ul className="max-h-[36rem] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
              {filteredPrivilegeUsers.map((row) => {
                const expanded = expandedPrivilegeId === row.id;
                const completedLabel =
                  row.globalRole === "super_pm"
                    ? COMPLETED_ACCESS_LABEL.ALL
                    : COMPLETED_ACCESS_LABEL[row.completedProjectAccess];
                return (
                  <li
                    key={row.id}
                    id={`privilege-${row.id}`}
                    className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedPrivilegeId((current) =>
                          current === row.id ? null : row.id,
                        )
                      }
                      className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          {row.name}
                          {row.id === currentUserId ? " (you)" : ""}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">
                          {row.email}
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                            {getRoleLabel(row.globalRole)}
                          </span>
                          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                            {completedLabel}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 pt-0.5 text-xs font-medium text-zinc-500">
                        {expanded ? "Hide" : "Manage"}
                      </span>
                    </button>

                    {expanded ? (
                      <div className="space-y-3 border-t border-zinc-200 px-4 py-4 dark:border-zinc-700">
                        {row.id !== currentUserId ? (
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="min-w-[12rem] flex-1">
                              <label
                                htmlFor={`name-${row.id}`}
                                className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300"
                              >
                                Display name
                              </label>
                              <input
                                id={`name-${row.id}`}
                                type="text"
                                value={nameDrafts[row.id] ?? row.name}
                                onChange={(event) =>
                                  setNameDrafts((current) => ({
                                    ...current,
                                    [row.id]: event.target.value,
                                  }))
                                }
                                disabled={isPending}
                                className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={
                                isPending ||
                                (nameDrafts[row.id] ?? row.name).trim() ===
                                  row.name
                              }
                              onClick={() => handleSaveManagedName(row)}
                              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                            >
                              Save name
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => setPasswordResetTarget(row)}
                              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                            >
                              Reset password
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-500">
                            Edit your own name and password under Settings →
                            Account.
                          </p>
                        )}
                        <p className="text-xs text-zinc-500">
                          Email (read-only): {row.email}
                        </p>
                        <form
                          key={`${row.id}-${row.updatedAt}-${row.globalRole}-${row.completedProjectAccess}`}
                          className="space-y-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            handlePrivilegeSave(row, event.currentTarget);
                          }}
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                              Global role
                              <select
                                name="globalRole"
                                defaultValue={row.globalRole}
                                disabled={
                                  row.globalRole === "super_pm" || isPending
                                }
                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                              >
                                <option value="super_pm">Super PM</option>
                                <option value="pm">PM</option>
                                <option value="member">Member</option>
                                <option value="viewer">Viewer</option>
                              </select>
                            </label>
                            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                              Completed Projects visibility
                              <select
                                name="completedProjectAccess"
                                defaultValue={
                                  row.globalRole === "super_pm"
                                    ? "ALL"
                                    : row.completedProjectAccess
                                }
                                disabled={
                                  row.globalRole === "super_pm" || isPending
                                }
                                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                              >
                                <option value="NONE">None</option>
                                <option value="ASSIGNED">Assigned</option>
                                <option value="ALL">All</option>
                              </select>
                            </label>
                          </div>
                          <fieldset className="space-y-2">
                            <legend className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                              Dashboard scopes
                            </legend>
                            {row.globalRole === "super_pm" ? (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Super PMs always have every dashboard scope,
                                including Total Company (the enterprise portfolio
                                on{" "}
                                <span className="font-medium">/portfolio</span>
                                ). These checkboxes are informational and cannot
                                be changed here.
                              </p>
                            ) : (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Total Company grants the enterprise-wide portfolio
                                view across all active programmes (Wave 4C{" "}
                                <span className="font-medium">/portfolio</span>).
                              </p>
                            )}
                            <div className="flex flex-wrap gap-3">
                              {DASHBOARD_OPTIONS.map((opt) => {
                                const isSuperPm = row.globalRole === "super_pm";
                                const checked = isSuperPm
                                  ? true
                                  : row.dashboardAccess.includes(opt.id);
                                return (
                                  <label
                                    key={opt.id}
                                    className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"
                                  >
                                    <input
                                      type="checkbox"
                                      name={`dash_${opt.id}`}
                                      defaultChecked={checked}
                                      disabled={isPending || isSuperPm}
                                    />
                                    {opt.label}
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>
                          <button
                            type="submit"
                            disabled={
                              isPending || row.globalRole === "super_pm"
                            }
                            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
                          >
                            Save privileges
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "deletion" ? (
        <div className="space-y-6">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Soft-deactivation keeps the person&apos;s name available for audit
            JOINs for 30 days. Owned projects must be handed to another PM first.
            After the retention window the account is permanently purged unless
            you reactivate it. You cannot deactivate your own account.
          </p>

          <div className="sticky top-0 z-10 -mx-1 space-y-3 border-b border-zinc-200 bg-zinc-50/95 px-1 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Find account
              <input
                type="search"
                value={deletionQuery}
                onChange={(event) => setDeletionQuery(event.target.value)}
                placeholder="Type a name or email…"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </label>
            <div
              role="group"
              aria-label="Filter active accounts by role"
              className="flex flex-wrap gap-1.5"
            >
              {ROLE_FILTERS.map((filter) => {
                const selected = deletionRoleFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDeletionRoleFilter(filter.id)}
                    className={[
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                      selected
                        ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800",
                    ].join(" ")}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Search applies to both lists. Role chips filter Active accounts
              only. Deactivated list is ordered by purge due (soonest first).
            </p>
          </div>

          <section>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                Active accounts
              </h2>
              <span className="text-xs text-zinc-500">
                {deletionQuery.trim() || deletionRoleFilter !== "all"
                  ? `${filteredDeactivatableUsers.length} of ${deactivatableUsers.length}`
                  : deactivatableUsers.length}
              </span>
            </div>
            {deactivatableUsers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700">
                No approved active accounts available to deactivate.
              </p>
            ) : filteredDeactivatableUsers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700">
                No active accounts match that search
                {deletionRoleFilter !== "all"
                  ? ` and ${getRoleLabel(deletionRoleFilter)} filter`
                  : ""}
                .
              </p>
            ) : (
              <ul className="max-h-[22rem] divide-y divide-zinc-200 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900">
                {filteredDeactivatableUsers.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {row.name}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {row.email} · {getRoleLabel(row.globalRole)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending || loadingDeletionUserId != null}
                      onClick={() => openDeletion(row.id)}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300"
                    >
                      {loadingDeletionUserId === row.id
                        ? "Loading impact…"
                        : "Review & deactivate"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                Deactivated
              </h2>
              <span className="text-xs text-zinc-500">
                {deletionQuery.trim()
                  ? `${filteredDeactivated.length} of ${deactivated.length}`
                  : deactivated.length}
              </span>
            </div>
            {deactivated.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700">
                No deactivated accounts.
              </p>
            ) : filteredDeactivated.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700">
                No deactivated accounts match “{deletionQuery.trim()}”.
              </p>
            ) : (
              <ul className="max-h-[22rem] divide-y divide-zinc-200 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900">
                {filteredDeactivated.map((row) => {
                  const dueSoon = isPurgeDueSoon(row.purgeDueAt);
                  return (
                    <li
                      key={row.id}
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          {row.name}
                        </p>
                        <p className="truncate text-xs text-zinc-500">
                          {row.email} · {getRoleLabel(row.globalRole)}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Deactivated{" "}
                          {row.deactivatedAt
                            ? formatAuDateTime(row.deactivatedAt)
                            : "—"}{" "}
                          · Purge due{" "}
                          {row.purgeDueAt
                            ? formatAuDateTime(row.purgeDueAt)
                            : "—"}
                        </p>
                        {dueSoon ? (
                          <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                            Purge due soon — reactivate or permanently delete
                            before retention runs.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setReactivateTarget(row)}
                          className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-300"
                        >
                          Reactivate
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setHardDeleteTarget(row)}
                          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300"
                        >
                          Permanently delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {impact ? (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/60 px-4"
              role="presentation"
              onClick={isPending ? undefined : () => setImpact(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="handover-title"
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
                onClick={(event) => event.stopPropagation()}
              >
                <h2
                  id="handover-title"
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  {impact.mode === "pm_handover"
                    ? "Safe handover & deactivate"
                    : "Confirm deactivation"}
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {impact.warningMessage}
                </p>
                <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
                  Account: <strong>{impact.name}</strong> ({impact.email}) ·{" "}
                  {getRoleLabel(impact.globalRole)}
                </p>
                <ul className="mt-3 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                  <li>Owned projects: {impact.ownedProjects.length}</li>
                  <li>Assigned tasks: {impact.assignedTaskCount}</li>
                  <li>Issues as PIC: {impact.issuePicCount}</li>
                  <li>Project memberships: {impact.membershipCount}</li>
                </ul>

                {impact.mode === "pm_handover" &&
                impact.ownedProjects.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                      Assign each owned project to a PM
                    </p>
                    {impact.ownedProjects.map((project) => (
                      <label
                        key={project.id}
                        className="block text-xs font-medium text-zinc-600 dark:text-zinc-300"
                      >
                        {project.name}
                        <span className="ml-1 font-normal text-zinc-500">
                          (
                          {project.taskAssignedToTargetCount === 1
                            ? "1 task"
                            : `${project.taskAssignedToTargetCount} tasks`}{" "}
                          assigned to this user)
                        </span>
                        <select
                          value={projectAssignments[project.id] ?? ""}
                          onChange={(event) =>
                            setProjectAssignments((current) => ({
                              ...current,
                              [project.id]: event.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                        >
                          <option value="">Select PM or Super PM…</option>
                          {impact.candidatePms.map((pm) => (
                            <option key={pm.id} value={pm.id}>
                              {pm.name} ({pm.email}) ·{" "}
                              {getRoleLabel(pm.globalRole)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    {impact.candidatePms.length === 0 ? (
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        No other approved PM or Super PM is available to receive
                        ownership. Approve or reactivate a PM first.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {impact.mode === "member" ? (
                  <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                    Their tasks and issue PIC fields will move to each
                    project&apos;s lead PM. Memberships will be removed.
                  </p>
                ) : null}

                {impact.mode === "viewer" ? (
                  <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                    No project or task changes are required for Viewer accounts.
                  </p>
                ) : null}

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setImpact(null)}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isPending || !pmHandoverReady(impact)}
                    onClick={confirmDeactivation}
                    className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                  >
                    Deactivate account
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <ConfirmDialog
            open={reactivateTarget != null}
            title="Reactivate account?"
            message={
              reactivateTarget
                ? `${reactivateTarget.name} will regain an approved session without re-registering. Any leftover memberships or assignments will be cleared first.`
                : ""
            }
            confirmLabel="Reactivate"
            isPending={isPending}
            onCancel={() => setReactivateTarget(null)}
            onConfirm={confirmReactivate}
          />

          <ConfirmDialog
            open={hardDeleteTarget != null}
            title="Permanently delete this account?"
            message={
              hardDeleteTarget
                ? `This cannot be undone. ${hardDeleteTarget.name} (${hardDeleteTarget.email}) will be removed from the database and their Auth identity will be deleted when a service role key is configured. Historical audit stamps will show “Former user”. The account must not own any projects.`
                : ""
            }
            confirmLabel="Delete forever"
            isPending={isPending}
            onCancel={() => setHardDeleteTarget(null)}
            onConfirm={confirmHardDelete}
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={applicantDeleteTarget != null}
        title="Permanently delete this registration?"
        message={
          applicantDeleteTarget
            ? `This cannot be undone. ${applicantDeleteTarget.name} (${applicantDeleteTarget.email}) will be removed from the database and Auth. They can register again later with the same email. This is for pending/rejected applicants only — not for approved accounts in Safe deletion.`
            : ""
        }
        confirmLabel="Delete forever"
        isPending={isPending}
        onCancel={() => setApplicantDeleteTarget(null)}
        onConfirm={confirmDeleteApplicant}
      />

      <ConfirmDialog
        open={passwordResetTarget != null}
        title="Reset password?"
        message={
          passwordResetTarget
            ? `Generate a new temporary password for ${passwordResetTarget.name} (${passwordResetTarget.email})? The previous password will stop working immediately. Share the new password with them securely offline — it is shown once and is not emailed.`
            : ""
        }
        confirmLabel="Generate temporary password"
        isPending={isPending}
        onCancel={() => setPasswordResetTarget(null)}
        onConfirm={confirmPasswordReset}
      />

      {revealedPassword ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/60 px-4 dark:bg-black/70"
          role="presentation"
          onClick={() => setRevealedPassword(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="temp-password-title"
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="temp-password-title"
              className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              Temporary password ready
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Share this password with {revealedPassword.name} (
              {revealedPassword.email}) securely (for example in person or via a
              private channel). It will not be shown again.
            </p>
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Temporary password
              </p>
              <p className="mt-1 break-all font-mono text-sm text-zinc-900 dark:text-zinc-50">
                {revealedPassword.temporaryPassword}
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      revealedPassword.temporaryPassword,
                    );
                    showToast("Temporary password copied.", "success");
                  } catch {
                    showToast(
                      "Unable to copy automatically. Select the password and copy it manually.",
                      "error",
                    );
                  }
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => setRevealedPassword(null)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
