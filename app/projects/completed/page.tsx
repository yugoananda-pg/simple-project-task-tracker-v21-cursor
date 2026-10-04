import { redirect } from "next/navigation";

import CompletedProjectsClient from "@/src/components/projects/CompletedProjectsClient";
import { listCompletedProjects } from "@/src/lib/actions/project-lifecycle";
import {
  canAccessCompletedWorkspace,
  requireApprovedPageUser,
} from "@/src/lib/rbac";

export default async function CompletedProjectsPage() {
  const user = await requireApprovedPageUser();
  if (!canAccessCompletedWorkspace(user)) {
    redirect("/");
  }

  const result = await listCompletedProjects();
  const projects = result.success ? result.data : [];

  return (
    <CompletedProjectsClient
      initialProjects={projects}
      currentUserId={user.id}
      isSuperPm={user.globalRole === "super_pm"}
    />
  );
}
