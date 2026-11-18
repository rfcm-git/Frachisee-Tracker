/*
 * Report engine shared by every report type.
 * A report definition (see reports/definitions) says which records it covers, its filters, sheets and columns,
 * and how to build the sheets. The engine handles state, filtering, file names and writing Excel / PDF.
 */
import { STORAGE_KEYS } from "../config/constants.js";
import { storesOf } from "../domain/context.js";
import { primaryTerritory } from "../domain/records.js";
import { fileSlug, localDateInput, nowIso } from "../lib/format.js";
import { inBounds, periodBounds, periodReportLabel } from "../lib/periods.js";
import { local } from "../lib/storage.js";
import { cleanStoreNumber, normalizeName } from "../lib/text.js";
import { writePdf } from "./pdf.js";
import { reportDate, reportDateText, timeZoneName } from "./reportDates.js";
import { createWorkbook, writeXlsx } from "./workbook.js";

/* ---------- state ---------- */

/**
 * Report choices. Lists are arrays so React state stays immutable.
 * { kind, fr, store, terr, period, date, days, year, from, to, chips: {key: []}, tz, fmt, sheets: [], cols: [] }
 */
export function defaultReportState(definition, preset) {
  const saved = local.getJson(STORAGE_KEYS.report(definition.kind), {}) || {};
  const chips = {};
  (definition.chips || []).forEach((group) => { chips[group.key] = group.def || group.options.map(([value]) => value); });
  const state = {
    kind: definition.kind, fr: "", store: "", terr: "",
    period: "all", date: "", days: 30, year: new Date().getFullYear(), from: "", to: "",
    chips, tz: saved.tz || "local", fmt: saved.fmt || "xlsx",
    sheets: Array.isArray(saved.sheets) ? saved.sheets : definition.defSheets,
    cols: Array.isArray(saved.cols) ? saved.cols : definition.cols.map(([key]) => key).filter((key) => !(definition.defOff || []).includes(key)),
  };
  if (preset) {
    Object.entries(preset).forEach(([key, value]) => {
      if (key === "chips") state.chips = { ...state.chips, ...value };
      else state[key] = value;
    });
  }
  return state;
}

/** Remembers time zone, format, sheets and columns for next time. */
export function saveReportPrefs(state) {
  local.setJson(STORAGE_KEYS.report(state.kind), { tz: state.tz, fmt: state.fmt, sheets: state.sheets, cols: state.cols });
}

/* ---------- filtering ---------- */

/** { all: true } | { franchisee } | { bad: true } for the typed franchisee name. */
export function franchiseeChoice(ctx, name) {
  if (!String(name || "").trim()) return { all: true };
  const wanted = normalizeName(name);
  const franchisee = ctx.franchisees.find((item) => normalizeName(item.name) === wanted);
  return franchisee ? { franchisee } : { bad: true };
}

/** Records matching the report choices. */
export function selectRecords(ctx, definition, state) {
  const choice = franchiseeChoice(ctx, state.fr);
  if (choice.bad) return [];
  const storeNum = cleanStoreNumber(state.store);
  const bounds = definition.dateLabel ? periodBounds(state) : [null, null];
  return definition.items(ctx).filter((record) => {
    if (choice.franchisee && !definition.frOk(ctx, record, choice.franchisee.id)) return false;
    if (storeNum && !definition.storeOk(ctx, record, storeNum)) return false;
    if (state.terr && !definition.terrOk(ctx, record, state.terr)) return false;
    if (definition.dateLabel && !inBounds(definition.dateOf(record), bounds)) return false;
    for (const group of definition.chips || []) {
      const selected = state.chips[group.key] || [];
      if (selected.length < group.options.length && !group.ok(ctx, record, selected)) return false;
    }
    return true;
  });
}

/** Territories that have stores. */
export const reportTerritories = (ctx) => [...new Set(ctx.stores.map(primaryTerritory))].filter((territory) => territory !== "—").sort((a, b) => (+a || 0) - (+b || 0));

/** True when the store is in the territory. */
export function storeInTerritory(ctx, storeNum, territory) {
  const store = ctx.storeByNum.get(String(storeNum || ""));
  return !!store && primaryTerritory(store) === territory;
}

