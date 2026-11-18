/* Concerns (issues) report. */
import { ISSUE_STATES, ISSUE_STATUS_COLOR } from "../../config/constants.js";
import { historyEntries, isIssueOpen, issueDays, issueFranchiseeId, issueNumber, lastActivity, normalizeIssueStatus } from "../../domain/issues.js";
import { issuePlatforms } from "../../domain/records.js";
import { staffForStore } from "../../domain/staff.js";
import { richToPlain } from "../../lib/richText.js";
import { storeInTerritory } from "../reportEngine.js";
import { reportMonth } from "../reportDates.js";
import { average, distinct, franchiseeContactsText, names, percentText, searchToReportFilters } from "./shared.js";

const COLUMN_WIDTHS = { id: 9, store: 10, fr: 28, terr: 10, addr: 30, city: 14, state: 7, title: 44, plat: 22, status: 16, multi: 12, logged: 17, updated: 17, days: 12, nupd: 10, lastact: 40, allact: 60, om: 20, fbc: 20, frcontact: 32 };

const counts = (items) => {
  const byStatus = {};
  items.forEach((item) => { const status = normalizeIssueStatus(item.status); byStatus[status] = (byStatus[status] || 0) + 1; });
  return [items.length, byStatus.Pending || 0, byStatus["Work in Progress"] || 0, byStatus.Resolved || 0];
};

/** "[Pending → Resolved] " or "[Resolved] " before an action. */
function stepLabel(entry) {
  const from = entry.prev ? normalizeIssueStatus(entry.prev) : "";
  const to = entry.status ? normalizeIssueStatus(entry.status) : "";
  if (from && to && from !== to) return `[${from} → ${to}] `;
  return to ? `[${to}] ` : "";
}

