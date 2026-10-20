/* Onboarding report (one row per store + platform). */
import { OB_PLATFORMS, OB_STATES, OB_STATUS_COLOR } from "../../config/constants.js";
import { obDays, obFranchiseeId, obHistory, obPlatformName, obVisible } from "../../domain/onboarding.js";
import { platformStatus } from "../../domain/records.js";
import { staffForStore } from "../../domain/staff.js";
import { compareNumbers } from "../../lib/text.js";
import { richToPlain } from "../../lib/richText.js";
import { storeInTerritory } from "../reportEngine.js";
import { reportMonth } from "../reportDates.js";
import { average, distinct, franchiseeContactsText, names, percentText, searchToReportFilters } from "./shared.js";

const COLUMN_WIDTHS = { store: 10, fr: 28, terr: 10, addr: 30, city: 14, state: 7, plat: 12, status: 22, storeplat: 16, req: 12, details: 44, lastupd: 40, allupd: 60, started: 17, updated: 17, days: 12, nupd: 10, fbc: 18, om: 18, frcontact: 32 };
const COUNT_HEADERS = ["Total", "Pending", "Email Sent/Text Message", "Work in Progress", "Onboarded"];

const counts = (items) => {
  const byStatus = {};
  items.forEach((item) => { byStatus[item.status] = (byStatus[item.status] || 0) + 1; });
  return [items.length, byStatus.Pending || 0, byStatus["Email Sent/Text Message"] || 0, byStatus["Work in Progress"] || 0, byStatus.Onboarded || 0];
};

const lastOf = (items) => items.map((item) => item.updated_at || item.created_at).sort().pop();

