/*
 * ezCater tab: the ezCater onboarding records (same table and statuses as the Onboarding tab), one row per store —
 * its latest ezCater record. Search, filters, sorting and the progress numbers.
 */
import { OB_STATES } from "../../config/constants.js";
import { franchiseeName } from "../../domain/context.js";
import { obHistory, obIsOpen, obOnEzTab } from "../../domain/onboarding.js";
import { OB_EMAIL_NOTE } from "../../domain/onboardingEmail.js";
import { numRank } from "../../domain/search.js";
import { timeOf } from "../../lib/format.js";
import { richToPlain } from "../../lib/richText.js";
import { compareNumbers } from "../../lib/text.js";

/** When the record was last emailed (its latest "Email Sent" update), or "". */
export function ezEmailedAt(record) {
  return obHistory(record).filter((entry) => String(entry.action || "").trim() === OB_EMAIL_NOTE).map((entry) => entry.ts).pop() || "";
}

/** The latest ezCater record of each store. */
export function ezRecords(ctx) {
  const latest = new Map();
  ctx.onboarding.filter(obOnEzTab).forEach((record) => {
    const num = String(record.store_num || "");
    const current = latest.get(num);
    if (!current || timeOf(record.created_at) > timeOf(current.created_at)) latest.set(num, record);
  });
  return [...latest.values()];
}

/** Each store's row: { record, store, franchiseeId, franchisee, emailedAt }. */
export function ezRows(ctx) {
  return ezRecords(ctx).map((record) => {
    const store = ctx.storeByNum.get(String(record.store_num)) || null;
    const franchiseeId = store ? store.franchisee_id : record.franchisee_id ?? null;
    return { record, store, franchiseeId, franchisee: franchiseeId != null ? franchiseeName(ctx, franchiseeId) : "", emailedAt: ezEmailedAt(record) };
  });
}

/** Search: "#123" store number, "@name" franchisee, anything else store #, franchisee, status, details or updates. */
function matchesSearch(row, sq) {
  if (!sq.q) return true;
  if (sq.mode === "store") return numRank(row.record.store_num, sq.q) < 9;
  if (sq.mode === "fr") return row.franchisee.toLowerCase().includes(sq.q);
  if (numRank(row.record.store_num, sq.q) < 9) return true;
  return [row.franchisee, row.record.status, richToPlain(row.record.details), richToPlain(row.record.last_update)].join(" ").toLowerCase().includes(sq.q);
}

/** "none": open stores not emailed yet; "sent": open stores already emailed. */
function passesEmail(row, email) {
  if (!email) return true;
  if (!obIsOpen(row.record)) return false;
  return email === "sent" ? !!row.emailedAt : !row.emailedAt;
}

const SORTERS = {
  num: (a, b) => compareNumbers(a.record.store_num, b.record.store_num),
  status: (a, b) => OB_STATES.indexOf(a.record.status) - OB_STATES.indexOf(b.record.status),
  emailed: (a, b) => timeOf(a.emailedAt) - timeOf(b.emailedAt),
  added: (a, b) => timeOf(a.record.created_at) - timeOf(b.record.created_at),
  updated: (a, b) => timeOf(a.record.updated_at || a.record.created_at) - timeOf(b.record.updated_at || b.record.created_at),
};

/** Rows that pass the search and filters, in the chosen order (ties by store number). */
export function filterEzCater(ctx, filter, sq) {
  const sort = filter.sort && typeof filter.sort === "object" ? filter.sort : { key: "status", dir: 1 };
  const sorter = SORTERS[sort.key] || SORTERS.status;
  return ezRows(ctx)
    .filter((row) => (!filter.statuses.length || filter.statuses.includes(row.record.status))
      && (!filter.franchisees.length || filter.franchisees.includes(row.franchiseeId))
      && passesEmail(row, filter.email) && matchesSearch(row, sq))
    .sort((a, b) => (sq.q && sq.mode === "store" ? numRank(a.record.store_num, sq.q) - numRank(b.record.store_num, sq.q) : 0)
      || sorter(a, b) * sort.dir || SORTERS.num(a, b));
}

/** Counts per status, the total, % onboarded, and open stores not emailed yet. All stores, not affected by filters. */
export function ezProgress(ctx) {
  const rows = ezRows(ctx);
  const counts = Object.fromEntries(OB_STATES.map((status) => [status, 0]));
  rows.forEach((row) => { counts[row.record.status] = (counts[row.record.status] || 0) + 1; });
  const total = rows.length;
  const done = counts.Onboarded || 0;
  return {
    counts, total, done, percent: total ? Math.round((done / total) * 100) : 0,
    notEmailed: rows.filter((row) => obIsOpen(row.record) && !row.emailedAt).length,
  };
}

/** Stores still being onboarded on ezCater, for the menu count. */
export const openEzCount = (ctx) => ezRecords(ctx).filter(obIsOpen).length;

/** Franchisees with stores on the ezCater tab, by name, with their store count. */
export function ezFranchisees(ctx) {
  const counts = new Map();
  ezRows(ctx).forEach((row) => { if (row.franchiseeId != null) counts.set(row.franchiseeId, (counts.get(row.franchiseeId) || 0) + 1); });
  return [...counts.entries()].map(([id, count]) => ({ id, name: franchiseeName(ctx, id) || `#${id}`, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
