/* Date-period filters shared by the Concerns tab and the report builder. */
import { PERIODS } from "../config/constants.js";
import { addDays, localDateInput, parseLocalDate, startOfDay } from "./format.js";

/** Periods that need a picked day. */
export const DATE_PICK_PERIODS = ["day", "week", "month"];
/** Periods that show extra inputs. */
export const PERIODS_WITH_INPUT = ["day", "week", "month", "year", "lastdays", "range"];

/** The default settings of a period filter. */
export const defaultPeriod = (days = 7) => ({ period: "all", date: "", days, year: new Date().getFullYear(), from: "", to: "" });

/**
 * Returns [from, to) for a period filter. Either end can be null (open).
 * filter = { period, date, days, year, from, to }
 */
export function periodBounds(filter, now = new Date()) {
  const { period } = filter;
  const picked = DATE_PICK_PERIODS.includes(period);
  const base = picked ? parseLocalDate(filter.date) : now;
  if (picked && !base) return [null, null];
  if (period === "today" || period === "day") {
    const from = startOfDay(base);
    return [from, addDays(from, 1)];
  }
  if (period === "thisweek" || period === "week") {
    const from = startOfDay(base);
    from.setDate(from.getDate() - from.getDay());
    return [from, addDays(from, 7)];
  }
  if (period === "thismonth" || period === "month") {
    return [new Date(base.getFullYear(), base.getMonth(), 1), new Date(base.getFullYear(), base.getMonth() + 1, 1)];
  }
  if (period === "thisyear") return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1)];
  if (period === "year") {
    const year = +filter.year || now.getFullYear();
    return [new Date(year, 0, 1), new Date(year + 1, 0, 1)];
  }
  if (period === "lastdays") {
    const to = addDays(startOfDay(now), 1);
    return [addDays(to, -Math.max(1, +filter.days || 1)), to];
  }
  if (period === "range") {
    const to = parseLocalDate(filter.to);
    return [parseLocalDate(filter.from), to ? addDays(to, 1) : null];
  }
  return [null, null];
}

/** True when the timestamp falls inside the bounds. */
export function inBounds(ts, [from, to]) {
  if (!from && !to) return true;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return false;
  return (!from || date >= from) && (!to || date < to);
}

/** Applies a new period and fills today's date when a day must be picked. */
export function withPeriod(filter, period) {
  const next = { ...filter, period };
  if (DATE_PICK_PERIODS.includes(period) && !next.date) next.date = localDateInput();
  return next;
}

/** Short label used on the Concerns filter button. */
export function periodButtonLabel(filter) {
  const base = (PERIODS.find(([value]) => value === filter.period) || PERIODS[0])[1].replace("…", "");
  if (filter.period === "lastdays") return `Last ${filter.days} days`;
  if (filter.period === "year") return String(filter.year);
  if (filter.period === "range") return !filter.from && !filter.to ? "Choose dates" : `${filter.from || "Start"} → ${filter.to || "Today"}`;
  if (DATE_PICK_PERIODS.includes(filter.period) && filter.date) return `${base.replace("Pick a ", "")} of ${filter.date}`;
  return base;
}

/** Longer label written into report summaries. */
export function periodReportLabel(filter) {
  const labels = { all: "All dates", today: "Today", thisweek: "This week", thismonth: "This month", thisyear: "This year" };
  const { period } = filter;
  if (labels[period]) return labels[period];
  if (period === "lastdays") return `Last ${filter.days} days`;
  if (period === "year") return `Year ${filter.year}`;
  if (period === "day") return `Day: ${filter.date || "not set"}`;
  if (period === "week") return `Week of ${filter.date || "not set"}`;
  if (period === "month") return `Month of ${filter.date || "not set"}`;
  if (period === "range") return `${filter.from || "start"} to ${filter.to || "today"}`;
  return period;
}

/** Years that appear in a list of timestamps, newest first, always including this year. */
export function yearsOf(timestamps) {
  const years = new Set([new Date().getFullYear()]);
  timestamps.forEach((ts) => {
    const date = new Date(ts);
    if (!Number.isNaN(date.getTime())) years.add(date.getFullYear());
  });
  return [...years].sort((a, b) => b - a);
}
