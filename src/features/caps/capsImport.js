/*
 * CAPs spreadsheet: template, export of the current list, reading and checking rows.
 * Only Store Number (and an optional Due Date) is read: franchisee, email and phone always come from the store records,
 * and every imported store starts at No Action Yet (a Status column in the file is ignored).
 * Nothing is saved here — the import dialog shows the plan first, then capsActions.runCapsImport saves it.
 */
import { CAP_STATES } from "../../config/constants.js";
import { capContact, capDueDate, formatDueDate, normalizeCapStatus, storeContactDefaults } from "../../domain/caps.js";
import { localDateInput, pad2 } from "../../lib/format.js";
import { cleanStoreNumber, compareNumbers } from "../../lib/text.js";
import { loadXlsx } from "../../lib/xlsx.js";

/** Columns read on import. */
export const CAP_COLUMNS = ["Store Number", "Due Date"];
const COLUMN_WIDTHS = [14, 14];
/** The "Current list" export adds these for reading only — they are ignored on import. */
const EXPORT_COLUMNS = [...CAP_COLUMNS, "Status", "Franchisee", "Email Address", "Phone Number", "Notes"];
const EXPORT_WIDTHS = [...COLUMN_WIDTHS, 16, 30, 32, 18, 50];
const SHEET_NAME = "CAPs";

/** Field of each column, with the header spellings accepted for it. Other columns are ignored. */
const HEADERS = {
  num: ["store number", "store #", "store", "store no", "store num"],
  due: ["due date", "submission due date", "due", "deadline"],
};

const headerKey = (value) => String(value || "").replace(/\*/g, "").toLowerCase().replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();
const fieldOfHeader = (value) => Object.keys(HEADERS).find((field) => HEADERS[field].includes(headerKey(value))) || null;

/**
 * Due date typed in the file: 11/15/2026, 11/15/26, 2026-11-15, "Nov 15, 2026" or an Excel date number.
 * Returns "yyyy-mm-dd", "" when blank, or null when it is not a real date.
 */
export function readDueDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  let year;
  let month;
  let day;
  let match;
  if ((match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [, year, month, day] = match.map(Number);
  else if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [, month, day, year] = match.map(Number);
    if (year < 100) year += 2000;
  } else if (/^\d{5}(\.\d+)?$/.test(text)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(text)) * 864e5);
    [year, month, day] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else {
    const date = new Date(text);
    if (Number.isNaN(date.getTime()) || !/[a-z]/i.test(text)) return null;
    [year, month, day] = [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  }
  const check = new Date(year, month - 1, day);
  if (year < 2000 || year > 2100 || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/* ---------- template and export ---------- */

function instructionsSheet(XLSX) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["How to fill the CAPs sheet"], [""],
    ["• One row = one store. Store Number is required on every row and must be unique in the file."],
    ["• Franchisee, Email Address and Phone Number are filled in automatically from the store records — don't add them."],
    ["• The store must already be in the store list (All Stores). Rows for unknown stores are skipped."],
    ["• Every imported store starts at No Action Yet. Change the status in the app as you act on it."],
    ["• Due Date is optional: the CAP submission due date, e.g. 11/15/2026 (month/day/year) or 2026-11-15. Reminders are sent as it gets close."],
    ["• Stores already in CAPs Monitoring are listed separately in the preview. They keep their status; their due date only changes if you tick \"Update the due date of stores already in CAPs\"."],
    ["• Notes are added in the app, not in the file. Other columns are ignored."],
    ["• Nothing is saved until you check the preview and click Import in the app."], [""],
    ["Example rows (do not paste these into the CAPs sheet):"],
    CAP_COLUMNS,
    ["99901", ""],
    ["99902", "11/15/2026"],
    [""],
    ["Row 1: adds store 99901 with no due date. Row 2: adds store 99902, due Nov 15, 2026. Both start at No Action Yet."],
  ]);
  sheet["!cols"] = COLUMN_WIDTHS.map((wch) => ({ wch }));
  return sheet;
}

function writeWorkbook(XLSX, columns, widths, rows, fileName) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  // Keep Store Number as text so leading zeros survive.
  Object.keys(sheet).filter((ref) => ref[0] !== "!").forEach((ref) => { sheet[ref].t = "s"; sheet[ref].z = "@"; });
  columns.forEach((_, column) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "008938" } } };
  });
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
  XLSX.utils.book_append_sheet(workbook, instructionsSheet(XLSX), "Instructions");
  XLSX.writeFile(workbook, fileName);
}

export async function downloadCapsTemplate() {
  writeWorkbook(await loadXlsx(), CAP_COLUMNS, COLUMN_WIDTHS, [], "caps-monitoring-template.xlsx");
}

