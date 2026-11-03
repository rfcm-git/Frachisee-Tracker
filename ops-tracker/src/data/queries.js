// View models built from a dataset. Pure functions: both the mock source and
// the Supabase source load a dataset of the same shape and call these.

import { PLATFORMS, OPEN_STATUSES, SEVERITY_BY_ID, DEFAULT_THRESHOLDS } from "../lib/constants.js";
import { addDays } from "../lib/dates.js";
import {
  sumRows, groupBy, derive, inRange, windows, dailyByPlatform, dailyDerived, storeHealth, bucket,
} from "../lib/metrics.js";

const LEVEL_RANK = { critical: 0, watch: 1, good: 2 };

export function thresholdsFor(ds, platformId) {
  return ds.platformSettings.find((p) => p.id === platformId)?.thresholds ?? DEFAULT_THRESHOLDS;
}

function enabledPlatformIds(ds) {
  return new Set(ds.platformSettings.filter((p) => p.enabled).map((p) => p.id));
}

function filterRows(ds, { platform = "all", franchisee = "all", storeIds } = {}) {
  const enabled = enabledPlatformIds(ds);
  const allowedStores = storeIds
    ? new Set(storeIds)
    : franchisee === "all" ? null : new Set(ds.stores.filter((s) => s.franchisee === franchisee).map((s) => s.id));
  return ds.metrics.filter(
    (r) => enabled.has(r.platformId) && (platform === "all" || r.platformId === platform) && (!allowedStores || allowedStores.has(r.storeId)),
  );
}

/** Health per store: worst level across its platforms, each judged by that platform's thresholds. */
export function healthByStore(ds, rows, days = 1) {
  const per = groupBy(rows, (r) => `${r.storeId}|${r.platformId}`);
  const out = new Map();
  for (const [key, totals] of per) {
    const [storeId, platformId] = key.split("|");
    const h = storeHealth(derive(totals), thresholdsFor(ds, platformId), days);
    const cur = out.get(storeId) ?? { level: "good", breaches: [] };
    if (LEVEL_RANK[h.level] < LEVEL_RANK[cur.level]) cur.level = h.level;
    for (const b of h.breaches) cur.breaches.push({ metric: b, platformId });
    out.set(storeId, cur);
  }
  return out;
}

export function sortIssues(list) {
  return [...list].sort(
    (a, b) => SEVERITY_BY_ID[a.severity].rank - SEVERITY_BY_ID[b.severity].rank || b.createdAt.localeCompare(a.createdAt),
  );
}

