/* Call logs: filters, names and contact details. */
import { addDays, parseLocalDate, startOfDay, startOfWeek } from "../lib/format.js";
import { digitsOnly, normalizeName } from "../lib/text.js";
import { contactsOf } from "./records.js";
import { franchiseeContactMatch, numRank } from "./search.js";

export const DEFAULT_CALL_FILTERS = Object.freeze({ range: "all", from: "", to: "", fr: "", store: "", outcome: "" });

export const hasOpenFollowUp = (call) => !!call.follow_up && !call.follow_up_done_at;

/** Read call update history without changing the saved record. */
export function callHistory(call) {
  try {
    const raw = call?.history;
    const entries = Array.isArray(raw) ? raw : typeof raw === "string" ? JSON.parse(raw || "[]") : [];
    return (Array.isArray(entries) ? entries : []).slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
  } catch {
    return [];
  }
}

/** "Call logged", "Follow-up update", "Follow-up closed", "Call edited" or "Update". */
export const callUpdateLabel = (entry) => (entry.kind === "logged" ? "Call logged"
  : entry.kind === "follow-up" ? (entry.closed ? "Follow-up closed" : "Follow-up update")
    : entry.kind === "edited" ? "Call edited" : "Update");

export const latestCallUpdate =(call) => callHistory(call).filter((entry) => entry.note).at(-1) || null;

export const callFollowUpDue = (call, now = Date.now()) => hasOpenFollowUp(call)
  && !!call.next_follow_up_at && new Date(call.next_follow_up_at).getTime() <= now;

/** True when a follow-up time is more than a minute in the past. */
export const followUpTimeInPast = (date, now = Date.now()) => date.getTime() < now - 60_000;

/** Time of the latest update (ms). Logging the call itself is not an update. */
export function callLastActivity(call) {
  const timestamps = [call?.call_at, ...callHistory(call).filter((entry) => entry.kind !== "logged").map((entry) => entry.ts)]
    .map((value) => new Date(value).getTime()).filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : 0;
}

/** "open" | "done" | "none" */
export const followUpState = (call) => (!call.follow_up ? "none" : call.follow_up_done_at ? "done" : "open");

/** Current franchisee name, or the name saved on the call when the franchisee was removed. */
export function callFranchiseeName(ctx, call) {
  const franchisee = call.franchisee_id ? ctx.frById.get(call.franchisee_id) : null;
  return franchisee ? franchisee.name : (call.franchisee_name || "—");
}

/** Name the call was logged under, when it differs from the current name. */
export function callPreviousName(ctx, call) {
  const current = callFranchiseeName(ctx, call);
  return call.franchisee_id && current !== call.franchisee_name && call.franchisee_name ? call.franchisee_name : "";
}

/** Phones and emails of a franchisee. */
export function franchiseeContactBits(ctx, franchiseeId) {
  const franchisee = franchiseeId ? ctx.frById.get(franchiseeId) : null;
  const contacts = franchisee ? contactsOf(franchisee).filter((contact) => contact.value) : [];
  return {
    phones: contacts.filter((contact) => contact.type === "cell" || contact.type === "phone").map((contact) => contact.value),
    emails: contacts.filter((contact) => contact.type === "email").map((contact) => contact.value),
  };
}

/** [from, to) for the Call Logs date filter. */
export function callRange(filters, now = new Date()) {
  const today = startOfDay(now);
  switch (filters.range) {
    case "today": return [today, addDays(today, 1)];
    case "week": { const from = startOfWeek(now); return [from, addDays(from, 7)]; }
    case "month": return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
    case "30": { const to = addDays(today, 1); return [addDays(to, -30), to]; }
    case "custom": {
      const to = parseLocalDate(filters.to);
      return [parseLocalDate(filters.from), to ? addDays(to, 1) : null];
    }
    default: return [null, null];
  }
}

export const anyCallFilter = (filters, search) => !!(filters.range !== "all" || filters.fr || filters.store || filters.outcome || String(search || "").trim());

/** Calls matching the Call Logs filters and the toolbar search. */
export function filterCalls(ctx, filters, sq) {
  const [from, to] = callRange(filters);
  const frQuery = normalizeName(filters.fr);
  const storeQuery = String(filters.store || "").trim().replace(/^#/, "");
  return ctx.callLogs.filter((call) => {
    const date = new Date(callLastActivity(call));
    if (from && !(date >= from)) return false;
    if (to && !(date < to)) return false;
    if (frQuery && !normalizeName(callFranchiseeName(ctx, call)).includes(frQuery) && !normalizeName(call.franchisee_name).includes(frQuery)) return false;
    if (storeQuery && String(call.store_num || "") !== storeQuery) return false;
    if (filters.outcome) {
      if (filters.outcome === "__fu_open") { if (!hasOpenFollowUp(call)) return false; }
      else if (filters.outcome === "__fu_done") { if (!(call.follow_up && call.follow_up_done_at)) return false; }
      else if (filters.outcome === "__none") { if (call.outcome) return false; }
      else if (call.outcome !== filters.outcome) return false;
    }
    if (!sq.q) return true;
    if (sq.mode === "store") return numRank(call.store_num, sq.q) < 9;
    if (sq.mode === "fr") return normalizeName(callFranchiseeName(ctx, call)).includes(normalizeName(sq.q)) || normalizeName(call.franchisee_name).includes(normalizeName(sq.q));
    return [callFranchiseeName(ctx, call), call.franchisee_name, call.store_num, call.reason, call.result, call.outcome].join(" ").toLowerCase().includes(sq.q)
      || (sq.phoneLike && digitsOnly(call.store_num).includes(sq.d))
      || franchiseeContactMatch(ctx, call.franchisee_id, sq);
  });
}
