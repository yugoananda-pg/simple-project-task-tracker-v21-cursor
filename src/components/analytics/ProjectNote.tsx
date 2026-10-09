"use client";

import ReportNote from "@/src/components/analytics/ReportNote";
import { saveProjectAnalyticsNote } from "@/src/lib/actions/analytics";

export default function ProjectNote({
  projectId,
  html,
  updatedAt,
  updatedByName,
  canEdit,
  className = "",
}: {
  className?: string;
  projectId: string;
  html: string;
  updatedAt: string | null;
  updatedByName: string | null;
  canEdit: boolean;
}) {
  return (
    <ReportNote
      className={className}
      title="Project note"
      emptyText="No commentary has been written for this project."
      editHint="This is the commentary printed with the report. The page shows the saved text only."
      html={html}
      updatedAt={updatedAt}
      updatedByName={updatedByName}
      canEdit={canEdit}
      save={(next) => saveProjectAnalyticsNote(projectId, next)}
    />
  );
}