export function dashboardModel(ds, { range = 7, platform = "all", franchisee = "all", now = new Date() } = {}) {
  const end = addDays(ds.today, -1); // complete days only; today is in the live strip
  const w = windows(end, range);
  const rows = filterRows(ds, { platform, franchisee });
  const cur = inRange(rows, w.start, w.end);
  const prev = inRange(rows, w.prevStart, w.prevEnd);
  const c = sumRows(cur);
  const p = sumRows(prev);

  const storeIds = new Set(ds.stores.filter((s) => franchisee === "all" || s.franchisee === franchisee).map((s) => s.id));
  const spark = (metric) => bucket(dailyDerived(cur, end, range, metric).map((d) => d.value), 12);
  const enabled = enabledPlatformIds(ds);

  const issuesInScope = ds.issues.filter(
    (i) => storeIds.has(i.storeId) && (platform === "all" || i.platformId === platform),
  );
  const openIssues = issuesInScope.filter((i) => OPEN_STATUSES.includes(i.status));
  const openedInWindow = issuesInScope.filter((i) => i.createdAt.slice(0, 10) >= w.start).length;
  const openedPrevWindow = issuesInScope.filter((i) => i.createdAt.slice(0, 10) >= w.prevStart && i.createdAt.slice(0, 10) <= w.prevEnd).length;

  const kpis = [
    { key: "orders", label: "Orders", value: c.orders, prev: p.orders, spark: spark("orders"), format: "compact", goodWhen: "up" },
    { key: "sales", label: "Net sales", value: c.sales, prev: p.sales, spark: spark("sales"), format: "money", goodWhen: "up" },
    { key: "errorRate", label: "Order error rate", value: c.errorRate, prev: p.errorRate, spark: spark("errorRate"), format: "pct", goodWhen: "down" },
    { key: "rating", label: "Avg. rating", value: c.rating, prev: p.rating, spark: spark("rating"), format: "rating", goodWhen: "up" },
    { key: "downtime", label: "Store downtime", value: c.downtimeMin, prev: p.downtimeMin, spark: spark("downtimeMin"), format: "hours", goodWhen: "down" },
    { key: "issues", label: "Issues flagged", value: openedInWindow, prev: openedPrevWindow, spark: null, format: "int", goodWhen: "down", note: `${openIssues.length} open now` },
  ];

  // Today so far + live store status
  const todayRows = filterRows({ ...ds, metrics: ds.todayMetrics ?? [] }, { platform, franchisee });
  const today = sumRows(todayRows);
  const conns = ds.connections.filter((x) => storeIds.has(x.storeId) && enabled.has(x.platformId) && (platform === "all" || x.platformId === platform));
  const liveStatus = { online: 0, paused: 0, offline: 0 };
  for (const x of conns) if (x.status in liveStatus) liveStatus[x.status]++;
  const settings = ds.platformSettings.filter((s) => s.enabled);
  const lastSync = settings.map((s) => s.lastSync).sort()[0] ?? null;

  // Platform comparison
  const byPlatform = groupBy(cur, (r) => r.platformId);
  const byPlatformPrev = groupBy(prev, (r) => r.platformId);
  const platforms = PLATFORMS.filter((pl) => enabled.has(pl.id) && (platform === "all" || pl.id === platform)).map((pl) => {
    const m = byPlatform.get(pl.id) ? derive(byPlatform.get(pl.id)) : derive({ orders: 0, sales: 0, errorOrders: 0, cancellations: 0, ratingSum: 0, ratingCount: 0, downtimeMin: 0, prepMinSum: 0 });
    const mp = byPlatformPrev.get(pl.id) ? derive(byPlatformPrev.get(pl.id)) : null;
    const pc = conns.filter((x) => x.platformId === pl.id);
    return {
      ...pl,
      ...m,
      prevOrders: mp?.orders ?? null,
      share: c.orders ? m.orders / c.orders : 0,
      thresholds: thresholdsFor(ds, pl.id),
      notOnline: pc.filter((x) => x.status === "paused" || x.status === "offline").length,
      connection: ds.platformSettings.find((s) => s.id === pl.id)?.connection,
    };
  });

  // Watchlist: stores breaching thresholds, worst first
  const health = healthByStore(ds, cur, range);
  const perStore = groupBy(cur, (r) => r.storeId);
  const watchlist = ds.stores
    .filter((s) => storeIds.has(s.id) && health.get(s.id) && health.get(s.id).level !== "good")
    .map((s) => ({ store: s, health: health.get(s.id), m: derive(perStore.get(s.id)), openIssues: openIssues.filter((i) => i.storeId === s.id).length }))
    .sort((a, b) => LEVEL_RANK[a.health.level] - LEVEL_RANK[b.health.level] || b.m.errorRate - a.m.errorRate);

  const byCategory = {};
  for (const i of openIssues) byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;

  return {
    range,
    window: w,
    kpis,
    trend: dailyByPlatform(cur, end, range, "orders"),
    errorTrend: dailyDerived(cur, end, range, "errorRate"),
    platforms,
    watchlist,
    storesInScope: storeIds.size,
    issueCategories: Object.entries(byCategory).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    recentIssues: sortIssues(openIssues).slice(0, 6),
    openIssueCount: openIssues.length,
    criticalOpen: openIssues.filter((i) => i.severity === "critical").length,
    live: { today, liveStatus, lastSync, now: now.toISOString() },
  };
}

