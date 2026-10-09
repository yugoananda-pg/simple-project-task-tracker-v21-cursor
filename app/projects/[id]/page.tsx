import ProjectDetailView from "@/src/components/projects/ProjectDetailView";
import { listHolidayDateKeys } from "@/src/lib/actions/holidays";
import { listIssues } from "@/src/lib/actions/issues";
import { listMilestones } from "@/src/lib/actions/milestones";
import { getProjectById } from "@/src/lib/actions/projects";
import { listTasksByProject } from "@/src/lib/actions/tasks";
import { loadProjectAnalytics } from "@/src/lib/actions/analytics";
import { listCustomAssigneeNames } from "@/src/lib/custom-assignees";
import { hasDashboardScope, portfolioAccessFor } from "@/src/lib/dashboard-access";
import { getSessionUser } from "@/src/lib/rbac";

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { id } = await params;
  const [
    projectResult,
    tasksResult,
    issuesResult,
    milestonesResult,
    sessionUser,
    holidaysResult,
    customAssigneeNames,
    analytics,
  ] = await Promise.all([
    getProjectById(id),
    listTasksByProject(id),
    listIssues(id),
    listMilestones(id),
    getSessionUser(),
    listHolidayDateKeys(),
    listCustomAssigneeNames(),
    loadProjectAnalytics(id),
  ]);

  const loadError =
    !projectResult.success
      ? projectResult.error
      : !tasksResult.success
        ? tasksResult.error
        : !issuesResult.success
          ? issuesResult.error
          : !milestonesResult.success
            ? milestonesResult.error
            : null;

  const ownerId = projectResult.success ? projectResult.data.project.ownerId : null;
  const ownerName =
    projectResult.success && ownerId
      ? (projectResult.data.memberUsers.find((member) => member.id === ownerId)
          ?.name ?? null)
      : null;
  const ownerPortfolioHref =
    ownerId && sessionUser && portfolioAccessFor(sessionUser).pm
      ? `/portfolio?scope=pm&pm=${encodeURIComponent(ownerId)}`
      : null;

  return (
    <ProjectDetailView
      projectId={id}
      ownerName={ownerName}
      ownerPortfolioHref={ownerPortfolioHref}
      initialProject={projectResult.success ? projectResult.data.project : null}
      initialTasks={tasksResult.success ? tasksResult.data : []}
      initialIssues={issuesResult.success ? issuesResult.data : []}
      initialMilestones={
        milestonesResult.success ? milestonesResult.data : []
      }
      holidayDateKeys={holidaysResult.success ? holidaysResult.data : []}
      access={projectResult.success ? projectResult.data.access : "none"}
      canWriteTasks={
        projectResult.success ? projectResult.data.canWriteTasks : false
      }
      canRaiseIssues={
        projectResult.success ? projectResult.data.canRaiseIssues : false
      }
      canManageProject={
        projectResult.success ? projectResult.data.canManage : false
      }
      currentUserId={sessionUser?.id ?? null}
      canReassignOwner={sessionUser?.globalRole === "super_pm"}
      memberUsers={
        projectResult.success ? projectResult.data.memberUsers : []
      }
      customAssigneeNames={customAssigneeNames}
      analytics={analytics}
      canViewProjectAnalytics={
        sessionUser ? hasDashboardScope(sessionUser, "PROJECT") : false
      }
      loadError={loadError}
    />
  );
}
