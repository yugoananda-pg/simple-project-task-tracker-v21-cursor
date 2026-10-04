/** Shared notification count pill for Super PM pending-approval cues. */

type NotificationBadgeProps = {
  count: number;
  /** Visual tone for header (dark) vs settings (light) surfaces. */
  tone?: "onDark" | "onLight";
  className?: string;
};

export default function NotificationBadge({
  count,
  tone = "onLight",
  className = "",
}: NotificationBadgeProps) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <span
      className={[
        "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums",
        tone === "onDark"
          ? "bg-amber-400 text-amber-950"
          : "bg-amber-500 text-white",
        className,
      ].join(" ")}
      aria-label={`${count} pending approval${count === 1 ? "" : "s"}`}
    >
      {label}
    </span>
  );
}
