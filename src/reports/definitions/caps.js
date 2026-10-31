/* CAPs (Corrective Action Plan) report: one row per store. */
import { CAP_DUE_SOON_DAYS, CAP_STATES, CAP_STATUS_COLOR } from "../../config/constants.js";
import { capContact, capDueDate, capDueDays, capDueState, capDueText, capIsOpen, normalizeCapStatus } from "../../domain/caps.js";
import { staffForStore } from "../../domain/staff.js";
import { timeOf } from "../../lib/format.js";
import { compareNumbers } from "../../lib/text.js";
import { storeInTerritory } from "../reportEngine.js";
import { reportMonth } from "../reportDates.js";
import { average, distinct, names, percentText, searchToReportFilters } from "./shared.js";

const COLUMN_WIDTHS = { store: 10, fr: 28, terr: 10, addr: 30, city: 14, state: 7, email: 30, phone: 16, status: 15, due: 12, duestate: 20, added: 17, updated: 17, days: 12, notes: 50, fbc: 20, om: 20 };
const COUNT_HEADERS = ["Total", ...CAP_STATES, "Overdue", "Due soon"];
const DAY = 864e5;

const DUE_OPTIONS = [
  ["overdue", "Overdue"], ["today", "Due today"], ["soon", `Due in ${CAP_DUE_SOON_DAYS} days or less`], ["later", "Due later"],
  ["none", "No due date"], ["done", "Completed (had a due date)"],
];

const counts = (items) => {
  const byStatus = Object.fromEntries(CAP_STATES.map((status) => [status, 0]));
  let overdue = 0;
  let soon = 0;
  items.forEach((record) => {
    byStatus[normalizeCapStatus(record.status)] += 1;
    const state = capDueState(record);
    if (state === "overdue") overdue += 1;
    else if (state === "today" || state === "soon") soon += 1;
  });
  return [items.length, ...CAP_STATES.map((status) => byStatus[status]), overdue, soon];
};

/** Days since added while open; days from added to the last update once Completed. */
function capDays(record) {
  const start = timeOf(record.created_at);
  if (!start) return "";
  const end = capIsOpen(record) ? Date.now() : timeOf(record.updated_at || record.created_at);
  return Math.max(0, Math.floor((end - start) / DAY));
}

const capFranchiseeId = (ctx, record) => ctx.storeByNum.get(String(record.store_num || ""))?.franchisee_id || 0;
const lastOf = (items) => items.map((record) => record.updated_at || record.created_at).sort().pop();

/** CAPs tab due-date filter -> due chips. */
const TAB_DUE = { overdue: ["overdue"], today: ["today"], week: ["today", "soon", "later"], none: ["none"] };

