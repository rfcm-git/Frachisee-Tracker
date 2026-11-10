/* Issues opened vs resolved over the Dashboard's date range, and the stores with the most open issues. */
import { franchiseeName } from "../../domain/context.js";
import { isIssueOpen, resolvedAt } from "../../domain/issues.js";
import { primaryTerritory } from "../../domain/records.js";
import { addDays, startOfDay, startOfWeek } from "../../lib/format.js";

const DAY = 864e5;

/** Issues of the territory (all when none). */
export function scopedIssues(ctx, territory) {
  if (!territory) return ctx.issues;
  const nums = new Set(ctx.stores.filter((store) => primaryTerritory(store) === territory).map((store) => String(store.num)));
  return ctx.issues.filter((issue) => nums.has(String(issue.store_num || "")));
}

/** Periods covering the range: days (up to 14 days), weeks (up to ~4 months) or months. */
function buckets(range) {
  const days = Math.round((range.end - range.start) / DAY);
  const unit = days <= 14 ? "day" : days <= 125 ? "week" : "month";
  const out = [];
  let from = unit === "week" ? startOfWeek(range.start) : unit === "month" ? new Date(range.start.getFullYear(), range.start.getMonth(), 1) : startOfDay(range.start);
  while (from < range.end) {
    const to = unit === "day" ? addDays(from, 1) : unit === "week" ? addDays(from, 7) : new Date(from.getFullYear(), from.getMonth() + 1, 1);
    // The first and last periods are cut to the range, so nothing outside it is counted.
    out.push({ from: from < range.start ? range.start : from, to: to > range.end ? range.end : to, start: from, unit });
    from = to;
  }
  return out;
}

const fmt = (date, options) => date.toLocaleDateString([], options);

/** Short axis label and full tooltip label of a period. */
function labels(bucket) {
  if (bucket.unit === "day") return { short: fmt(bucket.start, { weekday: "short" }), long: fmt(bucket.start, { weekday: "long", month: "short", day: "numeric" }) };
  if (bucket.unit === "month") return { short: fmt(bucket.start, { month: "short" }), long: fmt(bucket.start, { month: "long", year: "numeric" }) };
  const last = addDays(bucket.to, -1);
  return { short: fmt(bucket.start, { month: "short", day: "numeric" }), long: `Week of ${fmt(bucket.from, { month: "short", day: "numeric" })} – ${fmt(last, { month: "short", day: "numeric" })}` };
}

/**
 * [{ short, long, opened, resolved, backlog }] per period, plus the unit and totals.
 * backlog = issues still open at the end of the period.
 */
export function issueTrend(ctx, territory, range) {
  const issues = scopedIssues(ctx, territory).map((issue) => ({ created: new Date(issue.created_at).getTime(), resolved: resolvedAt(issue)?.getTime() ?? null }));
  const rows = buckets(range).map((bucket) => {
    const from = bucket.from.getTime();
    const to = bucket.to.getTime();
    const opened = issues.filter((issue) => issue.created >= from && issue.created < to).length;
    const resolved = issues.filter((issue) => issue.resolved != null && issue.resolved >= from && issue.resolved < to).length;
    const backlog = issues.filter((issue) => issue.created < to && (issue.resolved == null || issue.resolved >= to)).length;
    return { ...labels(bucket), opened, resolved, backlog };
  });
  return {
    rows, unit: rows.length ? buckets(range)[0].unit : "week",
    opened: rows.reduce((sum, row) => sum + row.opened, 0),
    resolved: rows.reduce((sum, row) => sum + row.resolved, 0),
  };
}

/** The 5 stores with the most open issues: [{ num, store, franchisee, count, oldestDays }]. */
export function topIssueStores(ctx, territory, now = Date.now()) {
  const byStore = new Map();
  scopedIssues(ctx, territory).filter((issue) => isIssueOpen(issue) && issue.store_num).forEach((issue) => {
    const num = String(issue.store_num);
    const entry = byStore.get(num) || { num, count: 0, oldest: Infinity };
    entry.count += 1;
    entry.oldest = Math.min(entry.oldest, new Date(issue.created_at).getTime() || now);
    byStore.set(num, entry);
  });
  return [...byStore.values()].sort((a, b) => b.count - a.count || a.oldest - b.oldest).slice(0, 5).map((entry) => {
    const store = ctx.storeByNum.get(entry.num) || null;
    return { ...entry, store, franchisee: store ? franchiseeName(ctx, store.franchisee_id) : "", oldestDays: Math.max(0, Math.floor((now - entry.oldest) / DAY)) };
  });
}
