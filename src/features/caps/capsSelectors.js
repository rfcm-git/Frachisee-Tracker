/* CAPs Monitoring: search, filters, sorting and the progress numbers. */
import { CAP_STATES } from "../../config/constants.js";
import { capContact, capsSummary, normalizeCapStatus } from "../../domain/caps.js";
import { primaryTerritory } from "../../domain/records.js";
import { numRank } from "../../domain/search.js";
import { timeOf } from "../../lib/format.js";
import { compareNumbers, digitsOnly } from "../../lib/text.js";

/** Each record with its shown name / email / phone. */
export const capRows = (ctx) => ctx.caps.map((record) => ({ record, contact: capContact(ctx, record) }));

/** Search: "#123" store number, "@name" franchisee, anything else store #, name, email, phone or notes. */
function matchesSearch(row, sq) {
  if (!sq.q) return true;
  const { record, contact } = row;
  if (sq.mode === "store") return numRank(record.store_num, sq.q) < 9;
  if (sq.mode === "fr") return contact.name.toLowerCase().includes(sq.q);
  if (numRank(record.store_num, sq.q) < 9) return true;
  if ([contact.name, contact.email, contact.phone, record.notes, normalizeCapStatus(record.status)].join(" ").toLowerCase().includes(sq.q)) return true;
  return sq.phoneLike && digitsOnly(contact.phone).includes(sq.d);
}

function passesFilters(row, filter) {
  if (filter.statuses.length && !filter.statuses.includes(normalizeCapStatus(row.record.status))) return false;
  if (filter.email === "has" && !row.contact.email) return false;
  if (filter.email === "none" && row.contact.email) return false;
  return true;
}

const SORTERS = {
  num: (a, b) => compareNumbers(a.record.store_num, b.record.store_num),
  status: (a, b) => CAP_STATES.indexOf(normalizeCapStatus(a.record.status)) - CAP_STATES.indexOf(normalizeCapStatus(b.record.status)),
  added: (a, b) => timeOf(a.record.created_at) - timeOf(b.record.created_at),
  updated: (a, b) => timeOf(a.record.updated_at || a.record.created_at) - timeOf(b.record.updated_at || b.record.created_at),
};

/** Rows that pass the search and filters, in the chosen order (ties by store number). */
export function filterCaps(ctx, filter, sq) {
  const sorter = SORTERS[filter.sort.key] || SORTERS.added;
  return capRows(ctx)
    .filter((row) => passesFilters(row, filter) && matchesSearch(row, sq))
    .sort((a, b) => sorter(a, b) * filter.sort.dir || SORTERS.num(a, b));
}

/** Records still open (not Completed), for the menu count. */
export const openCapsCount = (ctx) => ctx.caps.filter((record) => normalizeCapStatus(record.status) !== "Completed").length;

/** Progress numbers from all records, or the stores of one territory (dashboard). Filters do not change them. */
export function capsProgress(ctx, territory = "") {
  if (!territory) return capsSummary(ctx.caps);
  return capsSummary(ctx.caps.filter((record) => {
    const store = ctx.storeByNum.get(String(record.store_num));
    return store && primaryTerritory(store) === territory;
  }));
}
