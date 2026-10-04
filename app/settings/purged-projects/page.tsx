import { redirect } from "next/navigation";

import PurgedProjectsClient from "@/src/components/settings/PurgedProjectsClient";
import { listPurgedProjects } from "@/src/lib/actions/project-lifecycle";
import { requireApprovedPageUser } from "@/src/lib/rbac";

export default async function PurgedProjectsPage() {
  const user = await requireApprovedPageUser();
  if (user.globalRole !== "super_pm") {
    redirect("/");
  }

  const result = await listPurgedProjects();

  return (
    <PurgedProjectsClient initialRows={result.success ? result.data : []} />
  );
}
