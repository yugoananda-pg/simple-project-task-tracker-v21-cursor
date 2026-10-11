/**
 * Wording and colour rules for the executive report. Figures come from the
 * analytics engines. This file only decides how they read and what colour
 * they take.
 */

import type { MilestoneState } from "@/src/lib/analytics/portfolio";
import {
  formatPercent1,
  STATUS_FLAGS,
  type StatusFlagId,
} from "@/src/lib/analytics/weighted-progress";
import { THEME } from "@/src/lib/export/slide-kit";

export type Tone = { fill: string; ink: string; bar: string };

export const TONES = {
  sky: { fill: THEME.skySoft, ink: "#075985", bar: THEME.sky },
  amber: { fill: THEME.amberSoft, ink: "#92400e", bar: THEME.amberBar },
  rose: { fill: THEME.roseSoft, ink: "#9f1239", bar: THEME.roseBar },
  emerald: { fill: THEME.emeraldSoft, ink: "#065f46", bar: THEME.emerald },
  teal: { fill: THEME.tealSoft, ink: "#115e59", bar: "#0d9488" },
  indigo: { fill: THEME.indigoSoft, ink: "#3730a3", bar: "#4f46e5" },
  zinc: { fill: THEME.zincSoft, ink: "#3f3f46", bar: THEME.zinc },
} as const satisfies Record<string, Tone>;

const FLAG_TONE: Record<StatusFlagId, Tone> = {
  "SF-01": TONES.sky,
  "SF-02": TONES.amber,
  "SF-03": TONES.rose,
  "SF-04": TONES.emerald,
  "SF-05": TONES.amber,
  "SF-06": TONES.rose,
  "SF-07": TONES.teal,
  "SF-08": TONES.indigo,
  "SF-09": TONES.zinc,
  "SF-10": TONES.amber,
  "SF-11": TONES.rose,
};

export function flagTone(flag: StatusFlagId): Tone {
  return FLAG_TONE[flag];
}

export function flagLabel(flag: StatusFlagId): string {
  return STATUS_FLAGS[flag].label;
}

/** Score colour on the stored 0 to 100 scale. Same bands as the app gauge. */
export function scoreTone(ps: number): Tone {
  if (ps >= 105) return TONES.indigo;
  if (ps >= 95) return TONES.emerald;
  if (ps >= 85) return TONES.amber;
  return TONES.rose;
}

const MILESTONE_TONE: Record<MilestoneState, Tone> = {
  early: TONES.emerald,
  ontime: TONES.emerald,
  late: TONES.amber,
  overdue: TONES.rose,
  upcoming: TONES.sky,
};

export function milestoneTone(state: MilestoneState): Tone {
  return MILESTONE_TONE[state];
}

export const MILESTONE_STATE_LABEL: Record<MilestoneState, string> = {
  early: "Achieved early",
  ontime: "On target",
  late: "Achieved late",
  overdue: "Past target",
  upcoming: "Upcoming",
};

export function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

/** "12.3 points behind" style reading of actual minus target. */
export function gapPhrase(delta: number): { text: string; tone: Tone } {
  const rounded = Math.round(Math.abs(delta) * 10) / 10;
  if (rounded === 0) return { text: "right on target", tone: TONES.emerald };
  const text = `${rounded.toFixed(1)} points ${delta < 0 ? "behind" : "ahead of"} target`;
  return { text, tone: delta < 0 ? (rounded >= 15 ? TONES.rose : TONES.amber) : TONES.emerald };
}

export function percent(value: number): string {
  return formatPercent1(value);
}

/** 10/10/2026 style date from yyyy-mm-dd. */
export function auDate(value: string | null | undefined): string {
  if (!value) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "-";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "10/10/2026 3:41 pm" in the exporter's own time zone. */
export function auDateTime(value: Date): string {
  return `${DATE_FMT.format(value)} ${TIME_FMT.format(value).toLowerCase()}`;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "10 Oct 2026" for chart axes. */
export function axisDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "";
  return `${Number(match[3])} ${SHORT_MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

/** A name safe to put in a file name on any system. */
export function fileSafe(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 _.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  return cleaned || "Report";
}
