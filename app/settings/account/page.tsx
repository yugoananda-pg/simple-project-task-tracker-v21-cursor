import { redirect } from "next/navigation";

import AccountSettingsClient from "@/src/components/settings/AccountSettingsClient";
import { getOwnAccount } from "@/src/lib/actions/account";
import { requireApprovedPageUser } from "@/src/lib/rbac";

export default async function SettingsAccountPage() {
  await requireApprovedPageUser();
  const result = await getOwnAccount();
  if (!result.success) {
    redirect("/login");
  }

  return <AccountSettingsClient account={result.data} />;
}