export default {
  kind: "ob",
  title: "Onboarding report",
  file: "onboarding-report",
  noun: "record",
  nounPl: "records",
  emptyText: "No onboarding records match these choices",
  whichLabel: "Which onboarding records",
  tabName: "Onboarding tab",
  dateLabel: "Date started",
  mainSheet: "records",
  mainSheetLabel: "Records",
  sheetsLabel: "Sheets in the Excel file",
  sheets: [
    ["summary", "Summary", "Totals, status and platform counts, filters used"],
    ["records", "Records", "One row per store + platform"],
    ["updates", "Updates / Progress", "Every step with date, status change and note"],
    ["matrix", "Store × platform", "One row per store, a column per platform"],
    ["byfr", "By franchisee", "Counts per franchisee"],
    ["bystore", "By store", "Counts per store"],
    ["byplat", "By platform", "Counts per platform and status"],
    ["bymonth", "By month", "Counts per month started"],
  ],
  defSheets: ["summary", "records", "updates", "matrix", "byplat", "bystore"],
  cols: [
    ["store", "Store #"], ["fr", "Franchisee"], ["terr", "Territory"], ["addr", "Store address"], ["city", "City"], ["state", "State"],
    ["plat", "Platform"], ["status", "Onboarding status"], ["storeplat", "Store platform status now"], ["req", "Request (store × platform count)"],
    ["details", "Details"], ["lastupd", "Latest update"], ["allupd", "All updates (with dates)"], ["started", "Date started"], ["updated", "Last updated"],
    ["days", "Days in progress / days to onboard"], ["nupd", "Number of updates"], ["fbc", "FBC"], ["om", "OM"], ["frcontact", "Franchisee email / cell"],
  ],
  defOff: ["addr", "frcontact", "req"],
  chips: [
    { key: "plat", label: "Platform", allLabel: "All platforms", options: OB_PLATFORMS, ok: (ctx, record, selected) => selected.includes(record.platform) },
    { key: "status", label: "Status", allLabel: "All statuses", wide: true, options: OB_STATES.map((status) => [status, status, OB_STATUS_COLOR[status]]), ok: (ctx, record, selected) => selected.includes(record.status) },
  ],
  items: (ctx) => ctx.onboarding.filter(obVisible),
  dateOf: (record) => record.created_at,
  frOk: (ctx, record, id) => obFranchiseeId(ctx, record) === id,
  storeOk: (ctx, record, num) => String(record.store_num || "") === num,
  terrOk: (ctx, record, territory) => storeInTerritory(ctx, record.store_num, territory),
  storeExists: (ctx, num) => ctx.storeByNum.has(num) || ctx.onboarding.some((record) => String(record.store_num) === num),
  useTab(ctx, ui) {
    const filter = ui.obFilter;
    const statuses = [...new Set([...filter.threePd, ...filter.ezCater])];
    return {
      chips: { plat: filter.platforms.length ? filter.platforms : OB_PLATFORMS.map(([key]) => key), status: statuses.length ? statuses : OB_STATES },
      ...searchToReportFilters(ctx, ui.search),
    };
  },
  countParts: (ctx, records) => [[records.length, "record", "records"], [distinct(records, (record) => String(record.store_num || "")), "store", "stores"], [distinct(records, (record) => obFranchiseeId(ctx, record)), "franchisee", "franchisees"]],

  build(ctx, selected, state, workbook, h) {
    const records = selected.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || compareNumbers(a.store_num, b.store_num));
    const franchiseeOf = (record) => ctx.frById.get(obFranchiseeId(ctx, record));
    const platforms = OB_PLATFORMS.filter(([key]) => (state.chips.plat || []).includes(key));

    if (state.sheets.includes("summary")) {
      const [total, pending, sent, wip, done] = counts(records);
      h.summarySheet(workbook, "Onboarding Report", [
        { title: "Totals", rows: [
          ["Records (store + platform)", total], ["Stores", distinct(records, (record) => String(record.store_num || ""))], ["Franchisees", distinct(records, (record) => obFranchiseeId(ctx, record))],
          ["Pending", pending], ["Email Sent/Text Message", sent], ["Work in Progress", wip], ["Onboarded", done],
          ["Onboarded rate", percentText(done, total)],
          ["Average days to onboard", average(records.filter((record) => record.status === "Onboarded").map(obDays).filter((value) => value !== ""), "—")],
        ] },
        { title: "By platform", value: "Total / Pending / Email-Text / Work in Progress / Onboarded",
          rows: platforms.map(([key, name]) => [name, counts(records.filter((record) => record.platform === key)).join(" / ")]) },
      ]);
    }

    if (state.sheets.includes("records") && state.cols.length) {
      const columns = this.cols.filter(([key]) => state.cols.includes(key));
      const rows = [columns.map(([, label]) => label)];
      records.forEach((record) => {
        const store = ctx.storeByNum.get(String(record.store_num || ""));
        const franchisee = franchiseeOf(record);
        const team = staffForStore(ctx, store);
        const updates = obHistory(record).filter((entry) => entry.kind !== "created");
        const value = {
          store: record.store_num || "", fr: franchisee ? franchisee.name : "", terr: store?.territory || "", addr: store?.address || "", city: store?.city || "", state: store?.state || "",
          plat: obPlatformName(record.platform), status: record.status, storeplat: store ? platformStatus(store, record.platform) : "",
          req: record.group_id ? String(ctx.onboarding.filter((item) => item.group_id === record.group_id).length) : "1",
          details: richToPlain(record.details || ""), lastupd: richToPlain(record.last_update || ""),
          allupd: updates.map((entry) => `${h.dateText(entry.ts)} — ${entry.prev && entry.prev !== entry.status ? `[${entry.prev} → ${entry.status}] ` : `[${entry.status}] `}${richToPlain(entry.action || "")}`).join("\n"),
          started: h.date(record.created_at), updated: h.date(record.updated_at || record.created_at), days: obDays(record), nupd: updates.length,
          fbc: names(team.fbc), om: names(team.om), frcontact: franchiseeContactsText(franchisee),
        };
        rows.push(columns.map(([key]) => value[key]));
      });
      workbook.addSheet("Records", rows, columns.map(([key]) => COLUMN_WIDTHS[key] || 14), { filter: true });
    }

    if (state.sheets.includes("updates")) {
      const rows = [["Store #", "Franchisee", "Platform", "Step #", "Date / time", "Step", "From status", "To status", "Progress note"]];
      records.forEach((record) => {
        const franchisee = franchiseeOf(record);
        obHistory(record).forEach((entry, index) => {
          const created = entry.kind === "created";
          rows.push([record.store_num || "", franchisee ? franchisee.name : "", obPlatformName(record.platform), index + 1, h.date(entry.ts),
            created ? "Onboarding started" : entry.prev && entry.prev !== entry.status ? "Status changed" : "Update", created ? "" : entry.prev || "", entry.status || "", created ? "" : richToPlain(entry.action || "")]);
        });
      });
      workbook.addSheet("Updates", rows, [10, 28, 12, 7, 17, 17, 22, 22, 60], { filter: true });
    }

    if (state.sheets.includes("matrix")) {
      const byStore = new Map();
      records.forEach((record) => {
        const key = String(record.store_num || "");
        if (!byStore.has(key)) byStore.set(key, {});
        const current = byStore.get(key)[record.platform];
        if (!current || new Date(record.updated_at) > new Date(current.updated_at)) byStore.get(key)[record.platform] = record;
      });
      const rows = [["Store #", "Franchisee", "City", "State", ...platforms.map(([, name]) => `${name} onboarding`), ...platforms.map(([, name]) => `${name} on store now`)]];
      [...byStore.keys()].sort(compareNumbers).forEach((num) => {
        const store = ctx.storeByNum.get(num);
        const franchisee = store ? ctx.frById.get(store.franchisee_id) : null;
        const latest = byStore.get(num);
        rows.push([num, franchisee ? franchisee.name : "", store?.city || "", store?.state || "",
          ...platforms.map(([key]) => (latest[key] ? latest[key].status : "—")), ...platforms.map(([key]) => (store ? platformStatus(store, key) : ""))]);
      });
      workbook.addSheet("Store x platform", rows, [10, 28, 16, 7, ...platforms.map(() => 22), ...platforms.map(() => 16)], { filter: true });
    }

    const countWithLast = (items) => [...counts(items), h.date(lastOf(items))];
    if (state.sheets.includes("byfr")) {
      h.groupSheet(workbook, records, {
        title: "By franchisee", key: (record) => obFranchiseeId(ctx, record),
        head: (id, items) => [ctx.frById.get(id)?.name || "Unknown", distinct(items, (record) => String(record.store_num || ""))],
        headers: ["Franchisee", "Stores", ...COUNT_HEADERS, "Last activity"], widths: [30, 8, 8, 10, 22, 11, 17], count: countWithLast,
      });
    }
    if (state.sheets.includes("bystore")) {
      h.groupSheet(workbook, records, {
        title: "By store", key: (record) => String(record.store_num || ""),
        head: (num) => { const store = ctx.storeByNum.get(num); return [num, store ? ctx.frById.get(store.franchisee_id)?.name || "" : "", store?.city || "", store?.state || ""]; },
        headers: ["Store #", "Franchisee", "City", "State", ...COUNT_HEADERS, "Last activity"], widths: [10, 28, 16, 7, 8, 10, 22, 11, 17], count: countWithLast,
        sort: (a, b) => b[1].length - a[1].length || compareNumbers(a[0], b[0]),
      });
    }
    if (state.sheets.includes("byplat")) {
      const order = OB_PLATFORMS.map(([key]) => key);
      h.groupSheet(workbook, records, {
        title: "By platform", key: (record) => record.platform, head: (key) => [obPlatformName(key)],
        headers: ["Platform", ...COUNT_HEADERS, "Last activity"], widths: [14, 8, 10, 22, 11, 17], count: countWithLast,
        sort: (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
      });
    }
    if (state.sheets.includes("bymonth")) {
      h.groupSheet(workbook, records, {
        title: "By month", key: (record) => reportMonth(record.created_at, h.tz), head: (month) => [month],
        headers: ["Month started", ...COUNT_HEADERS, "Last activity"], widths: [14, 8, 10, 22, 11, 17], count: countWithLast, sort: (a, b) => a[0].localeCompare(b[0]),
      });
    }
  },
};
