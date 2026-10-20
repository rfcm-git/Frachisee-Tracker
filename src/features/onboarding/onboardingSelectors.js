/* Onboarding tab: filtering and the progress table. */
import { OB_CORE, OB_PLATFORMS, OB_STATES, OB_STATUS_COLOR } from "../../config/constants.js";
import { obIsOpen, obPlatformName, obVisible } from "../../domain/onboarding.js";
import { franchiseeContactMatch, numRank, storeMatches } from "../../domain/search.js";
import { timeOf } from "../../lib/format.js";
import { richToPlain } from "../../lib/richText.js";
import { isObCellActive } from "../../state/uiStore.js";

/** True when a record passes the platform / status filters and the search. */
function passes(ctx, record, filter, sq) {
  if (filter.platforms.length && !filter.platforms.includes(record.platform)) return false;
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

/** Store + platform items to create, and the ones skipped because an open record exists. */
export function planOnboarding(ctx, storeNums, platformKeys) {
  const make = [];
  const skip = [];
  storeNums.forEach((num) => platformKeys.forEach((platform) => {
    const duplicate = ctx.onboarding.find((record) => String(record.store_num) === num && record.platform === platform && obIsOpen(record));
    (duplicate ? skip : make).push({ num, platform });
  }));
  return { make, skip };
}
