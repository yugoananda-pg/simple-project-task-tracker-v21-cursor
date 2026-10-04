import { redirect } from "next/navigation";

import DeletedProjectsClient from "@/src/components/settings/DeletedProjectsClient";
import { listDeletedProjects } from "@/src/lib/actions/project-lifecycle";
import { requireApprovedPageUser } from "@/src/lib/rbac";

export default async function DeletedProjectsPage() {
  const user = await requireApprovedPageUser();
  if (user.globalRole !== "super_pm") {
    redirect("/");
  }

  const result = await listDeletedProjects();

  return (
    <DeletedProjectsClient
      initialProjects={result.success ? result.data : []}
    />
  );
}
