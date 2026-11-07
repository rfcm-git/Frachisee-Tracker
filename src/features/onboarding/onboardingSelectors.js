/* Onboarding tab: filtering and the progress table. */
import { OB_CORE, OB_PLATFORMS, OB_STATES, OB_STATUS_COLOR } from "../../config/constants.js";
import { obIsOpen, obPlatformName, obVisible } from "../../domain/onboarding.js";
import { platformStatus } from "../../domain/records.js";
import { franchiseeContactMatch, numRank, storeMatches } from "../../domain/search.js";
import { timeOf } from "../../lib/format.js";
import { richToPlain } from "../../lib/richText.js";
import { isObCellActive } from "../../state/uiStore.js";

/** Franchisee of a record: from its store, or the saved id. */
const recordFranchisee = (ctx, record) => {
  const store = ctx.storeByNum.get(String(record.store_num || ""));
  return store ? store.franchisee_id : record.franchisee_id;
};

/** True when a record passes the platform / status / franchisee filters and the search. */
function passes(ctx, record, filter, sq) {
  if (filter.platforms.length && !filter.platforms.includes(record.platform)) return false;
  if (filter.franchisees?.length && !filter.franchisees.includes(recordFranchisee(ctx, record))) return false;
  if (filter.threePd.length || filter.ezCater.length) {
    const core = OB_CORE.includes(record.platform);
    const ez = record.platform === "ez";
    const statusOk = (core && filter.threePd.length && filter.threePd.includes(record.status)) || (ez && filter.ezCater.length && filter.ezCater.includes(record.status));
    if (!statusOk) return false;
  }
  if (!sq.q) return true;
  const store = ctx.storeByNum.get(String(record.store_num || ""));
  const franchiseeId = store ? store.franchisee_id : record.franchisee_id;
  if (sq.mode === "store") return numRank(record.store_num, sq.q) < 9;
  if (sq.mode === "fr") return String(ctx.frById.get(franchiseeId)?.name || "").toLowerCase().includes(sq.q);
  return [record.store_num, obPlatformName(record.platform), record.status, richToPlain(record.details), richToPlain(record.last_update)].join(" ").toLowerCase().includes(sq.q)
    || (store && storeMatches(ctx, store, sq))
    || franchiseeContactMatch(ctx, franchiseeId, sq);
}

export function filterOnboarding(ctx, filter, sq) {
  return ctx.onboarding.filter((record) => obVisible(record) && passes(ctx, record, filter, sq))
    .sort((a, b) => (sq.q && sq.mode !== "fr" ? numRank(a.store_num, sq.q) - numRank(b.store_num, sq.q) : 0)
      || (filter.sort === "new" ? timeOf(b.created_at) - timeOf(a.created_at) : timeOf(a.created_at) - timeOf(b.created_at)));
}

/** Platform order used inside a store row. */
const platformOrder = (key) => OB_PLATFORMS.findIndex(([value]) => value === key);
const lastActivity = (record) => Math.max(timeOf(record.updated_at), timeOf(record.created_at));

/**
 * The filtered records grouped by store, one entry per store:
 * { num, store, franchiseeId, records (in platform order), latest (most recently updated record), lastAt, startedAt, open }.
 * Sorted like the record list: by store number when searching a number, else newest or oldest activity first.
 */
export function groupOnboardingByStore(ctx, records, filter, sq) {
  const groups = new Map();
  records.forEach((record) => {
    const num = String(record.store_num || "");
    if (!groups.has(num)) groups.set(num, []);
    groups.get(num).push(record);
  });
  const list = [...groups.entries()].map(([num, items]) => {
    const sorted = items.slice().sort((a, b) => platformOrder(a.platform) - platformOrder(b.platform));
    const latest = items.slice().sort((a, b) => lastActivity(b) - lastActivity(a))[0];
    return {
      num, store: ctx.storeByNum.get(num) || null, franchiseeId: recordFranchisee(ctx, items[0]), records: sorted, latest,
      lastAt: lastActivity(latest), startedAt: Math.min(...items.map((item) => timeOf(item.created_at))), open: items.filter(obIsOpen).length,
    };
  });
  return list.sort((a, b) => (sq.q && sq.mode !== "fr" ? numRank(a.num, sq.q) - numRank(b.num, sq.q) : 0)
    || (filter.sort === "new" ? b.lastAt - a.lastAt : a.startedAt - b.startedAt));
}

