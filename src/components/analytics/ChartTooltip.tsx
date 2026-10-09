"use client";

import type { ReactNode } from "react";

import { formatAuDate } from "@/src/lib/gantt/date-utils";

type TipRow = {
  name?: ReactNode;
  value?: unknown;
  color?: string;
  payload?: { fill?: string; colour?: string };
};

/**
 * Hover card for every analytics chart. The series colour is only the swatch.
 * The words stay near-black on white, so a pale series (Ideal, Target) stays readable.
 */
export function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly TipRow[];
  label?: ReactNode;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((row) => row && row.value != null);
  if (rows.length === 0) return null;

  const labelText = label == null ? "" : String(label);
  const names = rows.map((row) => (row.name == null ? "" : String(row.name)));
  const showLabel =
    labelText !== "" && !names.every((name) => name === labelText);

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        border: "1px solid #d4d4d8",
        borderRadius: 8,
        padding: "8px 10px",
        boxShadow: "0 8px 20px rgba(24, 24, 27, 0.14)",
        color: "#18181b",
      }}
    >
      {showLabel ? (
        <p
          style={{
            margin: "0 0 6px",
            fontWeight: 650,
            color: "#18181b",
            fontSize: 12,
            lineHeight: "16px",
          }}
        >
          {labelText}
        </p>
      ) : null}
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {rows.map((row, index) => {
          const name = row.name == null ? "" : String(row.name);
          const swatch =
            row.color || row.payload?.fill || row.payload?.colour || "#18181b";
          return (
            <li
              key={`${name}-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: index === 0 ? 0 : 4,
                color: "#18181b",
                fontSize: 12,
                lineHeight: "18px",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: swatch,
                  flex: "0 0 auto",
                }}
              />
              <span style={{ color: "#3f3f46" }}>{name}</span>
              <span
                style={{
                  marginLeft: "auto",
                  paddingLeft: 12,
                  fontWeight: 650,
                  color: "#18181b",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatTipValue(row.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function chartTooltip(formatLabel?: (label: unknown) => string) {
  return function TooltipBody(props: {
    active?: boolean;
    payload?: readonly TipRow[];
    label?: unknown;
  }) {
    const label =
      formatLabel && props.label != null
        ? formatLabel(props.label)
        : props.label;
    return (
      <ChartTooltipContent
        active={props.active}
        payload={props.payload}
        label={label == null ? undefined : String(label)}
      />
    );
  };
}

function formatTipValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  if (Array.isArray(value)) return value.map(String).join(" – ");
  return value == null ? "" : String(value);
}

/** Built once, so a chart re-render does not mount a fresh tooltip component. */
export const dateChartTooltip = chartTooltip((value) =>
  formatAuDate(String(value)),
);
export const plainChartTooltip = chartTooltip();
