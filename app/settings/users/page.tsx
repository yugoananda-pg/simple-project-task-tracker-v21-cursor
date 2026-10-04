import { redirect } from "next/navigation";

import UserGovernanceClient from "@/src/components/settings/UserGovernanceClient";
import { listManagedUsers } from "@/src/lib/actions/users";
import { requireApprovedPageUser } from "@/src/lib/rbac";

export default async function SettingsUsersPage() {
  const user = await requireApprovedPageUser();
  if (user.globalRole !== "super_pm") {
    redirect("/");
  }

  const result = await listManagedUsers();
  const users = result.success ? result.data : [];

  return (
    <UserGovernanceClient
      initialUsers={users}
      currentUserId={user.id}
    />
  );
}
