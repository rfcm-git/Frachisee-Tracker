/* Delivery-app coverage of open stores, and the daily snapshots kept for the Dashboard trends. */
import { coreActive, platformStatus, primaryTerritory, storeStatus } from "./records.js";

/** Counts for a list of stores: open stores, and how many are Onboarded on each app. */
export function coverageCounts(stores) {
  const counts = { open: 0, ue: 0, dd: 0, gh: 0, all3: 0, ez: 0, wm: 0 };
  stores.forEach((store) => {
    if (storeStatus(store) !== "Open") return;
    counts.open += 1;
    ["ue", "dd", "gh", "ez", "wm"].forEach((key) => { if (platformStatus(store, key) === "Onboarded") counts[key] += 1; });
    if (coreActive(store) === 3) counts.all3 += 1;
  });
  return counts;
}

/** Today's snapshot: { all, terr: { territory: counts } }. */
export function coverageSnapshot(ctx) {
  const byTerritory = new Map();
  ctx.stores.forEach((store) => {
    const territory = primaryTerritory(store);
    if (!byTerritory.has(territory)) byTerritory.set(territory, []);
    byTerritory.get(territory).push(store);
  });
  return { all: coverageCounts(ctx.stores), terr: Object.fromEntries([...byTerritory.entries()].map(([territory, stores]) => [territory, coverageCounts(stores)])) };
}

/** Average 3PD coverage in %: Onboarded store + app slots out of open stores × 3 (Uber Eats, DoorDash, Grubhub). */
export const corePercent = (counts) => (counts?.open ? ((counts.ue + counts.dd + counts.gh) / (counts.open * 3)) * 100 : 0);

/** Local calendar day, e.g. "2026-11-12". */
export function dayKey(date) {
  const value = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** The latest snapshot on or before a day, or null. */
export function snapshotOn(snapshots, day) {
  const key = dayKey(day);
  return (snapshots || []).filter((row) => String(row.day) <= key).sort((a, b) => String(b.day).localeCompare(String(a.day)))[0] || null;
}

/** Counts of a snapshot for one territory (or all). */
export const snapshotCounts = (snapshot, territory) => (snapshot?.data ? (territory ? snapshot.data.terr?.[territory] || null : snapshot.data.all) : null);
