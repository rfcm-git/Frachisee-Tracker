/* Dashboard date range: the period the trends cover, and the period before it they are compared with. */
import { addDays, parseLocalDate, startOfDay } from "../../lib/format.js";

export const RANGE_PRESETS = [
  ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"], ["month", "This month"], ["year", "This year"], ["custom", "Custom range"],
];

const DAY = 864e5;

/**
 * { start, end, prevStart, prevEnd, days, label, prevLabel } — Dates; end and prevEnd are exclusive.
 * The previous period has the same length and ends where this one starts (same days of last month / year for those presets).
 */
export function rangeBounds(range, now = new Date()) {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const presetDays = { "7d": 7, "30d": 30, "90d": 90 }[range.preset];
  if (presetDays) {
    const start = addDays(today, -(presetDays - 1));
    return { start, end: tomorrow, prevStart: addDays(start, -presetDays), prevEnd: start, days: presetDays, label: `Last ${presetDays} days`, prevLabel: `previous ${presetDays} days` };
  }
  if (range.preset === "month" || range.preset === "year") {
    const month = range.preset === "month";
    const start = month ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(today.getFullYear(), 0, 1);
    const prevStart = month ? new Date(today.getFullYear(), today.getMonth() - 1, 1) : new Date(today.getFullYear() - 1, 0, 1);
    const span = tomorrow - start;
    return { start, end: tomorrow, prevStart, prevEnd: new Date(prevStart.getTime() + span), days: Math.round(span / DAY),
      label: month ? "This month" : "This year", prevLabel: month ? "same days last month" : "same days last year" };
  }
  // Custom: from / to inclusive; falls back to the last 30 days until both are picked.
  const from = parseLocalDate(range.from);
  const to = parseLocalDate(range.to);
  if (!from || !to || to < from) return rangeBounds({ preset: "30d" }, now);
  const end = addDays(to, 1);
  const span = end - from;
  const fmt = (date) => date.toLocaleDateString([], { month: "short", day: "numeric" });
  return { start: from, end, prevStart: new Date(from.getTime() - span), prevEnd: from, days: Math.round(span / DAY),
    label: `${fmt(from)} – ${fmt(to)}`, prevLabel: `previous ${Math.round(span / DAY)} days` };
}

/** True when a timestamp falls in [from, to). */
export const within = (ts, from, to) => {
  const time = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
  return Number.isFinite(time) && time >= from.getTime() && time < to.getTime();
};
