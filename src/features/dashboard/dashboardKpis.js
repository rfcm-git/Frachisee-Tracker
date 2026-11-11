/*
 * The Dashboard's four KPI cards, for one territory (or all) and a date range:
 * open issues, 3PD coverage, onboarding progress and CAP status — each with a trend against the previous period.
 */
import { capHistory } from "../../domain/caps.js";
import { corePercent, coverageCounts, snapshotCounts, snapshotOn } from "../../domain/coverage.js";
import { isIssueOpen, resolvedAt } from "../../domain/issues.js";
import { obHistory, obIsOpen, obOnTab } from "../../domain/onboarding.js";
import { normalizeWmStage, wmHistory } from "../../domain/walmart.js";
import { primaryTerritory } from "../../domain/records.js";
import { capsProgress } from "../caps/capsSelectors.js";
import { ezRecords } from "../ezcater/ezcaterSelectors.js";
import { within } from "./dashboardRange.js";

/** Store numbers in the territory (null = every store). */
function storeNumbers(ctx, territory) {
  if (!territory) return null;
  return new Set(ctx.stores.filter((store) => primaryTerritory(store) === territory).map((store) => String(store.num)));
}
const inScope = (nums, num) => !nums || nums.has(String(num ?? ""));

/**
 * Change between two numbers: { delta, text, tone, icon }.
 * goodWhenUp: an increase is good (green) or bad (red); no change is neutral.
 * kind "pct" = relative change (+25%), "pts" = percentage points (+3.1 pts), "count" = plain difference (+4).
 */
export function trendOf(current, previous, { goodWhenUp = true, kind = "pct" } = {}) {
  if (previous == null) return null;
  const delta = current - previous;
  let text;
  if (kind === "pts") text = `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pts`;
  else if (kind === "count") text = `${delta > 0 ? "+" : ""}${delta}`;
  else if (!previous) text = `${delta > 0 ? "+" : ""}${delta}`;
  else text = `${delta > 0 ? "+" : ""}${Math.round((delta / previous) * 100)}%`;
  const flat = kind === "pts" ? Math.abs(delta) < 0.05 : delta === 0;
  return { delta, text: flat ? (kind === "pts" ? "0.0 pts" : "no change") : text, tone: flat ? "flat" : (delta > 0) === goodWhenUp ? "good" : "bad", icon: flat ? "minus" : delta > 0 ? "trending-up" : "trending-down" };
}

/** Open issues now; trend = issues opened this period vs the one before (fewer is better). */
function issuesKpi(ctx, nums, range) {
  const issues = ctx.issues.filter((issue) => inScope(nums, issue.store_num));
  const open = issues.filter(isIssueOpen);
  const opened = (from, to) => issues.filter((issue) => within(issue.created_at, from, to)).length;
  const resolved = issues.filter((issue) => { const at = resolvedAt(issue); return at && within(at, range.start, range.end); }).length;
  const now = opened(range.start, range.end);
  const before = opened(range.prevStart, range.prevEnd);
  const stores = new Set(open.map((issue) => String(issue.store_num || ""))).size;
  return {
    key: "issues", label: "Open issues", value: open.length.toLocaleString(),
    sub: `${stores.toLocaleString()} store${stores !== 1 ? "s" : ""} affected · ${now} opened, ${resolved} resolved`,
    trend: trendOf(now, before, { goodWhenUp: false }), trendLabel: "issues opened",
    tip: "Issues that are Pending or Work in Progress. The trend compares how many were opened in this period with the period before.",
  };
}

/** Average 3PD coverage of open stores; trend from the daily snapshot at the start of the period. */
function coverageKpi(ctx, nums, range, territory) {
  const stores = nums ? ctx.stores.filter((store) => nums.has(String(store.num))) : ctx.stores;
  const counts = coverageCounts(stores);
  const value = corePercent(counts);
  const share = (key) => (counts.open ? Math.round((counts[key] / counts.open) * 100) : 0);
  const past = snapshotCounts(snapshotOn(ctx.snapshots, range.start), territory);
  return {
    key: "coverage", label: "3PD coverage", value: `${value.toFixed(1)}%`,
    // Non-breaking spaces keep each "Grubhub 2%" together when the line wraps.
    sub: `Uber\u00a0Eats\u00a0${share("ue")}% · DoorDash\u00a0${share("dd")}% · Grubhub\u00a0${share("gh")}%`,
    trend: past ? trendOf(value, corePercent(past), { kind: "pts" }) : null,
    noTrend: ctx.snapshotsReady ? "Trend starts as daily history builds up" : "Run migrate-coverage-snapshots.sql for trends",
    tip: `Onboarded Uber Eats, DoorDash and Grubhub slots across ${counts.open.toLocaleString()} open stores (${counts.all3.toLocaleString()} on all three).`,
  };
}