/** Every CAPs record with its status, franchisee, email, phone and notes. Only Store Number and Due Date are read back on import. */
export async function downloadCapsList(ctx) {
  const rows = ctx.caps.slice().sort((a, b) => compareNumbers(a.store_num, b.store_num)).map((record) => {
    const contact = capContact(ctx, record);
    return [record.store_num, capDueDate(record), normalizeCapStatus(record.status), contact.name, contact.email, contact.phone, record.notes || ""];
  });
  writeWorkbook(await loadXlsx(), EXPORT_COLUMNS, EXPORT_WIDTHS, rows, `caps-monitoring-${localDateInput()}.xlsx`);
}

/* ---------- reading ---------- */

/** Reads the file. Returns { rows: [{ row, values }] } or { error }. */
export async function readCapsFile(file) {
  const XLSX = await loadXlsx();
  let workbook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } catch {
    return { error: "Couldn't read that file. Save it as .xlsx or .csv and try again." };
  }
  const names = [...workbook.SheetNames].sort((a, b) => (b === SHEET_NAME) - (a === SHEET_NAME));
  for (const name of names.filter((sheetName) => sheetName !== "Instructions")) {
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: false, blankrows: true });
    const headerIndex = grid.slice(0, 10).findIndex((cells) => cells.some((cell) => fieldOfHeader(cell) === "num"));
    if (headerIndex < 0) continue;
    const columns = grid[headerIndex].map(fieldOfHeader);
    const rows = grid.slice(headerIndex + 1).map((cells, index) => ({
      row: headerIndex + index + 2,
      values: Object.fromEntries(columns.map((field, column) => [field, String(cells[column] ?? "").trim()]).filter(([field]) => field)),
    })).filter((entry) => Object.values(entry.values).some(Boolean));
    return { rows };
  }
  return { error: `No "Store Number" column found. Use the template — its columns are: ${CAP_COLUMNS.join(" | ")}.` };
}

/* ---------- checking ---------- */

/**
 * Checks every row against the store list and the saved records, without saving.
 * Each row: { row, num, ok, kind: "add" | "update", reason, msg, shown, save (new record), patch + changes (existing record), existingId }.
 * reason (skipped rows): "missing" | "repeat" | "notFound" (not in the store database) | "badDate".
 * New stores always start at No Action Yet; stores already in CAPs keep their status.
 * New records save no franchisee, email or phone, so they always show the store records.
 * withDue: the database has the due_date column.
 */
export function planCapsImport(ctx, parsed, withDue = ctx.capsDueReady) {
  const seen = {};
  const rows = parsed.rows.map(({ row, values }) => {
    const out = { row, num: cleanStoreNumber(values.num), ok: false, kind: "add", reason: "", msg: "", changes: [] };
    const skip = (reason, msg) => Object.assign(out, { reason, msg });
    if (!out.num) return skip("missing", "Store Number is missing");
    if (seen[out.num]) return skip("repeat", `Store ${out.num} is repeated (row ${seen[out.num]})`);
    seen[out.num] = row;
    const defaults = storeContactDefaults(ctx, out.num);
    if (!defaults.found) return skip("notFound", `Store ${out.num} is not in the database`);
    const due = withDue ? readDueDate(values.due) : "";
    if (due === null) return skip("badDate", `Due Date "${values.due}" is not a date — use month/day/year, e.g. 11/15/2026`);

    const existing = ctx.caps.find((record) => String(record.store_num) === out.num);
    out.ok = true;
    if (!existing) {
      out.save = { store_num: out.num, store_name: "", email: "", phone: "", status: CAP_STATES[0], notes: "", ...(withDue ? { due_date: due || null } : {}) };
      out.msg = `New · ${out.save.status}${due ? ` · due ${formatDueDate(due)}` : ""}`;
      out.shown = { name: defaults.name, email: defaults.email, phone: defaults.phone, status: out.save.status, due };
      return out;
    }

    // Already in CAPs: the status is kept; only the due date can change, and only when the file fills it in.
    out.kind = "update";
    out.existingId = existing.id;
    const current = capContact(ctx, existing);
    const before = normalizeCapStatus(existing.status);
    const beforeDue = capDueDate(existing);
    out.patch = {};
    if (due && due !== beforeDue) {
      out.patch.due_date = due;
      out.changes.push({ label: "Due Date", before: beforeDue ? formatDueDate(beforeDue) : "—", after: formatDueDate(due) });
    }
    out.msg = out.changes.length ? `Already in CAPs · changes ${out.changes.map((change) => change.label).join(", ")}` : "Already in CAPs · no changes";
    out.shown = { name: current.name, email: current.email, phone: current.phone, status: before, due: due || beforeDue };
    return out;
  });

  const ok = rows.filter((row) => row.ok);
  const skipped = rows.filter((row) => !row.ok);
  return {
    rows,
    adds: ok.filter((row) => row.kind === "add"),
    existing: ok.filter((row) => row.kind === "update"),
    updates: ok.filter((row) => row.kind === "update" && row.changes.length),
    unchanged: ok.filter((row) => row.kind === "update" && !row.changes.length),
    notFound: skipped.filter((row) => row.reason === "notFound"),
    problems: skipped.filter((row) => row.reason !== "notFound"),
    skipped,
  };
}
