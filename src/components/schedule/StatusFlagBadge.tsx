"use client";

import {
  STATUS_FLAGS,
  type StatusFlagId,
} from "@/src/lib/analytics/weighted-progress";

type StatusFlagBadgeProps = {
  flag: StatusFlagId;
  className?: string;
};

export default function StatusFlagBadge({
  flag,
  className = "",
}: StatusFlagBadgeProps) {
  const def = STATUS_FLAGS[flag];
  return (
    <span
      className={[
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        def.badgeClassName,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      title={def.label}
    >
      {def.label}
    </span>
  );
}
