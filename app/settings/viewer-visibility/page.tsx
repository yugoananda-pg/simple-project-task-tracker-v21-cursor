import { redirect } from "next/navigation";

import ViewerVisibilityClient from "@/src/components/settings/ViewerVisibilityClient";
import { listViewerVisibilityDirectory } from "@/src/lib/actions/viewer-visibility";
import { requireApprovedPageUser } from "@/src/lib/rbac";

export default async function ViewerVisibilitySettingsPage() {
  const user = await requireApprovedPageUser();
  if (user.globalRole !== "super_pm") {
    redirect("/");
  }

  const result = await listViewerVisibilityDirectory();
  const viewers = result.success ? result.data : [];

  return <ViewerVisibilityClient initialViewers={viewers} />;
}
