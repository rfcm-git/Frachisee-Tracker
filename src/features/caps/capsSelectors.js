/* CAP tab: search, filters, sorting and the progress numbers. */
import { CAP_STATES } from "../../config/constants.js";
import { capContact, capDueDays, capDueState, capAssessmentId, capsSummary, normalizeCapStatus } from "../../domain/caps.js";
import { primaryTerritory } from "../../domain/records.js";
import { numRank } from "../../domain/search.js";
import { timeOf } from "../../lib/format.js";
import { compareNumbers, digitsOnly } from "../../lib/text.js";

/** Each record with its shown name / email / phone. */
export const capRows = (ctx) => ctx.caps.map((record) => ({ record, contact: capContact(ctx, record) }));

/** Search: "#123" store number, "@name" franchisee, anything else store #, Assessment ID, name, email, phone, status or notes. */
function matchesSearch(row, sq) {
  if (!sq.q) return true;
  const { record, contact } = row;
  if (sq.mode === "store") return numRank(record.store_num, sq.q) < 9;
  if (sq.mode === "fr") return contact.name.toLowerCase().includes(sq.q);
  if (numRank(record.store_num, sq.q) < 9) return true;
  if (capAssessmentId(record).toLowerCase().includes(sq.q)) return true;
  if ([contact.name, contact.email, contact.phone, record.notes, normalizeCapStatus(record.status)].join(" ").toLowerCase().includes(sq.q)) return true;
  return sq.phoneLike && digitsOnly(contact.phone).includes(sq.d);
}

/**
 * Search by store # or Assessment ID finds a CAP even when the filters hide it (e.g. a Completed one):
 * the whole number / ID, or its start once 3 or more characters are typed.
 */
function matchesIdPastFilters(row, sq) {
  if (!sq.q || sq.mode === "fr") return false;
  const hit = (value) => {
    const text = String(value || "").toLowerCase();
    return !!text && (text === sq.q || (sq.q.length >= 3 && text.startsWith(sq.q)));
  };
  return hit(row.record.store_num) || (sq.mode !== "store" && hit(capAssessmentId(row.record)));
}

/** Due date filter: "overdue", "today", "week" (due today through the next 7 days), "none" (no due date). Completed CAPs only match "none". */
function passesDue(record, due, now) {
  if (!due) return true;
  if (due === "none") return capDueDays(record, now) === null;
  const state = capDueState(record, now);
  if (due === "overdue") return state === "overdue";
  if (due === "today") return state === "today";
  return (state === "today" || state === "soon" || state === "later") && capDueDays(record, now) <= 7;
}

function passesFilters(row, filter, now) {
  if (filter.statuses.length && !filter.statuses.includes(normalizeCapStatus(row.record.status))) return false;
  if (filter.email === "has" && !row.contact.email) return false;
  if (filter.email === "none" && row.contact.email) return false;
  if (filter.assessment === "has" && !capAssessmentId(row.record)) return false;
  if (filter.assessment === "none" && capAssessmentId(row.record)) return false;
  return passesDue(row.record, filter.due, now);
}

const SORTERS = {
  num: (a, b) => compareNumbers(a.record.store_num, b.record.store_num),
  aid: (a, b) => compareNumbers(capAssessmentId(a.record), capAssessmentId(b.record)),
  status: (a, b) => CAP_STATES.indexOf(normalizeCapStatus(a.record.status)) - CAP_STATES.indexOf(normalizeCapStatus(b.record.status)),
  added: (a, b) => timeOf(a.record.created_at) - timeOf(b.record.created_at),
  updated: (a, b) => timeOf(a.record.updated_at || a.record.created_at) - timeOf(b.record.updated_at || b.record.created_at),
  due: (a, b) => String(a.record.due_date || "").localeCompare(String(b.record.due_date || "")),
};

/** Records without a due date (or Assessment ID) go last whichever way that column is sorted. */
const missingDueLast = (a, b) => (!a.record.due_date) - (!b.record.due_date);
const missingAssessmentLast = (a, b) => (!capAssessmentId(a.record)) - (!capAssessmentId(b.record));

/**
 * Rows that pass the search and filters, in the chosen order (ties by store number).
 * A store # or Assessment ID search also brings rows the filters hide; those get outsideFilters: true.
 */
export function filterCaps(ctx, filter, sq, now = new Date()) {
  const sorter = SORTERS[filter.sort.key] || SORTERS.added;
  const missingLast = filter.sort.key === "due" ? missingDueLast : filter.sort.key === "aid" ? missingAssessmentLast : null;
  return capRows(ctx)
    .filter((row) => {
      if (passesFilters(row, filter, now)) return matchesSearch(row, sq);
      if (!matchesIdPastFilters(row, sq)) return false;
      row.outsideFilters = true;
      return true;
    })
    .sort((a, b) => (missingLast && missingLast(a, b)) || sorter(a, b) * filter.sort.dir || SORTERS.num(a, b));
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
