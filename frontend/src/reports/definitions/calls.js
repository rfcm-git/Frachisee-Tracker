/* Call log report. */
import { CALL_ANSWERED } from "../../config/constants.js";
import { callFranchiseeName, callHistory, callLastActivity, franchiseeContactBits, followUpState, hasOpenFollowUp, latestCallUpdate } from "../../domain/calls.js";
import { primaryTerritory } from "../../domain/records.js";
import { staffForStore } from "../../domain/staff.js";
import { franchiseeInTerritory, storeInTerritory } from "../reportEngine.js";
import { distinct, names, percentText } from "./shared.js";

const COLUMN_WIDTHS = { date: 12, time: 9, fr: 28, phone: 16, email: 28, store: 9, city: 14, terr: 9, reason: 44, result: 48, outcome: 20, fu: 12, fudone: 17, logged: 17, edited: 17, fbc: 16, om: 16 };
const answered = (calls) => calls.filter((call) => CALL_ANSWERED.includes(call.outcome)).length;
const unanswered = (calls) => calls.filter((call) => call.outcome === "No answer / voicemail").length;
const caller = (call) => call.franchisee_id || call.franchisee_name;

const UPDATE_KIND = { logged: "Logged", edited: "Edited" };

/** Every history entry of a call, one per line, with its date. */
const updatesText = (call, h) => callHistory(call).map((entry) => {
  const kind = entry.kind === "follow-up" ? (entry.closed ? "Follow-up closed" : "Follow-up") : UPDATE_KIND[entry.kind] || "Update";
  return `${h.dateText(entry.ts)} — ${kind}${entry.outcome ? ` [${entry.outcome}]` : ""}${entry.note ? `: ${entry.note}` : ""}${entry.next ? ` (next ${h.dateText(entry.next)})` : ""}`;
}).join("\n");

/** Call Logs date range -> report period. */
function periodFromCallRange(filters) {
  const map = { all: "all", today: "today", week: "thisweek", month: "thismonth", 30: "lastdays" };
  const patch = { period: map[filters.range] || "range" };
  if (filters.range === "30") patch.days = 30;
  if (filters.range === "custom") { patch.from = filters.from; patch.to = filters.to; }
  return patch;
}

