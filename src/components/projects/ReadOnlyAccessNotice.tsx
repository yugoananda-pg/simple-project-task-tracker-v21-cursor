type ReadOnlyAccessNoticeProps = {
  compact?: boolean;
  className?: string;
  includeAnalytics?: boolean;
};

export default function ReadOnlyAccessNotice({
  compact = false,
  className = "",
  includeAnalytics = false,
}: ReadOnlyAccessNoticeProps) {
  return (
    <div
      role="status"
      className={[
        "rounded-lg border border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-300",
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
        className,
      ].join(" ")}
    >
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">
        Read-only access
      </p>
      <p className={compact ? "mt-1 leading-relaxed" : "mt-1.5 leading-relaxed"}>
        {includeAnalytics
          ? "You can browse tasks, timelines, and analytics. "
          : "You can browse tasks and timelines. "}
        Creating tasks and editing the project are limited to the owning PM or
        Super PM. If a task is assigned to you, you can still update that task
        (and comment on it).
      </p>
    </div>
  );
}
