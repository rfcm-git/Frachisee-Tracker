/* Activity report: concerns, onboarding and calls in one timeline. */
import { callHistory } from "../../domain/calls.js";
import { franchiseeName } from "../../domain/context.js";
import { historyEntries, issueFranchiseeId, issueNumber, normalizeIssueStatus } from "../../domain/issues.js";
import { obFranchiseeId, obHistory, obPlatformName, obVisible } from "../../domain/onboarding.js";
import { primaryTerritory } from "../../domain/records.js";
import { richToPlain } from "../../lib/richText.js";
import { franchiseeInTerritory, storeInTerritory } from "../reportEngine.js";

const CATEGORIES = ["Concerns", "Onboarding", "Calls"];

/** Every step of every record as one list of events. Cached per data context. */
const cache = new WeakMap();
function activityEvents(ctx) {
  if (cache.has(ctx)) return cache.get(ctx);
  const events = [];
  ctx.issues.forEach((issue) => historyEntries(issue).forEach((entry) => {
    const created = entry.kind === "created";
    const from = entry.prev ? normalizeIssueStatus(entry.prev) : "";
    const to = entry.status ? normalizeIssueStatus(entry.status) : "";
    events.push({
      cat: "Concerns", at: entry.ts || issue.created_at, store: issue.store_num, fid: issueFranchiseeId(ctx, issue),
      what: created ? "Concern logged" : from && to && from !== to ? `Status: ${from} → ${to}` : "Concern updated",
      detail: created ? richToPlain(issue.title || "") : richToPlain(entry.action || ""), status: normalizeIssueStatus(entry.status || issue.status), ref: issueNumber(issue) ? `#${issueNumber(issue)}` : "",
    });
  }));
  ctx.onboarding.filter(obVisible).forEach((record) => obHistory(record).forEach((entry) => {
    const created = entry.kind === "created";
    events.push({
      cat: "Onboarding", at: entry.ts || record.created_at, store: record.store_num, fid: obFranchiseeId(ctx, record),
      what: `${created ? "Onboarding started" : entry.prev && entry.prev !== entry.status ? `Status: ${entry.prev} → ${entry.status}` : "Onboarding update"} · ${obPlatformName(record.platform)}`,
      detail: created ? richToPlain(record.details || "") : richToPlain(entry.action || ""), status: entry.status || record.status, ref: obPlatformName(record.platform),
    });
  }));
  ctx.callLogs.forEach((call) => callHistory(call).filter((entry) => entry.kind !== "logged").forEach((entry) => events.push({
    cat: "Calls", at: entry.ts, store: call.store_num, fid: call.franchisee_id, frName: call.franchisee_name,
    what: `${entry.kind === "follow-up" ? (entry.closed ? "Follow-up closed" : "Follow-up update") : "Call edited"}${entry.outcome ? ` · ${entry.outcome}` : ""}`,
    detail: entry.note || "", status: entry.closed ? "Follow-up done" : "", next: entry.closed ? null : entry.next || null, ref: "",
  })));
  ctx.callLogs.forEach((call) => events.push({
    cat: "Calls", at: call.call_at, store: call.store_num, fid: call.franchisee_id, frName: call.franchisee_name, what: `Call${call.outcome ? ` · ${call.outcome}` : ""}`,
    detail: `${call.reason || ""}${call.result ? ` — ${call.result}` : ""}`, status: !call.follow_up ? "" : call.follow_up_done_at ? "Follow-up done" : "Follow-up open", ref: "",
  }));
  cache.set(ctx, events);
  return events;
}

const eventName = (ctx, event) => franchiseeName(ctx, event.fid) || event.frName || "";
const COLUMN_WIDTHS = { date: 12, time: 9, cat: 12, store: 9, fr: 28, terr: 9, what: 34, detail: 60, status: 18, ref: 12 };

