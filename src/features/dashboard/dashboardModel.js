/* Dashboard numbers, computed from the data context for one territory (or all). */
import { CHART_COLORS as DC, PLATFORMS, PLATFORMS_UI } from "../../config/constants.js";
import { franchiseeName, staffMember } from "../../domain/context.js";
import { isIssueOpen, normalizeIssueStatus, resolvedAt } from "../../domain/issues.js";
import { coreActive, hasGbp, issuePlatforms, platformStatus, primaryTerritory, storeStatus } from "../../domain/records.js";
import { addDays, formatNumber, percent, startOfWeek } from "../../lib/format.js";

const DAY = 864e5;

/** Territories that have stores, in number order. */
export const territoriesOf = (ctx) => [...new Set(ctx.stores.map(primaryTerritory))].filter((territory) => territory !== "—").sort((a, b) => (+a || 0) - (+b || 0));

/** Stores, open stores and issues in the selected territory. */
export function dashboardScope(ctx, territory) {
  const stores = ctx.stores.filter((store) => !territory || primaryTerritory(store) === territory);
  const numbers = new Set(stores.map((store) => String(store.num)));
  return {
    stores,
    live: stores.filter((store) => storeStatus(store) === "Open"),
    issues: ctx.issues.filter((issue) => !territory || numbers.has(String(issue.store_num || ""))),
    franchiseeIds: new Set(stores.map((store) => store.franchisee_id)),
  };
}

