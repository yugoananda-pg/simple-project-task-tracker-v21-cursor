import ProjectTasksSkeleton from "@/src/components/projects/ProjectTasksSkeleton";

export default function ProjectDetailLoading() {
  return (
    <section className="mx-auto w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-4 space-y-3">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="relative mt-8 min-h-[28rem]">
        <ProjectTasksSkeleton label="Loading project tasks…" />
      </div>
    </section>
  );
}