export default {
  kind: "cap",
  title: "CAPs report",
  file: "caps-report",
  noun: "store",
  nounPl: "stores",
  emptyText: "No CAPs match these choices",
  whichLabel: "Which CAPs",
  tabName: "CAPs Monitoring tab",
  dateLabel: "Date added",
  mainSheet: "caps",
  mainSheetLabel: "CAPs",
  sheetsLabel: "Sheets in the Excel file",
  sheets: [
    ["summary", "Summary", "Totals, status counts, completion, due dates, filters used"],
    ["caps", "CAPs", "One row per store"],
    ["due", "Overdue & due soon", `Open CAPs overdue or due within ${CAP_DUE_SOON_DAYS} days`],
    ["byfr", "By franchisee", "CAP counts per franchisee"],
    ["bystatus", "By status", "CAP counts per status"],
    ["bymonth", "By month", "CAP counts per month added"],
  ],
  defSheets: ["summary", "caps", "due", "byfr", "bystatus"],
  cols: [
    ["store", "Store #"], ["fr", "Franchisee"], ["terr", "Territory"], ["addr", "Store address"], ["city", "City"], ["state", "State"],
    ["email", "Email address"], ["phone", "Phone number"], ["status", "Status"], ["due", "Submission due date"], ["duestate", "Due status"],
    ["added", "Date added"], ["updated", "Last updated"], ["days", "Days open / days to complete"], ["notes", "Notes"], ["om", "OM"], ["fbc", "FBC"],
  ],
  defOff: ["addr", "city", "state"],
  chips: [
    { key: "status", label: "Status", allLabel: "All statuses", options: CAP_STATES.map((status) => [status, status, CAP_STATUS_COLOR[status]]),
      ok: (ctx, record, selected) => selected.includes(normalizeCapStatus(record.status)) },
    { key: "due", label: "Submission due date", allLabel: "Any due date", wide: true, options: DUE_OPTIONS,
      ok: (ctx, record, selected) => selected.includes(capDueState(record)) },
    { key: "email", label: "Email", allLabel: "With or without email", options: [["has", "Has email"], ["none", "No email"]],
      ok: (ctx, record, selected) => selected.includes(capContact(ctx, record).email ? "has" : "none") },
  ],
  items: (ctx) => ctx.caps,
  dateOf: (record) => record.created_at,
  frOk: (ctx, record, id) => capFranchiseeId(ctx, record) === id,
  storeOk: (ctx, record, num) => String(record.store_num || "") === num,
  terrOk: (ctx, record, territory) => storeInTerritory(ctx, record.store_num, territory),
  storeExists: (ctx, num) => ctx.storeByNum.has(num) || ctx.caps.some((record) => String(record.store_num) === num),
  useTab(ctx, ui) {
    const filter = ui.capsFilter;
    return {
      period: "all",
      chips: {
        status: filter.statuses.length ? filter.statuses : CAP_STATES,
        due: TAB_DUE[filter.due] || DUE_OPTIONS.map(([key]) => key),
        email: filter.email ? [filter.email] : ["has", "none"],
      },
      ...searchToReportFilters(ctx, ui.search),
    };
  },
  countParts: (ctx, records) => [[records.length, "store", "stores"], [distinct(records, (record) => capFranchiseeId(ctx, record)), "franchisee", "franchisees"]],

  build(ctx, selected, state, workbook, h) {
    const records = selected.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || compareNumbers(a.store_num, b.store_num));

    if (state.sheets.includes("summary")) {
      const [total, ...rest] = counts(records);
      const byStatus = rest.slice(0, CAP_STATES.length);
      const [overdue, soon] = rest.slice(CAP_STATES.length);
      const completed = byStatus[CAP_STATES.indexOf("Completed")];
      const withDue = records.filter((record) => capDueDate(record)).length;
      h.summarySheet(workbook, "CAPs Report", [
        { title: "Totals", rows: [
          ["Stores in CAPs", total],
          ["Franchisees", distinct(records, (record) => capFranchiseeId(ctx, record))],
          ...CAP_STATES.map((status, index) => [status, byStatus[index]]),
          ["Completion rate", percentText(completed, total)],
          ["Average days to complete", average(records.filter((record) => !capIsOpen(record)).map(capDays).filter((value) => value !== ""), "—")],
        ] },
        { title: "Submission due dates", rows: [
          ["With a due date", withDue], ["Without a due date", total - withDue],
          ["Open and overdue", overdue], [`Open and due within ${CAP_DUE_SOON_DAYS} days (today included)`, soon],
        ] },
      ], ["Note: franchisee, email and phone come from the store records unless they were changed on the CAP."]);
    }

    if (state.sheets.includes("caps") && state.cols.length) {
      const columns = this.cols.filter(([key]) => state.cols.includes(key));
      const rows = [columns.map(([, label]) => label)];
      records.forEach((record) => {
        const store = ctx.storeByNum.get(String(record.store_num || ""));
        const contact = capContact(ctx, record);
        const team = staffForStore(ctx, store);
        const value = {
          store: record.store_num || "", fr: contact.name, terr: store?.territory || "", addr: store?.address || "", city: store?.city || "", state: store?.state || "",
          email: contact.email, phone: contact.phone, status: normalizeCapStatus(record.status),
          due: capDueDate(record), duestate: capIsOpen(record) ? capDueText(record) : capDueDate(record) ? "Completed" : "",
          added: h.date(record.created_at), updated: h.date(record.updated_at || record.created_at), days: capDays(record),
          notes: record.notes || "", om: names(team.om), fbc: names(team.fbc),
        };
        rows.push(columns.map(([key]) => value[key]));
      });
      workbook.addSheet("CAPs", rows, columns.map(([key]) => COLUMN_WIDTHS[key] || 14), { filter: true });
    }

    if (state.sheets.includes("due")) {
      const due = records.filter((record) => ["overdue", "today", "soon"].includes(capDueState(record)))
        .sort((a, b) => capDueDays(a) - capDueDays(b) || compareNumbers(a.store_num, b.store_num));
      const rows = [["Store #", "Franchisee", "Email address", "Phone number", "Status", "Submission due date", "Due status", "Notes"]];
      due.forEach((record) => {
        const contact = capContact(ctx, record);
        rows.push([record.store_num || "", contact.name, contact.email, contact.phone, normalizeCapStatus(record.status), capDueDate(record), capDueText(record), record.notes || ""]);
      });
      workbook.addSheet("Overdue & due soon", rows, [10, 28, 30, 16, 15, 12, 20, 50], { filter: true });
    }

    const countWithLast = (items) => [...counts(items), h.date(lastOf(items))];
    if (state.sheets.includes("byfr")) {
      h.groupSheet(workbook, records, {
        title: "By franchisee", key: (record) => capFranchiseeId(ctx, record),
        head: (id, items) => { const franchisee = ctx.frById.get(id); return [franchisee ? franchisee.name : "Not in store records", franchisee ? franchisee.territory || "" : "", percentText(items.filter((record) => !capIsOpen(record)).length, items.length)]; },
        headers: ["Franchisee", "Territory", "Completion", ...COUNT_HEADERS, "Last activity"], widths: [30, 10, 11, 8, 14, 11, 11, 11, 9, 9, 17], count: countWithLast,
      });
    }
    if (state.sheets.includes("bystatus")) {
      const rows = [["Status", "Stores", "Share", "Franchisees", "Overdue", "Average days open / to complete"]];
      const chosen = state.chips.status || CAP_STATES;
      CAP_STATES.filter((status) => chosen.includes(status)).forEach((status) => {
        const items = records.filter((record) => normalizeCapStatus(record.status) === status);
        rows.push([status, items.length, percentText(items.length, records.length, "0%"), distinct(items, (record) => capFranchiseeId(ctx, record)),
          items.filter((record) => capDueState(record) === "overdue").length, average(items.map(capDays).filter((value) => value !== ""))]);
      });
      workbook.addSheet("By status", rows, [16, 9, 9, 12, 9, 28], {});
    }
    if (state.sheets.includes("bymonth")) {
      h.groupSheet(workbook, records, {
        title: "By month", key: (record) => reportMonth(record.created_at, h.tz), head: (month) => [month],
        headers: ["Month added", ...COUNT_HEADERS, "Last activity"], widths: [14, 8, 14, 11, 11, 11, 9, 9, 17], count: countWithLast, sort: (a, b) => a[0].localeCompare(b[0]),
      });
    }
  },
};