export default {
  kind: "issues",
  title: "Issue report",
  file: "issue-report",
  noun: "issue",
  nounPl: "issues",
  emptyText: "No issues match these choices",
  whichLabel: "Which issues",
  tabName: "Issues tab",
  dateLabel: "Date logged",
  mainSheet: "issues",
  mainSheetLabel: "Issues",
  sheetsLabel: "Sheets in the Excel file",
  sheets: [
    ["summary", "Summary", "Totals, status counts, filters used"],
    ["issues", "Issues", "One row per issue per store"],
    ["updates", "Updates / Action taken", "Every step with date, status change and action taken"],
    ["byfr", "By franchisee", "Issue counts per franchisee"],
    ["bystore", "By store", "Issue counts per store"],
    ["bymonth", "By month", "Issue counts per month logged"],
    ["bystatus", "By status", "Issue counts per status"],
  ],
  defSheets: ["summary", "issues", "updates", "byfr", "bystore", "bystatus"],
  cols: [
    ["id", "Issue #"], ["store", "Store #"], ["fr", "Franchisee"], ["terr", "Territory"], ["addr", "Store address"], ["city", "City"], ["state", "State"],
    ["title", "Issue description"], ["plat", "Platforms"], ["status", "Status"], ["multi", "Multi-store (store count)"],
    ["logged", "Date logged"], ["updated", "Last updated"], ["days", "Days open / days to resolve"], ["nupd", "Number of updates"],
    ["lastact", "Latest action taken"], ["allact", "All actions taken (with dates)"], ["om", "OM"], ["fbc", "FBC"], ["frcontact", "Franchisee email / cell"],
  ],
  defOff: ["addr", "frcontact"],
  chips: [{
    key: "status", label: "Status", allLabel: "All statuses", wide: false,
    options: ISSUE_STATES.map((status) => [status, status, ISSUE_STATUS_COLOR[status]]),
    ok: (ctx, issue, selected) => selected.includes(normalizeIssueStatus(issue.status)),
  }],
  items: (ctx) => ctx.issues,
  dateOf: (issue) => issue.created_at,
  frOk: (ctx, issue, id) => (issueFranchiseeId(ctx, issue) || 0) === id,
  storeOk: (ctx, issue, num) => String(issue.store_num || "") === num,
  terrOk: (ctx, issue, territory) => storeInTerritory(ctx, issue.store_num, territory),
  storeExists: (ctx, num) => ctx.storeByNum.has(num) || ctx.issues.some((issue) => String(issue.store_num) === num),
  useTab(ctx, ui) {
    const filter = ui.issueFilter;
    return {
      period: filter.period, date: filter.date, days: filter.days, year: filter.year, from: filter.from, to: filter.to,
      chips: { status: filter.statuses.length ? filter.statuses : ISSUE_STATES },
      ...searchToReportFilters(ctx, ui.search),
    };
  },
  countParts: (ctx, records) => [[records.length, "issue", "issues"], [distinct(records, (issue) => String(issue.store_num || "")), "store", "stores"], [distinct(records, (issue) => issueFranchiseeId(ctx, issue) || 0), "franchisee", "franchisees"]],

  build(ctx, records, state, workbook, h) {
    const issues = records.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const franchiseeOf = (issue) => ctx.frById.get(issueFranchiseeId(ctx, issue));
    const groupSize = (issue) => (issue.group_id ? ctx.issues.filter((item) => item.group_id === issue.group_id).length : 1);

    if (state.sheets.includes("summary")) {
      const [total, pending, wip, resolved] = counts(issues);
      h.summarySheet(workbook, "Issue Report", [{ title: "Totals", rows: [
        ["Issues (per store)", total],
        ["Stores with issues", distinct(issues, (issue) => String(issue.store_num || ""))],
        ["Franchisees with issues", distinct(issues, (issue) => issueFranchiseeId(ctx, issue) || 0)],
        ["Pending", pending], ["Work in Progress", wip], ["Resolved", resolved],
        ["Resolved rate", percentText(resolved, total)],
        ["Average days to resolve", average(issues.filter((issue) => !isIssueOpen(issue)).map(issueDays).filter((value) => value !== ""), "—")],
        ["Total update steps", issues.reduce((sum, issue) => sum + historyEntries(issue).length, 0)],
      ] }], ["Note: a multi-store issue is counted once for each store it was logged to."]);
    }

    if (state.sheets.includes("issues") && state.cols.length) {
      const columns = this.cols.filter(([key]) => state.cols.includes(key));
      const rows = [columns.map(([, label]) => label)];
      issues.forEach((issue) => {
        const store = ctx.storeByNum.get(String(issue.store_num || ""));
        const franchisee = franchiseeOf(issue);
        const team = staffForStore(ctx, store);
        const steps = historyEntries(issue);
        const actions = steps.filter((entry) => entry.kind !== "created" && entry.action);
        const size = groupSize(issue);
        const value = {
          id: issueNumber(issue) || issue.id, store: issue.store_num || "", fr: franchisee ? franchisee.name : "",
          terr: store ? store.territory || "" : franchisee ? franchisee.territory || "" : "", addr: store?.address || "", city: store?.city || "", state: store?.state || "",
          title: richToPlain(issue.title || ""), plat: issuePlatforms(issue).join(", "), status: normalizeIssueStatus(issue.status),
          multi: issue.group_id && size > 1 ? `Yes (${size})` : "No",
          logged: h.date(issue.created_at), updated: h.date(issue.updated_at || issue.created_at), days: issueDays(issue),
          nupd: steps.filter((entry) => entry.kind !== "created").length,
          lastact: richToPlain(issue.action_taken || (actions.length ? actions[actions.length - 1].action : "")),
          allact: actions.map((entry) => `${h.dateText(entry.ts)} — ${stepLabel(entry)}${richToPlain(entry.action)}`).join("\n"),
          om: names(team.om), fbc: names(team.fbc), frcontact: franchiseeContactsText(franchisee),
        };
        rows.push(columns.map(([key]) => value[key]));
      });
      workbook.addSheet("Issues", rows, columns.map(([key]) => COLUMN_WIDTHS[key] || 14), { filter: true });
    }

    if (state.sheets.includes("updates")) {
      const rows = [["Issue #", "Store #", "Franchisee", "Issue description", "Step #", "Date / time", "Step", "From status", "To status", "Action taken"]];
      issues.forEach((issue) => {
        const franchisee = franchiseeOf(issue);
        historyEntries(issue).forEach((entry, index) => {
          const to = entry.status ? normalizeIssueStatus(entry.status) : "";
          const from = entry.prev ? normalizeIssueStatus(entry.prev) : "";
          const created = entry.kind === "created";
          rows.push([issueNumber(issue) || issue.id, issue.store_num || "", franchisee ? franchisee.name : "", richToPlain(issue.title || ""), index + 1, h.date(entry.ts),
            created ? "Issue logged" : from && to && from !== to ? "Status changed" : "Update", created ? "" : from, to, created ? "" : richToPlain(entry.action || "")]);
        });
      });
      workbook.addSheet("Updates", rows, [9, 10, 28, 40, 7, 17, 15, 16, 16, 60], { filter: true });
    }

    const countHeaders = ["Total issues", "Pending", "Work in Progress", "Resolved", "Last activity"];
    const countWithLast = (items) => [...counts(items), h.date(lastActivity(items))];
    if (state.sheets.includes("byfr")) {
      h.groupSheet(workbook, issues, {
        title: "By franchisee", key: (issue) => issueFranchiseeId(ctx, issue) || 0,
        head: (id, items) => { const franchisee = ctx.frById.get(id); return [franchisee ? franchisee.name : "Unknown", franchisee ? franchisee.territory || "" : "", distinct(items, (issue) => String(issue.store_num || ""))]; },
        headers: ["Franchisee", "Territory", "Stores with issues", ...countHeaders], widths: [30, 12, 12, 11, 10, 12, 10, 17], count: countWithLast,
      });
    }
    if (state.sheets.includes("bystore")) {
      h.groupSheet(workbook, issues, {
        title: "By store", key: (issue) => String(issue.store_num || ""),
        head: (num, items) => { const store = ctx.storeByNum.get(num); const franchisee = ctx.frById.get(store ? store.franchisee_id : issueFranchiseeId(ctx, items[0])); return [num, franchisee ? franchisee.name : "", store?.city || "", store?.state || ""]; },
        headers: ["Store #", "Franchisee", "City", "State", ...countHeaders], widths: [10, 30, 16, 7, 11, 10, 12, 10, 17], count: countWithLast,
      });
    }
    if (state.sheets.includes("bymonth")) {
      h.groupSheet(workbook, issues, {
        title: "By month", key: (issue) => reportMonth(issue.created_at, h.tz), head: (month) => [month],
        headers: ["Month logged", ...countHeaders], widths: [14, 11, 10, 12, 10, 17], count: countWithLast, sort: (a, b) => a[0].localeCompare(b[0]),
      });
    }
    if (state.sheets.includes("bystatus")) {
      const rows = [["Status", "Issues", "Share", "Stores", "Franchisees", "Average days open / to resolve"]];
      const selected = state.chips.status || ISSUE_STATES;
      ISSUE_STATES.filter((status) => selected.includes(status)).forEach((status) => {
        const items = issues.filter((issue) => normalizeIssueStatus(issue.status) === status);
        rows.push([status, items.length, issues.length ? `${Math.round((items.length / issues.length) * 1000) / 10}%` : "0%",
          distinct(items, (issue) => String(issue.store_num || "")), distinct(items, (issue) => issueFranchiseeId(ctx, issue) || 0),
          average(items.map(issueDays).filter((value) => value !== ""))]);
      });
      workbook.addSheet("By status", rows, [18, 9, 9, 9, 12, 28], {});
    }
  },
};