export function storesModel(ds, { search = "", franchisee = "all", region = "all", health = "all", range = 7 } = {}) {
  const end = addDays(ds.today, -1);
  const w = windows(end, range);
  const cur = inRange(filterRows(ds), w.start, w.end);
  const healthMap = healthByStore(ds, cur, range);
  const per = groupBy(cur, (r) => r.storeId);
  const q = search.trim().toLowerCase();
  const openByStore = {};
  for (const i of ds.issues) if (OPEN_STATUSES.includes(i.status)) openByStore[i.storeId] = (openByStore[i.storeId] ?? 0) + 1;
  return ds.stores
    .filter((s) => franchisee === "all" || s.franchisee === franchisee)
    .filter((s) => region === "all" || s.region === region)
    .filter((s) => !q || `${s.number} ${s.name} ${s.franchisee} ${s.city}`.toLowerCase().includes(q))
    .map((s) => ({
      store: s,
      m: per.get(s.id) ? derive(per.get(s.id)) : null,
      health: healthMap.get(s.id) ?? { level: "good", breaches: [] },
      openIssues: openByStore[s.id] ?? 0,
      connections: ds.connections.filter((c) => c.storeId === s.id),
    }))
    .filter((r) => health === "all" || r.health.level === health);
}

export function storeProfileModel(ds, storeId, { range = 30 } = {}) {
  const store = ds.stores.find((s) => s.id === storeId);
  if (!store) return null;
  const end = addDays(ds.today, -1);
  const w = windows(end, range);
  const rows = filterRows(ds, { storeIds: [storeId] });
  const cur = inRange(rows, w.start, w.end);
  const prev = inRange(rows, w.prevStart, w.prevEnd);
  const byPlatform = groupBy(cur, (r) => r.platformId);
  const byPlatformPrev = groupBy(prev, (r) => r.platformId);
  const enabled = enabledPlatformIds(ds);
  return {
    store,
    window: w,
    totals: sumRows(cur),
    prevTotals: sumRows(prev),
    health: healthByStore(ds, cur, range).get(storeId) ?? { level: "good", breaches: [] },
    trend: dailyByPlatform(cur, end, range, "orders"),
    errorTrend: dailyDerived(cur, end, range, "errorRate"),
    platforms: PLATFORMS.filter((p) => enabled.has(p.id)).map((p) => ({
      ...p,
      m: byPlatform.get(p.id) ? derive(byPlatform.get(p.id)) : null,
      prev: byPlatformPrev.get(p.id) ? derive(byPlatformPrev.get(p.id)) : null,
      thresholds: thresholdsFor(ds, p.id),
      connection: ds.connections.find((c) => c.storeId === storeId && c.platformId === p.id),
    })),
    issues: sortIssues(ds.issues.filter((i) => i.storeId === storeId)),
    team: {
      fbc: ds.users.find((u) => u.id === store.fbcId),
      areaCoach: ds.users.find((u) => u.id === store.areaCoachId),
      om: ds.users.find((u) => u.id === store.omId),
    },
  };
}

export function issuesModel(ds, { status = "active", severity = "all", platform = "all", assignee = "all", category = "all", search = "", storeId } = {}) {
  const q = search.trim().toLowerCase();
  const storeById = Object.fromEntries(ds.stores.map((s) => [s.id, s]));
  const list = ds.issues.filter((i) => {
    if (storeId && i.storeId !== storeId) return false;
    if (status === "active" && !OPEN_STATUSES.includes(i.status)) return false;
    if (status !== "active" && status !== "all" && i.status !== status) return false;
    if (severity !== "all" && i.severity !== severity) return false;
    if (platform !== "all" && i.platformId !== platform) return false;
    if (category !== "all" && i.category !== category) return false;
    if (assignee === "unassigned" && i.assigneeId) return false;
    if (assignee !== "all" && assignee !== "unassigned" && i.assigneeId !== assignee) return false;
    if (q) {
      const s = storeById[i.storeId];
      const hay = `${i.id} ${i.title} ${i.orderId} ${i.category} ${s?.number} ${s?.name} ${s?.franchisee}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const counts = { active: 0, open: 0, in_progress: 0, waiting: 0, resolved: 0, all: ds.issues.length };
  for (const i of ds.issues) {
    counts[i.status]++;
    if (OPEN_STATUSES.includes(i.status)) counts.active++;
  }
  return { list: sortIssues(list), counts };
}