export function buildDashboard(ctx, territory, sort, now = Date.now()) {
  const { stores, live, issues, franchiseeIds } = dashboardScope(ctx, territory);
  const territories = territoriesOf(ctx);
  const statusCount = { Open: 0, "Temporarily closed": 0, Closed: 0 };
  stores.forEach((store) => { statusCount[storeStatus(store)] += 1; });
  const coreDist = [0, 0, 0, 0];
  live.forEach((store) => { coreDist[coreActive(store)] += 1; });
  const avgCore = live.length ? live.reduce((sum, store) => sum + coreActive(store), 0) / live.length : 0;
  const gbpYes = live.filter(hasGbp).length;
  const ez = { Active: 0, Pending: 0, "Not enrolled": 0 };
  live.forEach((store) => { ez[platformStatus(store, "ez")] += 1; });
  const openIssues = issues.filter(isIssueOpen);
  const resolvedIssues = issues.filter((issue) => !isIssueOpen(issue));
  const resolveDays = resolvedIssues.map((issue) => { const at = resolvedAt(issue); return at ? (at - new Date(issue.created_at)) / DAY : null; }).filter((value) => value != null && value >= 0);
  const avgResolve = resolveDays.length ? Math.round((resolveDays.reduce((a, b) => a + b, 0) / resolveDays.length) * 10) / 10 : null;
  const storesWithOpen = new Set(openIssues.map((issue) => String(issue.store_num || ""))).size;

  const kpis = [
    { icon: "users", label: "Franchisees", value: formatNumber(franchiseeIds.size), sub: "owners with stores here", tip: "Number of franchisees (owners) who have at least one store in this view.", action: ["tab", "franchisees"] },
    { icon: "store", label: "Stores", value: formatNumber(stores.length), statusCount, tip: "All stores in this view, split by store status.", action: ["tab", "stores"] },
    { icon: "map", label: "Territories", value: territory ? "1" : formatNumber(territories.length), sub: territory ? "filtered" : "covered", tip: "Number of territories with stores." },
    { icon: "bike", label: "Avg 3PD per store", value: avgCore.toFixed(1), valueSuffix: " / 3", sub: `${percent(coreDist[3], live.length)}% on all 3`, tip: "Average number of core delivery apps (Uber Eats, DoorDash, Grubhub) that are Active, across open stores.", action: ["list", "core:3"] },
    { icon: "map-pinned", label: "Google Business Profile", value: `${percent(gbpYes, live.length)}%`, sub: `${formatNumber(gbpYes)} of ${formatNumber(live.length)} open stores`, tip: "Open stores that have a Google Business Profile link saved (synced).", action: ["list", "gbp:no"] },
    { icon: "utensils", label: "ezCater active", value: `${percent(ez.Active, live.length)}%`, sub: `${formatNumber(ez.Active)} active · ${formatNumber(ez.Pending)} pending`, tip: "Open stores with ezCater set to Active.", action: ["list", "plat:ez:Active"] },
    { icon: "triangle-alert", label: "Open issues", value: formatNumber(openIssues.length), sub: `${formatNumber(storesWithOpen)} store${storesWithOpen !== 1 ? "s" : ""} affected`, tip: "Issues that are Pending or Work in Progress.", tone: openIssues.length ? "warn" : "", action: ["issues", ""] },
  ];

  const coreRows = [0, 1, 2, 3].map((count) => ({
    label: count === 0 ? "None" : count === 3 ? "All 3" : `${count} of 3`,
    value: coreDist[count],
    color: count === 0 ? DC.redSoft : count === 3 ? DC.green : count === 2 ? DC.lime : DC.yellow,
    act: `core:${count}`,
    tip: `${count === 0 ? "Open stores with no core delivery app active" : count === 3 ? "Open stores active on Uber Eats, DoorDash and Grubhub" : `Open stores active on ${count} of the 3 core apps`}: ${formatNumber(coreDist[count])} (${percent(coreDist[count], live.length)}%) — click to see them`,
  }));
  const platformRows = PLATFORMS_UI.map(([key, name]) => {
    const counts = { Active: 0, Pending: 0, "Not enrolled": 0 };
    live.forEach((store) => { counts[platformStatus(store, key)] += 1; });
    return { label: name, parts: [
      { label: "Active", value: counts.Active, color: DC.green, act: `plat:${key}:Active` },
      { label: "Pending", value: counts.Pending, color: DC.yellow, act: `plat:${key}:Pending` },
      { label: "Not enrolled", value: counts["Not enrolled"], color: DC.redSoft, act: `plat:${key}:Not enrolled` },
    ] };
  });
  const donuts = [
    { title: "Google Business Profile", icon: "map-pinned", tip: "An open store counts as synced when its Google Business Profile link is saved in the store window.", center: `${percent(gbpYes, live.length)}%`, sub: "synced",
      segments: [{ label: "Synced (link saved)", value: gbpYes, color: DC.green, act: "gbp:yes", tip: "Click to see these stores" }, { label: "Not synced", value: live.length - gbpYes, color: DC.gray, act: "gbp:no", tip: "No GBP link saved; click to see these stores" }] },
    { title: "ezCater", icon: "utensils", tip: "ezCater status of open stores (set in Delivery Platforms in the store window).", center: `${percent(ez.Active, live.length)}%`, sub: "active",
      segments: [{ label: "Active", value: ez.Active, color: DC.green, act: "plat:ez:Active" }, { label: "Pending", value: ez.Pending, color: DC.yellow, act: "plat:ez:Pending" }, { label: "Not enrolled", value: ez["Not enrolled"], color: DC.gray, act: "plat:ez:Not enrolled" }] },
  ];

  const territoryRows = (territory ? [territory] : territories).map((value) => {
    const inTerritory = ctx.stores.filter((store) => primaryTerritory(store) === value);
    const open = inTerritory.filter((store) => storeStatus(store) === "Open");
    const numbers = new Set(inTerritory.map((store) => String(store.num)));
    return {
      t: value, fr: new Set(inTerritory.map((store) => store.franchisee_id)).size, stores: inTerritory.length, open: open.length,
      avg: open.length ? open.reduce((sum, store) => sum + coreActive(store), 0) / open.length : 0,
      all3: percent(open.filter((store) => coreActive(store) === 3).length, open.length),
      gbp: percent(open.filter(hasGbp).length, open.length),
      ez: percent(open.filter((store) => platformStatus(store, "ez") === "Active").length, open.length),
      issues: ctx.issues.filter((issue) => isIssueOpen(issue) && numbers.has(String(issue.store_num || ""))).length,
    };
  }).sort((a, b) => ((a[sort.key] > b[sort.key] ? 1 : a[sort.key] < b[sort.key] ? -1 : 0) * sort.dir) || (+a.t || 0) - (+b.t || 0));

  const statusCounts = { Pending: 0, "Work in Progress": 0, Resolved: 0 };
  issues.forEach((issue) => { statusCounts[normalizeIssueStatus(issue.status)] += 1; });
  const summary = [
    { label: "Total", value: formatNumber(issues.length), tip: "All issues logged in this view (multi-store issues count once per store)" },
    { label: "Open", value: formatNumber(openIssues.length), tone: "red", tip: "Pending or Work in Progress" },
    { label: "Resolved", value: formatNumber(resolvedIssues.length), tone: "g", tip: "Resolved issues" },
    { label: "Resolved rate", value: `${percent(resolvedIssues.length, issues.length)}%`, tip: "Resolved / total" },
    { label: "Avg days to resolve", value: avgResolve == null ? "—" : avgResolve, tip: "Average days from logged to resolved" },
    { label: "Last 7 days", value: formatNumber(issues.filter((issue) => now - new Date(issue.created_at) <= 7 * DAY).length), tip: "Issues logged in the last 7 days" },
  ];
  const statusSegments = [
    { label: "Pending", value: statusCounts.Pending, color: DC.red },
    { label: "Work in Progress", value: statusCounts["Work in Progress"], color: DC.orange },
    { label: "Resolved", value: statusCounts.Resolved, color: DC.ok },
  ];

  const weekStart = startOfWeek(new Date(now));
  const weeks = [];
  for (let back = 11; back >= 0; back -= 1) {
    const from = addDays(weekStart, -back * 7);
    const to = addDays(from, 7);
    weeks.push({
      label: from.toLocaleDateString([], { month: "short", day: "numeric" }),
      logged: issues.filter((issue) => { const date = new Date(issue.created_at); return date >= from && date < to; }).length,
      resolved: resolvedIssues.filter((issue) => { const date = resolvedAt(issue); return date && date >= from && date < to; }).length,
    });
  }

  const ageBuckets = [["0–2 days", 0, 3], ["3–7 days", 3, 8], ["8–14 days", 8, 15], ["15–30 days", 15, 31], ["Over 30 days", 31, 1e9]];
  const ageColors = [DC.lime, DC.yellow, DC.orange, DC.red, "#8e2b20"];
  const ageRows = ageBuckets.map(([label, from, to], index) => ({
    label, color: ageColors[index], tip: `${label} old (still open)`,
    value: openIssues.filter((issue) => { const days = (now - new Date(issue.created_at)) / DAY; return days >= from && days < to; }).length,
  }));

  const byPlatform = {};
  issues.forEach((issue) => {
    const platforms = issuePlatforms(issue);
    (platforms.length ? platforms : ["Not set"]).forEach((platform) => {
      byPlatform[platform] = byPlatform[platform] || { open: 0, resolved: 0 };
      if (isIssueOpen(issue)) byPlatform[platform].open += 1; else byPlatform[platform].resolved += 1;
    });
  });
  const issuePlatformRows = Object.entries(byPlatform).sort((a, b) => (b[1].open + b[1].resolved) - (a[1].open + a[1].resolved))
    .map(([label, count]) => ({ label, parts: [{ label: "Open", value: count.open, color: DC.red }, { label: "Resolved", value: count.resolved, color: DC.ok }] }));

  const byStore = {};
  openIssues.forEach((issue) => {
    const key = String(issue.store_num || "");
    byStore[key] = byStore[key] || { count: 0, oldest: Infinity };
    byStore[key].count += 1;
    byStore[key].oldest = Math.min(byStore[key].oldest, new Date(issue.created_at).getTime());
  });
  const topStores = Object.entries(byStore).sort((a, b) => b[1].count - a[1].count || a[1].oldest - b[1].oldest).slice(0, 8).map(([num, value]) => {
    const store = ctx.storeByNum.get(num);
    return { num, count: value.count, age: Math.floor((now - value.oldest) / DAY), franchisee: store ? franchiseeName(ctx, store.franchisee_id) || "—" : "—", location: store ? [store.city, store.state].filter(Boolean).join(", ") : "" };
  });

  const byFbc = {};
  openIssues.forEach((issue) => {
    const store = ctx.storeByNum.get(String(issue.store_num || ""));
    const fbc = store ? staffMember(ctx, store.fbc_id) : null;
    const key = fbc ? fbc.name : "No FBC";
    byFbc[key] = (byFbc[key] || 0) + 1;
  });
  const fbcRows = Object.entries(byFbc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value, color: DC.orange, tip: `${label}: ${value} open issue${value !== 1 ? "s" : ""}` }));

  const gaps = [
    ["gap:no3pd", "circle-off", "No core 3PD active", live.filter((store) => coreActive(store) === 0).length, "Open stores with none of Uber Eats, DoorDash or Grubhub active"],
    ["plat:ue:Not enrolled", "bike", "Not on Uber Eats", live.filter((store) => platformStatus(store, "ue") === "Not enrolled").length, "Open stores not enrolled on Uber Eats"],
    ["plat:dd:Not enrolled", "bike", "Not on DoorDash", live.filter((store) => platformStatus(store, "dd") === "Not enrolled").length, "Open stores not enrolled on DoorDash"],
    ["plat:gh:Not enrolled", "bike", "Not on Grubhub", live.filter((store) => platformStatus(store, "gh") === "Not enrolled").length, "Open stores not enrolled on Grubhub"],
    ["gbp:no", "map-pinned", "No GBP link", live.length - gbpYes, "Open stores without a Google Business Profile link"],
    ["plat:ez:Not enrolled", "utensils", "Not on ezCater", ez["Not enrolled"], "Open stores not enrolled on ezCater"],
    ["gap:nofbc", "user-x", "No FBC assigned", stores.filter((store) => !staffMember(ctx, store.fbc_id)).length, "Stores without an assigned FBC"],
    ["gap:noom", "user-x", "No OM assigned", stores.filter((store) => !staffMember(ctx, store.om_id)).length, "Stores without an assigned OM"],
    ["status:Temporarily closed", "clock", "Temporarily closed", statusCount["Temporarily closed"], "Stores marked Temporarily closed"],
  ].map(([key, icon, label, count, tip]) => ({ key, icon, label, count, tip }));

  return {
    territories, kpis, coverage: { coreRows, platformRows, liveCount: live.length }, donuts, territoryRows, gaps,
    issues: { summary, statusSegments, totalIssues: formatNumber(issues.length), hasIssues: issues.length > 0, weeks, ageRows, topStores, platformRows: issuePlatformRows, fbcRows },
  };
}

