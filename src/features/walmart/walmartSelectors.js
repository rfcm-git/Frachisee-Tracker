/* Walmart tab: search, filters, sorting and the progress numbers. */
import { franchiseeName } from "../../domain/context.js";
import { numRank } from "../../domain/search.js";
import { normalizeWmStage, wmHistory, wmIsOpen, wmSummary } from "../../domain/walmart.js";
import { timeOf } from "../../lib/format.js";
import { compareNumbers } from "../../lib/text.js";

/** Stage order of the stage sort: along the path, then exempted. */
const STAGE_SORT = ["Awaiting App", "Payment Setup", "Account Created", "Exempted"];

/** Each record with its store and franchisee (from the tracker's store records). */
export function walmartRows(ctx) {
  return ctx.walmart.map((record) => {
    const store = ctx.storeByNum.get(String(record.store_num)) || null;
    const franchiseeId = store ? store.franchisee_id : null;
    return { record, store, franchiseeId, franchisee: franchiseeId != null ? franchiseeName(ctx, franchiseeId) : "", stage: normalizeWmStage(record.stage) };
  });
}

/** Search: "#123" store number, "@name" franchisee, anything else store #, franchisee, stage or notes. */
function matchesSearch(row, sq) {
  if (!sq.q) return true;
  if (sq.mode === "store") return numRank(row.record.store_num, sq.q) < 9;
  if (sq.mode === "fr") return row.franchisee.toLowerCase().includes(sq.q);
  if (numRank(row.record.store_num, sq.q) < 9) return true;
  return [row.franchisee, row.stage, row.record.notes].join(" ").toLowerCase().includes(sq.q);
}

/** "none": open stores not emailed yet; "sent": open stores already emailed. */
function passesEmail(row, email) {
  if (!email) return true;
  if (!wmIsOpen(row.record)) return false;
  return email === "sent" ? !!row.record.last_email_at : !row.record.last_email_at;
}

/** Open stores (Awaiting App / Payment Setup) and how many of them were never emailed. */
export function walmartFollowUp(ctx) {
  const open = ctx.walmart.filter(wmIsOpen);
  return { open: open.length, notEmailed: open.filter((record) => !record.last_email_at).length };
}

const SORTERS = {
  num: (a, b) => compareNumbers(a.record.store_num, b.record.store_num),
  stage: (a, b) => STAGE_SORT.indexOf(a.stage) - STAGE_SORT.indexOf(b.stage),
  emailed: (a, b) => timeOf(a.record.last_email_at) - timeOf(b.record.last_email_at),
  added: (a, b) => timeOf(a.record.created_at) - timeOf(b.record.created_at),
  updated: (a, b) => timeOf(a.record.updated_at || a.record.created_at) - timeOf(b.record.updated_at || b.record.created_at),
};

/** Rows that pass the search and filters, in the chosen order (ties by store number). */
export function filterWalmart(ctx, filter, sq) {
  const sort = filter.sort && typeof filter.sort === "object" ? filter.sort : { key: "stage", dir: 1 };
  const sorter = SORTERS[sort.key] || SORTERS.stage;
  return walmartRows(ctx)
    .filter((row) => (!filter.stages.length || filter.stages.includes(row.stage))
      && (!filter.franchisees.length || filter.franchisees.includes(row.franchiseeId))
      && passesEmail(row, filter.email)
      && matchesSearch(row, sq))
    .sort((a, b) => (sq.q && sq.mode === "store" ? numRank(a.record.store_num, sq.q) - numRank(b.record.store_num, sq.q) : 0)
      || sorter(a, b) * sort.dir || SORTERS.num(a, b));
}

/**
 * Franchisees with more than one store on the Walmart tab, as { id, name, rows (all their stores, by stage then store #), counts }.
 * A franchisee is listed when any of their stores passes the search and filters.
 */
export function walmartOwnerGroups(ctx, filteredRows) {
  const all = new Map();
  walmartRows(ctx).forEach((row) => {
    if (row.franchiseeId == null) return;
    if (!all.has(row.franchiseeId)) all.set(row.franchiseeId, []);
    all.get(row.franchiseeId).push(row);
  });
  const shown = new Set(filteredRows.map((row) => row.franchiseeId));
  return [...all.entries()].filter(([id, rows]) => rows.length > 1 && shown.has(id)).map(([id, rows]) => {
    const sorted = rows.slice().sort((a, b) => SORTERS.stage(a, b) || compareNumbers(a.record.store_num, b.record.store_num));
    const counts = {};
    sorted.forEach((row) => { counts[row.stage] = (counts[row.stage] || 0) + 1; });
    return { id, name: rows[0].franchisee || `#${id}`, rows: sorted, counts };
  }).sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
}

/** Franchisees with stores on the Walmart tab, by name, with their store count. */
export function walmartFranchisees(ctx) {
  const counts = new Map();
  walmartRows(ctx).forEach((row) => { if (row.franchiseeId != null) counts.set(row.franchiseeId, (counts.get(row.franchiseeId) || 0) + 1); });
  return [...counts.entries()].map(([id, count]) => ({ id, name: franchiseeName(ctx, id) || `#${id}`, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Stores still needing the owner (Awaiting App or Payment Setup), for the menu count. */
export const openWalmartCount = (ctx) => ctx.walmart.filter(wmIsOpen).length;

export const walmartProgress = (ctx) => wmSummary(ctx.walmart);

/** Saved Walmart record of a store number, or null. */
export const findWalmart = (ctx, num) => ctx.walmart.find((record) => String(record.store_num) === String(num)) || null;

/** Time of the last import (from the change logs), or 0. */
export function lastWalmartImport(ctx) {
  let latest = 0;
  ctx.walmart.forEach((record) => {
    wmHistory(record).forEach((entry) => { if (entry?.source === "import") latest = Math.max(latest, timeOf(entry.ts)); });
  });
  return latest;
}