export default {
  kind: "cl",
  title: "Call log report",
  file: "call-log-report",
  noun: "call",
  nounPl: "calls",
  emptyText: "Nothing matches these choices",
  whichLabel: "Which calls",
  tabName: "Call Logs tab",
  dateLabel: "Call date",
  mainSheet: "calls",
  mainSheetLabel: "Calls",
  chips: [
    { key: "outcome", label: "Outcome", wide: true, options: [["Answered", "Answered"], ["No answer / voicemail", "No answer / voicemail"], ["Follow-up required", "Follow-up required"], ["Requested more info", "Requested more info"], ["Completed", "Completed"], ["__none", "Not set"]],
      ok: (ctx, call, selected) => selected.includes(call.outcome || "__none") },
    { key: "fu", label: "Follow-up", options: [["open", "Open"], ["done", "Done"], ["none", "No follow-up"]], ok: (ctx, call, selected) => selected.includes(followUpState(call)) },
  ],
  sheets: [
    ["summary", "Summary", "Filters, totals, answered vs unanswered, follow-ups"], ["calls", "Calls", "One row per call"], ["followups", "Open follow-ups", "Calls still waiting for a follow-up"],
    ["byfr", "By franchisee", "Calls per franchisee"], ["bystore", "By store", "Calls per store"], ["byoutcome", "By outcome", "Calls per outcome"], ["byday", "By day", "Calls per day"],
  ],
  defSheets: ["summary", "calls", "followups", "byfr"],
  cols: [
    ["date", "Date"], ["time", "Time"], ["fr", "Franchisee"], ["phone", "Franchisee phone"], ["email", "Franchisee email"], ["store", "Store #"], ["city", "Store city"], ["terr", "Territory"],
    ["reason", "Reason for call"], ["result", "Result of call"], ["outcome", "Outcome"], ["fu", "Follow-up"], ["fudone", "Follow-up done"], ["next", "Next follow-up"], ["latest", "Latest update"], ["lastat", "Latest update time"], ["nupd", "Updates"], ["allupd", "All updates (with dates)"], ["logged", "Logged"], ["edited", "Last edited"], ["fbc", "FBC"], ["om", "OM"],
  ],
  defOff: ["city", "logged", "edited", "fbc", "om", "lastat", "allupd"],
  items: (ctx) => ctx.callLogs,
  dateOf: (call) => call.call_at,
  frOk: (ctx, call, id) => call.franchisee_id === id,
  storeOk: (ctx, call, num) => String(call.store_num || "") === num,
  terrOk: (ctx, call, territory) => (call.store_num ? storeInTerritory(ctx, call.store_num, territory) : call.franchisee_id ? franchiseeInTerritory(ctx, call.franchisee_id, territory) : false),
  useTab: (ctx, ui) => ({ ...periodFromCallRange(ui.callFilters), fr: ui.callFilters.fr || "", store: ui.callFilters.store || "" }),
  countParts: (ctx, calls) => [[calls.length, "call", "calls"], [distinct(calls, caller), "franchisee", "franchisees"], [calls.filter(hasOpenFollowUp).length, "open follow-up", "open follow-ups"]],

  build(ctx, selected, state, workbook, h) {
    const calls = selected.slice().sort((a, b) => new Date(a.call_at) - new Date(b.call_at));
    if (state.sheets.includes("summary")) {
      const followUps = calls.filter((call) => call.follow_up);
      const done = followUps.filter((call) => call.follow_up_done_at).length;
      h.summarySheet(workbook, "Call Log Report", [{ title: "Totals", rows: [
        ["Calls", calls.length], ["Franchisees called", distinct(calls, caller)], ["Stores mentioned", new Set(calls.map((call) => call.store_num).filter(Boolean)).size],
        ["Answered (Answered, Requested more info, Completed)", answered(calls)], ["Unanswered (No answer / voicemail)", unanswered(calls)], ["Outcome not set", calls.filter((call) => !call.outcome).length],
        ["Follow-ups requested", followUps.length], ["Follow-ups done", done], ["Follow-ups still open", followUps.length - done], ["Follow-up completion", percentText(done, followUps.length)],
      ] }]);
    }
    const rowOf = (call, columns) => {
      const contacts = franchiseeContactBits(ctx, call.franchisee_id);
      const store = ctx.storeByNum.get(String(call.store_num || ""));
      const team = staffForStore(ctx, store);
      const text = h.dateText(call.call_at);
      const value = {
        date: text.slice(0, 10), time: text.slice(11), fr: callFranchiseeName(ctx, call), phone: contacts.phones.join(", "), email: contacts.emails.join(", "),
        store: call.store_num || "General", city: store?.city || "", terr: store ? primaryTerritory(store) : "", reason: call.reason || "", result: call.result || "", outcome: call.outcome || "",
        next: call.next_follow_up_at && hasOpenFollowUp(call) ? h.date(call.next_follow_up_at) : "", latest: latestCallUpdate(call)?.note || "",
        lastat: h.date(new Date(callLastActivity(call)).toISOString()), nupd: callHistory(call).length, allupd: updatesText(call, h),
        fu: !call.follow_up ? "No" : call.follow_up_done_at ? "Done" : "Open", fudone: call.follow_up_done_at ? h.date(call.follow_up_done_at) : "",
        logged: h.date(call.created_at), edited: h.date(call.updated_at), fbc: names(team.fbc), om: names(team.om),
      };
      return columns.map(([key]) => value[key]);
    };
    if (state.sheets.includes("calls") && state.cols.length) {
      const columns = this.cols.filter(([key]) => state.cols.includes(key));
      workbook.addSheet("Calls", [columns.map(([, label]) => label), ...calls.map((call) => rowOf(call, columns))], columns.map(([key]) => COLUMN_WIDTHS[key] || 14), { filter: true });
    }
    if (state.sheets.includes("followups")) {
      const columns = this.cols.filter(([key]) => ["date", "time", "fr", "phone", "email", "store", "reason", "result"].includes(key));
      workbook.addSheet("Open follow-ups", [columns.map(([, label]) => label), ...calls.filter(hasOpenFollowUp).map((call) => rowOf(call, columns))], columns.map(([key]) => COLUMN_WIDTHS[key]), { filter: true });
    }
    const count = (items) => [items.length, answered(items), unanswered(items), items.filter(hasOpenFollowUp).length, h.date(items.map((call) => call.call_at).sort().pop())];
    const countHeaders = ["Calls", "Answered", "Unanswered", "Open follow-ups", "Last call"];
    if (state.sheets.includes("byfr")) {
      h.groupSheet(workbook, calls, {
        title: "By franchisee", key: (call) => call.franchisee_id || `n:${call.franchisee_name}`,
        head: (key, items) => { const contacts = franchiseeContactBits(ctx, items[0].franchisee_id); return [callFranchiseeName(ctx, items[0]), contacts.phones.join(", "), contacts.emails.join(", ")]; },
        headers: ["Franchisee", "Phone", "Email", ...countHeaders], widths: [28, 16, 28, 8, 10, 11, 14, 17], count,
      });
    }
    if (state.sheets.includes("bystore")) {
      h.groupSheet(workbook, calls.filter((call) => call.store_num), {
        title: "By store", key: (call) => String(call.store_num),
        head: (num, items) => [num, callFranchiseeName(ctx, items[0]), ctx.storeByNum.get(num)?.city || ""],
        headers: ["Store #", "Franchisee", "City", ...countHeaders], widths: [9, 28, 14, 8, 10, 11, 14, 17], count,
      });
    }
    if (state.sheets.includes("byoutcome")) {
      h.groupSheet(workbook, calls, { title: "By outcome", key: (call) => call.outcome || "Not set", head: (key) => [key], headers: ["Outcome", ...countHeaders], widths: [22, 8, 10, 11, 14, 17], count });
    }
    if (state.sheets.includes("byday")) {
      h.groupSheet(workbook, calls, {
        title: "By day", key: (call) => h.dateText(call.call_at).slice(0, 10), head: (key) => [key],
        headers: ["Day", ...countHeaders], widths: [12, 8, 10, 11, 14, 17], count, sort: (a, b) => a[0].localeCompare(b[0]),
      });
    }
  },
};