/** Franchisees that have stores on the onboarding list, by name, with their record count: [{ id, name, count }]. */
export function onboardingFranchisees(ctx) {
  const counts = new Map();
  ctx.onboarding.filter(obVisible).forEach((record) => {
    const id = recordFranchisee(ctx, record);
    if (id != null) counts.set(id, (counts.get(id) || 0) + 1);
  });
  return [...counts.entries()].map(([id, count]) => ({ id, name: ctx.frById.get(id)?.name || `Franchisee ${id}`, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const openOnboardingCount = (ctx) => ctx.onboarding.filter((record) => obVisible(record) && obIsOpen(record)).length;

/** Progress by platform and status, always from all records (filters do not change it). */
export function progressModel(ctx, filter) {
  const rows = ctx.onboarding.filter(obVisible);
  const totals = Object.fromEntries(OB_STATES.map((status) => [status, rows.filter((record) => record.status === status).length]));
  const platforms = OB_PLATFORMS.map(([key, name]) => {
    const entries = rows.filter((record) => record.platform === key);
    return {
      key, name, total: entries.length, done: entries.filter((record) => record.status === "Onboarded").length,
      statuses: OB_STATES.map((status) => ({ status, count: entries.filter((record) => record.status === status).length, active: isObCellActive(filter, key, status), color: OB_STATUS_COLOR[status] })),
    };
  });
  const done = totals.Onboarded || 0;
  return { platforms, totals, total: rows.length, done, percent: rows.length ? Math.round((done / rows.length) * 100) : 0 };
}

/** Most recent onboarding record of a store + platform, or null. */
export const latestOnboarding = (ctx, num, platform) => ctx.onboarding
  .filter((record) => String(record.store_num) === String(num) && record.platform === platform)
  .sort((a, b) => timeOf(b.created_at) - timeOf(a.created_at))[0] || null;

/** Status of a store on each supported platform: its Delivery Platforms status and its latest onboarding status ("" when none). */
export function storePlatformStatuses(ctx, num) {
  const store = ctx.storeByNum.get(String(num));
  return OB_PLATFORMS.map(([key]) => ({
    key,
    delivery: store ? platformStatus(store, key) : "Not enrolled",
    onboarding: latestOnboarding(ctx, String(num), key)?.status || "",
  }));
}

/** True when a store + platform already has a status in Delivery Platforms, so adding it should be confirmed. */
export const hasPlatformStatus = (entry) => entry.delivery !== "Not enrolled";

/**
 * What adding these stores + platforms will do. A store + platform already on the list is not added again:
 * when the status differs or details are written it becomes an update of that record, otherwise it is skipped.
 * Items on a platform where the store is already Onboarded or Exempted keep that status (the store wins), so nothing is downgraded.
 * Returns { make: [{ num, platform, exempt, status? (Onboarded when the store already is), current }], updates: [{ num, platform, record, status, text }], skip: [{ num, platform, record }],
 *   exempt, flagged (new items whose store already has a status there), stores (picked stores with their statuses) }.
 */
export function planOnboarding(ctx, storeNums, platformKeys, { status = OB_STATES[0], details = "" } = {}) {
  const make = [];
  const updates = [];
  const skip = [];
  const hasDetails = !!richToPlain(details).trim();
  const stores = storeNums.map((num) => ({ num, platforms: storePlatformStatuses(ctx, num) }));
  stores.forEach(({ num, platforms }) => platformKeys.forEach((platform) => {
    const record = latestOnboarding(ctx, num, platform);
    const current = platforms.find((entry) => entry.key === platform);
    if (!record) {
      make.push({ num, platform, exempt: current.delivery === "Exempted", ...(current.delivery === "Onboarded" ? { status: "Onboarded" } : {}), current });
      return;
    }
    if (record.status !== status || hasDetails) updates.push({ num, platform, record, status, text: details });
    else skip.push({ num, platform, record });
  }));
  return { make, updates, skip, exempt: make.filter((item) => item.exempt), flagged: make.filter((item) => hasPlatformStatus(item.current)), stores };
}

/** Platforms of a store that are not on the onboarding list yet, with the store's Delivery Platforms status. */
export function platformsNotOnList(ctx, num) {
  return storePlatformStatuses(ctx, num).filter((entry) => !entry.onboarding);
}
