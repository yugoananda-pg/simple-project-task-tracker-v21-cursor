export default function PortfolioLoading() {
  return (
    <section className="mx-auto w-full px-4 py-10 sm:px-6 lg:px-8">
      <div className="h-9 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/70"
          />
        ))}
      </div>
      <div className="mt-6 h-72 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/70" />
      <p className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Loading portfolio…
      </p>
    </section>
  );
}