export default {
  kind: "act",
  title: "Activity report (all categories)",
  file: "activity-report",
  noun: "event",
  nounPl: "events",
  emptyText: "Nothing matches these choices",
  whichLabel: "Which activity",
  dateLabel: "Activity date",
  mainSheet: "timeline",
  mainSheetLabel: "Timeline",
  chips: [{ key: "cat", label: "Category", options: CATEGORIES.map((cat) => [cat, cat]), ok: (ctx, event, selected) => selected.includes(event.cat) }],
  sheets: [["summary", "Summary", "Counts per category"], ["timeline", "Timeline", "Every event in date order"], ["byday", "By day", "Events per day per category"], ["byfr", "By franchisee", "Events per franchisee"], ["bystore", "By store", "Events per store"]],
  defSheets: ["summary", "timeline", "byday"],
  cols: [["date", "Date"], ["time", "Time"], ["cat", "Category"], ["store", "Store #"], ["fr", "Franchisee"], ["terr", "Territory"], ["what", "Event"], ["detail", "Details"], ["status", "Status"], ["ref", "Reference"]],
  defOff: ["ref"],
  items: activityEvents,
  dateOf: (event) => event.at,
  frOk: (ctx, event, id) => event.fid === id,
  storeOk: (ctx, event, num) => String(event.store || "") === num,
  terrOk: (ctx, event, territory) => (event.store ? storeInTerritory(ctx, event.store, territory) : event.fid ? franchiseeInTerritory(ctx, event.fid, territory) : false),
  countParts: (ctx, events) => [[events.length, "event", "events"], ...CATEGORIES.map((cat) => [events.filter((event) => event.cat === cat).length, cat.toLowerCase(), cat.toLowerCase()])],

  build(ctx, selected, state, workbook, h) {
    const events = selected.slice().sort((a, b) => new Date(a.at) - new Date(b.at));
    const byCategory = (cat) => events.filter((event) => event.cat === cat).length;
    if (state.sheets.includes("summary")) {
      h.summarySheet(workbook, "Activity Report", [{ title: "Totals", rows: [
        ["Events", events.length], ["Concern events", byCategory("Concerns")], ["Onboarding events", byCategory("Onboarding")], ["Calls", byCategory("Calls")],
        ["Stores involved", new Set(events.map((event) => event.store).filter(Boolean)).size], ["Franchisees involved", new Set(events.map((event) => event.fid).filter(Boolean)).size],
      ] }]);
    }
    if (state.sheets.includes("timeline") && state.cols.length) {
      const columns = this.cols.filter(([key]) => state.cols.includes(key));
      const rows = [columns.map(([, label]) => label), ...events.map((event) => {
        const store = ctx.storeByNum.get(String(event.store || ""));
        const text = h.dateText(event.at);
        const value = { date: text.slice(0, 10), time: text.slice(11), cat: event.cat, store: event.store || "", fr: eventName(ctx, event), terr: store ? primaryTerritory(store) : "", what: event.what, detail: event.detail, status: event.next ? `Next ${h.dateText(event.next)}` : event.status || "", ref: event.ref || "" };
        return columns.map(([key]) => value[key]);
      })];
      workbook.addSheet("Timeline", rows, columns.map(([key]) => COLUMN_WIDTHS[key] || 14), { filter: true });
    }
    const count = (items) => [items.length, ...CATEGORIES.map((cat) => items.filter((event) => event.cat === cat).length)];
    const countHeaders = ["Events", ...CATEGORIES];
    if (state.sheets.includes("byday")) {
      h.groupSheet(workbook, events, { title: "By day", key: (event) => h.dateText(event.at).slice(0, 10), head: (key) => [key], headers: ["Day", ...countHeaders], widths: [12, 8, 10, 11, 8], count, sort: (a, b) => a[0].localeCompare(b[0]) });
    }
    if (state.sheets.includes("byfr")) {
      h.groupSheet(workbook, events, { title: "By franchisee", key: (event) => event.fid || `n:${event.frName || ""}`, head: (key, items) => [eventName(ctx, items[0]) || "Unknown"], headers: ["Franchisee", ...countHeaders], widths: [30, 8, 10, 11, 8], count });
    }
    if (state.sheets.includes("bystore")) {
      h.groupSheet(workbook, events.filter((event) => event.store), {
        title: "By store", key: (event) => String(event.store),
        head: (num) => { const store = ctx.storeByNum.get(num); return [num, store ? franchiseeName(ctx, store.franchisee_id) : ""]; },
        headers: ["Store #", "Franchisee", ...countHeaders], widths: [9, 28, 8, 10, 11, 8], count,
      });
    }
  },
};
