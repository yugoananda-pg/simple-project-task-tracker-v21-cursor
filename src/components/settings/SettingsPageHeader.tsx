import Link from "next/link";

type SettingsPageHeaderProps = {
  title: string;
  description?: string;
  /** Current page label in the breadcrumb (not a link). */
  current: string;
  /** Optional actions aligned to the right of the title block. */
  actions?: React.ReactNode;
};

/**
 * Consistent Settings hierarchy chrome.
 * Location breadcrumbs (parent → current) outperform floating “← Back” links for
 * nested admin pages: they answer “where am I?” and make the parent a clear
 * return target (Nielsen Norman / Material / common SaaS dashboards).
 */
export default function SettingsPageHeader({
  title,
  description,
  current,
  actions,
}: SettingsPageHeaderProps) {
  return (
    <div className="mb-6">
      <nav aria-label="Breadcrumb" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link
              href="/settings"
              className="transition hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
            >
              Settings
            </Link>
          </li>
          <li aria-hidden className="text-zinc-400 dark:text-zinc-600">
            /
          </li>
          <li className="text-zinc-700 dark:text-zinc-300" aria-current="page">
            {current}
          </li>
        </ol>
      </nav>

      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 w-full text-sm text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}
