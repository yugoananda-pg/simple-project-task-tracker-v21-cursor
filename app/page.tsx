import { redirect } from "next/navigation";

import HomePageClient from "@/src/components/projects/HomePageClient";
import {
  listBrowsableProjectOwners,
  listProjects,
} from "@/src/lib/actions/projects";
import {
  canAccessCompletedWorkspace,
  canBrowsePeerPmPortfolios,
  canCreateProject,
  getSessionUser,
} from "@/src/lib/rbac";

type HomePageProps = {
  searchParams: Promise<{ owner?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const user = await getSessionUser();
  const params = await searchParams;
  const ownerParam = params.owner?.trim() || null;

  if (!user) {
    return (
      <HomePageClient
        initialProjects={[]}
        canCreateProject={false}
        canViewCompleted={false}
        isSignedIn={false}
      />
    );
  }

  if (user.approvalStatus !== "APPROVED") {
    redirect("/pending-approval");
  }

  const canBrowse = canBrowsePeerPmPortfolios(user);
  const effectiveBrowseOwnerId =
    canBrowse && ownerParam ? ownerParam : null;

  const [result, ownersResult] = await Promise.all([
    listProjects(
      effectiveBrowseOwnerId
        ? { browseOwnerId: effectiveBrowseOwnerId }
        : {},
    ),
    canBrowse ? listBrowsableProjectOwners() : Promise.resolve(null),
  ]);

  const projects = result.success ? result.data : [];
  const loadError = result.success ? null : result.error;
  const browsableOwners = ownersResult?.success ? ownersResult.data : [];

  return (
    <HomePageClient
      initialProjects={projects}
      canCreateProject={canCreateProject(user)}
      canViewCompleted={canAccessCompletedWorkspace(user)}
      isSignedIn
      loadError={loadError}
      canBrowsePeerPortfolios={canBrowse}
      browsableOwners={browsableOwners}
      browseOwnerId={effectiveBrowseOwnerId}
      currentUserId={user.id}
    />
  );
}
