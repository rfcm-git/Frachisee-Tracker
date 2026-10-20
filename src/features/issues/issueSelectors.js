/* Concerns tab: filtering and the three table views (by store, by franchisee, by issue). */
import { franchiseeName } from "../../domain/context.js";
import { historyEntries, isIssueOpen, issueFranchiseeId, issueNumber, normalizeIssueStatus } from "../../domain/issues.js";
import { issuePlatforms } from "../../domain/records.js";
import { franchiseeContactMatch, numRank, storeMatches } from "../../domain/search.js";
import { inBounds, periodBounds } from "../../lib/periods.js";
import { richToPlain } from "../../lib/richText.js";
import { timeOf } from "../../lib/format.js";

/** Returns { pass(issue), rank(items) } for the current filters and search. */
export function issueMatchers(ctx, filter, sq) {
  const bounds = periodBounds(filter);
  const { mode, q } = sq;
  const matchesSearch = (issue) => {
    if (!q) return true;
    if (mode === "store") return numRank(issue.store_num, q) < 9 || (q.length >= 6 && issueNumber(issue).includes(q));
    if (mode === "fr") return franchiseeName(ctx, issue.franchisee_id).toLowerCase().includes(q);
    const store = ctx.storeByNum.get(String(issue.store_num || ""));
    return [richToPlain(issue.title), richToPlain(issue.action_taken), issue.store_num, issueNumber(issue), franchiseeName(ctx, issue.franchisee_id), issuePlatforms(issue).join(" ")]
      .join(" ").toLowerCase().includes(q)
      || (store && storeMatches(ctx, store, sq))
      || franchiseeContactMatch(ctx, issueFranchiseeId(ctx, issue), sq);
  };
  return {
    pass: (issue) => (!filter.statuses.length || filter.statuses.includes(normalizeIssueStatus(issue.status))) && inBounds(issue.created_at, bounds) && matchesSearch(issue),
    rank: (items) => (q && mode !== "fr" ? Math.min(...items.map((issue) => numRank(issue.store_num, q))) : 9),
  };
}

const lastOf = (items) => Math.max(...items.map((issue) => timeOf(issue.updated_at || issue.created_at)));
const firstOf = (items) => Math.min(...items.map((issue) => timeOf(issue.created_at)));

/** One row per store: [{ num, items, franchiseeId, open, last, first }] */
export function issuesByStore(ctx, matchers, sort) {
  const groups = new Map();
  ctx.issues.filter(matchers.pass).forEach((issue) => {
    const key = String(issue.store_num || "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(issue);
  });
  return [...groups.entries()].map(([num, items]) => {
    const store = ctx.storeByNum.get(num);
    return {
      num, items,
      franchiseeId: store ? store.franchisee_id : items.find((issue) => issue.franchisee_id)?.franchisee_id,
      open: items.filter(isIssueOpen).length, last: lastOf(items), first: firstOf(items),
    };
  }).sort((a, b) => (matchers.rank(a.items) - matchers.rank(b.items)) || (sort === "new" ? b.last - a.last : a.first - b.first));
}

/** One row per franchisee: [{ franchiseeId, items, open, stores, last, first }] */
export function issuesByFranchisee(ctx, matchers, sort) {
  const groups = new Map();
  ctx.issues.filter(matchers.pass).forEach((issue) => {
    const key = issueFranchiseeId(ctx, issue) || 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(issue);
  });
  return [...groups.entries()].map(([franchiseeId, items]) => ({
    franchiseeId, items, open: items.filter(isIssueOpen).length,
    stores: new Set(items.map((issue) => String(issue.store_num || ""))).size, last: lastOf(items), first: firstOf(items),
  })).sort((a, b) => (sort === "new" ? b.last - a.last : a.first - b.first));
}

/**
 * One row per issue; a multi-store issue is one row.
 * [{ kind: "single"|"group", groupId, items, created }]
 */
export function issuesByIssue(ctx, matchers, sort) {
  const groups = {};
  const entries = [];
  ctx.issues.forEach((issue) => {
    if (issue.group_id) (groups[issue.group_id] = groups[issue.group_id] || []).push(issue);
    else entries.push({ kind: "single", items: [issue], created: issue.created_at });
  });
  Object.keys(groups).forEach((groupId) => {
    const members = groups[groupId].sort((a, b) => String(a.store_num || "").localeCompare(String(b.store_num || "")));
    entries.push({ kind: members.length > 1 ? "group" : "single", groupId, items: members, created: members[0].created_at });
  });
  return entries.filter((entry) => entry.items.some(matchers.pass)).sort((a, b) => {
    const rank = matchers.rank(a.items) - matchers.rank(b.items);
    if (rank) return rank;
    return sort === "new" ? timeOf(b.created) - timeOf(a.created) : timeOf(a.created) - timeOf(b.created);
  });
}

export const historyCount = (issue) => historyEntries(issue).length;