/** Onboarded share across 3PDs, ezCater and Walmart; trend = stores onboarded this period vs the one before. */
function onboardingKpi(ctx, nums, range) {
  const threePd = ctx.onboarding.filter((record) => obOnTab(record) && inScope(nums, record.store_num));
  const ez = ezRecords(ctx).filter((record) => inScope(nums, record.store_num));
  const wm = ctx.walmart.filter((record) => inScope(nums, record.store_num));
  const parts = [
    { key: "onboarding", label: "3PDs", done: threePd.filter((record) => record.status === "Onboarded").length, total: threePd.length, open: threePd.filter(obIsOpen).length },
    { key: "ezcater", label: "ezCater", done: ez.filter((record) => record.status === "Onboarded").length, total: ez.length, open: ez.filter(obIsOpen).length },
    { key: "walmart", label: "Walmart", done: wm.filter((record) => normalizeWmStage(record.stage) === "Account Created").length, total: wm.length,
      open: wm.filter((record) => ["Awaiting App", "Payment Setup"].includes(normalizeWmStage(record.stage))).length },
  ].map((part) => ({ ...part, percent: part.total ? Math.round((part.done / part.total) * 100) : 0 }));
  const done = parts.reduce((sum, part) => sum + part.done, 0);
  const total = parts.reduce((sum, part) => sum + part.total, 0);

  // Moves to Onboarded (Account Created for Walmart) logged in a period.
  const onboarded = (from, to) => {
    let count = 0;
    [...threePd, ...ez].forEach((record) => obHistory(record).forEach((entry) => {
      if (entry.status === "Onboarded" && (entry.kind === "created" || entry.prev !== "Onboarded") && within(entry.ts, from, to)) count += 1;
    }));
    wm.forEach((record) => wmHistory(record).forEach((entry) => {
      const reached = entry.kind === "created" ? entry.stage === "Account Created" : entry.to === "Account Created";
      if (reached && within(entry.ts, from, to)) count += 1;
    }));
    return count;
  };
  const now = onboarded(range.start, range.end);
  return {
    key: "onboarding", label: "Onboarding", value: `${total ? Math.round((done / total) * 100) : 0}%`, parts,
    sub: `${done.toLocaleString()} of ${total.toLocaleString()} onboarded · ${now} this period`,
    trend: trendOf(now, onboarded(range.prevStart, range.prevEnd), { kind: "count" }), trendLabel: "stores onboarded",
    tip: "Onboarded records on the 3PDs, ezCater and Walmart tabs (Account Created for Walmart). The trend compares how many were onboarded in this period with the period before.",
  };
}

/** CAP % completed with overdue / due soon; trend = CAPs completed this period vs the one before. */
function capKpi(ctx, nums, range, territory) {
  const summary = capsProgress(ctx, territory);
  const caps = ctx.caps.filter((record) => inScope(nums, record.store_num));
  const completed = (from, to) => caps.reduce((count, record) => count + capHistory(record).filter((entry) => within(entry.ts, from, to)
    && (entry.changes || []).some((change) => change.field === "status" && change.to === "Completed")).length, 0);
  return {
    key: "caps", label: "CAP", value: `${summary.percent}%`, valueNote: "completed", summary,
    trend: trendOf(completed(range.start, range.end), completed(range.prevStart, range.prevEnd), { kind: "count" }), trendLabel: "CAPs completed",
    tip: "Share of stores in the CAP list whose CAP is Completed. The trend compares how many were completed in this period with the period before.",
  };
}

export function buildKpis(ctx, territory, range) {
  const nums = storeNumbers(ctx, territory);
  return [
    issuesKpi(ctx, nums, range),
    coverageKpi(ctx, nums, range, territory),
    onboardingKpi(ctx, nums, range),
    ...(ctx.capsReady ? [capKpi(ctx, nums, range, territory)] : []),
  ];
}
