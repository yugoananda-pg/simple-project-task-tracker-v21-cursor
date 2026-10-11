"use client";

/**
 * Small pill-style switch used in view toolbars (grouping, scale, density).
 * Each option is a `tab` in a `tablist`, so keyboard and screen reader users get
 * the same behaviour as the project view switcher.
 */
export default function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className = "",
}: {
  label: string;
  options: ReadonlyArray<{ id: T; label: string; title?: string }>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-900 ${className}`}
    >
      {options.map((option) => {
        const isActive = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={option.title}
            onClick={() => onChange(option.id)}
            className={[
              "rounded-md px-3 py-1.5 text-xs font-semibold transition",
              isActive
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
