import { redirect } from "next/navigation";

import PortfolioShell from "@/src/components/portfolio/PortfolioShell";
import { getPortfolioSummary } from "@/src/lib/actions/portfolio";
import { canOpenPortfolio } from "@/src/lib/dashboard-access";
import { requireApprovedPageUser } from "@/src/lib/rbac";

type PortfolioPageProps = {
  searchParams: Promise<{
    scope?: string | string[];
    pm?: string | string[];
    completed?: string | string[];
  }>;
};

function first(value: string | string[] | undefined): string | null {
  const picked = Array.isArray(value) ? value[0] : value;
  return picked?.trim() ? picked.trim() : null;
}

export default async function PortfolioPage({
  searchParams,
}: PortfolioPageProps) {
  const user = await requireApprovedPageUser();
  // The tick is the gate. A Viewer on All Active still needs it.
  if (!canOpenPortfolio(user)) {
    redirect("/");
  }

  const params = await searchParams;
  const result = await getPortfolioSummary({
    scope: first(params.scope),
    pmId: first(params.pm),
    includeCompleted: first(params.completed) === "1",
  });

  if (!result.success) {
    if (result.code === "FORBIDDEN" || result.code === "UNAUTHORISED") {
      redirect("/");
    }
    return (
      <section className="mx-auto w-full px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Portfolio
        </h1>
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200"
        >
          {result.error}
        </p>
      </section>
    );
  }

  return <PortfolioShell dto={result.data} exportedBy={user.name} />;
}
