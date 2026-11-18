/* Franchisee list and detail data. */
import { franchiseeOpenIssues, storeOpenIssues, storesOf } from "../../domain/context.js";
import { isIssueOpen } from "../../domain/issues.js";
import { territorySet } from "../../domain/records.js";
import { franchiseeInfoMatch, numRank, storeMatches, storeRank } from "../../domain/search.js";
import { compareStores, normalizeName } from "../../lib/text.js";

/** Franchisees matching the toolbar (name, territory, contacts, notes): [{ franchisee, hint }], best matches first when searching. */
export function filterFranchisees(ctx, { sq, terrFilter, issuesOnly }) {
  const list = [];
  ctx.franchisees.forEach((franchisee) => {
    if (terrFilter && !territorySet(franchisee.territory).has(terrFilter)) return;
    if (issuesOnly && !franchiseeOpenIssues(ctx, franchisee.id)) return;
    const match = franchiseeInfoMatch(franchisee, sq);
    if (match) list.push({ franchisee, rank: match.rank, hint: match.hint });
  });
  if (sq.q) list.sort((a, b) => a.rank - b.rank || String(a.franchisee.name || "").localeCompare(String(b.franchisee.name || "")));
  return list;
}

/** A franchisee's stores; stores matching the search come first and are marked as hits. */
export function franchiseeStores(ctx, franchisee, sq) {
  const hitQuery = sq.q && sq.mode !== "fr" ? sq.q : null;
  const ownerName = String(franchisee.name || "").toLowerCase();
  const isHit = (store) => !!hitQuery && (sq.mode === "store"
    ? numRank(store.num, hitQuery) < 9
    : storeMatches(ctx, store, sq) && !ownerName.includes(hitQuery));
  const stores = storesOf(ctx, franchisee.id).slice().sort((a, b) => String(a.num || "").localeCompare(String(b.num || "")))
    .map((store) => ({ store, hit: isHit(store), openIssues: storeOpenIssues(ctx, store.num) }));
  if (hitQuery) {
    stores.sort((a, b) => (b.hit - a.hit) || (a.hit && b.hit ? storeRank(a.store, sq) - storeRank(b.store, sq) : 0) || compareStores(a.store, b.store));
  }
  return stores;
}

/** Issues saved on the franchisee: open first, newest first. */
export const franchiseeIssues = (ctx, franchiseeId) => ctx.issues.filter((issue) => issue.franchisee_id === franchiseeId)
  .sort((a, b) => (!isIssueOpen(a)) - (!isIssueOpen(b)) || b.id - a.id);

/** Another franchisee with the same name (ignoring case and spaces), or null. */
export function findDuplicateFranchisee(ctx, name, exceptId = null) {
  const wanted = normalizeName(name);
  if (!wanted) return null;
  return ctx.franchisees.find((franchisee) => normalizeName(franchisee.name) === wanted && franchisee.id !== exceptId) || null;
}