/** Stores behind a dashboard number, e.g. "core:0", "plat:ue:Active", "gbp:no", "gap:nofbc", "status:Closed". */
export function dashboardStores(ctx, territory, key) {
  const { stores, live } = dashboardScope(ctx, territory);
  const [kind, a, b] = key.split(":");
  if (kind === "core") return live.filter((store) => coreActive(store) === +a);
  if (kind === "plat") return live.filter((store) => platformStatus(store, a) === b);
  if (kind === "gbp") return live.filter((store) => (a === "yes" ? hasGbp(store) : !hasGbp(store)));
  if (kind === "gap" && a === "no3pd") return live.filter((store) => coreActive(store) === 0);
  if (kind === "gap" && a === "nofbc") return stores.filter((store) => !staffMember(ctx, store.fbc_id));
  if (kind === "gap" && a === "noom") return stores.filter((store) => !staffMember(ctx, store.om_id));
  if (kind === "status") return stores.filter((store) => storeStatus(store) === a);
  return [];
}

export function dashboardListTitle(key) {
  const [kind, a, b] = key.split(":");
  const platformName = (value) => (PLATFORMS.find(([k]) => k === value) || [value, value])[1];
  if (kind === "core") return +a === 0 ? "Open stores with no core 3PD active" : +a === 3 ? "Open stores active on all 3 core apps" : `Open stores active on ${a} of 3 core apps`;
  if (kind === "plat") return `${platformName(a)} — ${b} (open stores)`;
  if (kind === "gbp") return a === "yes" ? "Open stores synced with Google Business Profile" : "Open stores without a GBP link";
  if (key === "gap:no3pd") return "Open stores with no core 3PD active";
  if (key === "gap:nofbc") return "Stores without an FBC";
  if (key === "gap:noom") return "Stores without an OM";
  if (kind === "status") return `Stores — ${a}`;
  return "Stores";
}