/** True when any of the franchisee's stores is in the territory. */
export const franchiseeInTerritory = (ctx, franchiseeId, territory) => storesOf(ctx, franchiseeId).some((store) => primaryTerritory(store) === territory);

/* ---------- building ---------- */

/** Helpers given to each definition's build(). */
export function buildHelpers(ctx, definition, state) {
  const date = (ts) => reportDate(ts, state.tz);
  const dateText = (ts) => reportDateText(ts, state.tz);
  const choice = franchiseeChoice(ctx, state.fr);

  function filterRows() {
    const rows = [
      ["Franchisee", choice.franchisee ? choice.franchisee.name : "All franchisees"],
      ["Store #", state.store.trim() || "All stores"],
      ["Territory", state.terr ? `Territory ${state.terr}` : "All territories"],
    ];
    if (definition.dateLabel) rows.push([definition.dateLabel, periodReportLabel(state)]);
    (definition.chips || []).forEach((group) => {
      const selected = state.chips[group.key] || [];
      rows.push([group.label, selected.length === group.options.length ? (group.allLabel || "All") : group.options.filter(([value]) => selected.includes(value)).map(([, label]) => label).join(", ")]);
    });
    return rows;
  }

  /**
   * Summary sheet: title, generated time, filters used, then sections.
   * sections = [{ title, value?, rows }], notes = [string]
   */
  function summarySheet(workbook, title, sections, notes = []) {
    const rows = [[`${title} — 3PD Helpdesk`], [`Generated: ${dateText(nowIso())} (${timeZoneName(state.tz)})`], []];
    const sectionRows = [];
    const addSection = (heading, value, items) => {
      sectionRows.push(rows.length);
      rows.push([heading, value || ""]);
      rows.push(...items);
    };
    addSection("Filters used", "", filterRows());
    sections.forEach((section) => { rows.push([]); addSection(section.title, section.value, section.rows); });
    if (notes.length) { rows.push([]); notes.forEach((note) => rows.push([note])); }
    workbook.addSheet("Summary", rows, [34, 46], { headerRow: -1, titleRows: 2, sectionRows });
  }

  /** One row per group: headFn(key, items) columns followed by countFn(items) columns. */
  function groupSheet(workbook, records, { title, key, head, headers, widths, count, sort }) {
    const groups = new Map();
    records.forEach((record) => {
      const value = key(record);
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(record);
    });
    const entries = [...groups.entries()].sort(sort || ((a, b) => b[1].length - a[1].length));
    workbook.addSheet(title, [headers, ...entries.map(([value, items]) => [...head(value, items), ...count(items)])], widths, { filter: true });
  }

  return { date, dateText, choice, filterRows, summarySheet, groupSheet, tz: state.tz };
}

function fileBaseFor(ctx, definition, state) {
  const choice = franchiseeChoice(ctx, state.fr);
  const store = cleanStoreNumber(state.store);
  const tag = `${choice.franchisee ? `_${fileSlug(choice.franchisee.name)}` : ""}${store ? `_store-${store}` : ""}${state.terr ? `_terr-${state.terr}` : ""}`;
  return `${definition.file}${tag}_${localDateInput()}`;
}

/**
 * Builds and downloads the report. Returns { ok } or { error: message }.
 */
export async function downloadReport(ctx, definition, state) {
  const records = selectRecords(ctx, definition, state);
  if (!records.length) return { error: definition.emptyText };
  const workbook = createWorkbook();
  definition.build(ctx, records, state, workbook, buildHelpers(ctx, definition, state));
  if (!workbook.sheets.length) return { error: "Pick at least one sheet" };
  const fileBase = fileBaseFor(ctx, definition, state);
  try {
    if (state.fmt === "pdf") {
      await writePdf(workbook, { title: definition.title, fileBase, generatedText: `Generated ${reportDateText(nowIso(), state.tz)} (${timeZoneName(state.tz)})` });
    } else {
      await writeXlsx(workbook, fileBase);
    }
  } catch (error) {
    return { error: state.fmt === "pdf" ? `Couldn't make the PDF — ${error?.message || "check your internet"}` : "Excel tool didn't load — check your internet and reopen the app" };
  }
  saveReportPrefs(state);
  return { ok: true };
}
