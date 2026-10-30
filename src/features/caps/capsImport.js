/*
 * CAPs spreadsheet: template, export of the current list, reading and checking rows.
 * Only Store Number (and an optional Status) is read: franchisee, email and phone always come from the store records.
 * Nothing is saved here — the import dialog shows the plan first, then capsActions.runCapsImport saves it.
 */
import { CAP_STATES } from "../../config/constants.js";
import { capContact, normalizeCapStatus, storeContactDefaults } from "../../domain/caps.js";
import { localDateInput } from "../../lib/format.js";
import { cleanStoreNumber, compareNumbers } from "../../lib/text.js";
import { loadXlsx } from "../../lib/xlsx.js";

/** Columns read on import. */
export const CAP_COLUMNS = ["Store Number", "Status"];
const COLUMN_WIDTHS = [14, 16];
/** The "Current list" export adds these for reading only — they are ignored on import. */
const EXPORT_COLUMNS = [...CAP_COLUMNS, "Franchisee", "Email Address", "Phone Number", "Notes"];
const EXPORT_WIDTHS = [...COLUMN_WIDTHS, 30, 32, 18, 50];
const SHEET_NAME = "CAPs";

/** Field of each column, with the header spellings accepted for it. Other columns are ignored. */
const HEADERS = {
  num: ["store number", "store #", "store", "store no", "store num"],
  status: ["status", "cap status"],
};

const headerKey = (value) => String(value || "").replace(/\*/g, "").toLowerCase().replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();
const fieldOfHeader = (value) => Object.keys(HEADERS).find((field) => HEADERS[field].includes(headerKey(value))) || null;

/** Status typed in the file, matched loosely ("email sent", "in-progress", "complete"). "" when blank, null when unknown. */
function readStatus(value) {
  const key = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return "";
  const aliases = { noactionyet: "No Action Yet", noaction: "No Action Yet", emailsent: "Email Sent", sent: "Email Sent", inprogress: "In Progress", wip: "In Progress", completed: "Completed", complete: "Completed", done: "Completed" };
  return aliases[key] || null;
}

/* ---------- template and export ---------- */

function instructionsSheet(XLSX) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["How to fill the CAPs sheet"], [""],
    ["• One row = one store. Store Number is required on every row and must be unique in the file."],
    ["• Franchisee, Email Address and Phone Number are filled in automatically from the store records — don't add them."],
    ["• The store must already be in the store list (All Stores). Rows for unknown stores are skipped."],
    [`• Status is optional: ${CAP_STATES.join(", ")}. Leave it blank for new stores — they start at No Action Yet.`],
    ["• Stores already in CAPs Monitoring are listed separately in the preview. Their status only changes if you tick \"Update the status of stores already in CAPs\"."],
    ["• Notes are added in the app, not in the file. Other columns are ignored."],
    ["• Nothing is saved until you check the preview and click Import in the app."], [""],
    ["Example rows (do not paste these into the CAPs sheet):"],
    CAP_COLUMNS,
    ["99901", ""],
    ["99902", "Email Sent"],
    [""],
    ["Row 1: adds store 99901 with status No Action Yet. Row 2: adds store 99902 with status Email Sent."],
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

/** Every CAPs record with its franchisee, email, phone and notes. Only Store Number and Status are read back on import. */
export async function downloadCapsList(ctx) {
  const rows = ctx.caps.slice().sort((a, b) => compareNumbers(a.store_num, b.store_num)).map((record) => {
    const contact = capContact(ctx, record);
    return [record.store_num, normalizeCapStatus(record.status), contact.name, contact.email, contact.phone, record.notes || ""];
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
 * Each row: { row, num, ok, kind: "add" | "update", msg, shown, save (new record), patch + changes (existing record), existingId }.
 * New records save no franchisee, email or phone, so they always show the store records.
 */
export function planCapsImport(ctx, parsed) {
  const seen = {};
  const rows = parsed.rows.map(({ row, values }) => {
    const out = { row, num: cleanStoreNumber(values.num), ok: false, kind: "add", msg: "", changes: [] };
    if (!out.num) { out.msg = "Store Number is missing"; return out; }
    if (seen[out.num]) { out.msg = `Store ${out.num} is repeated (row ${seen[out.num]})`; return out; }
    seen[out.num] = row;
    const defaults = storeContactDefaults(ctx, out.num);
    if (!defaults.found) { out.msg = `Store ${out.num} is not in the store list`; return out; }
    const status = readStatus(values.status);
    if (status === null) { out.msg = `Status "${values.status}" is not one of: ${CAP_STATES.join(", ")}`; return out; }

    const existing = ctx.caps.find((record) => String(record.store_num) === out.num);
    out.ok = true;
    if (!existing) {
      out.save = { store_num: out.num, store_name: "", email: "", phone: "", status: status || CAP_STATES[0], notes: "" };
      out.msg = `New · ${out.save.status}`;
      out.shown = { name: defaults.name, email: defaults.email, phone: defaults.phone, status: out.save.status };
      return out;
    }

    // Already in CAPs: only the status can change, and only when the file fills it in.
    out.kind = "update";
    out.existingId = existing.id;
    const current = capContact(ctx, existing);
    const before = normalizeCapStatus(existing.status);
    out.patch = {};
    if (status && status !== before) {
      out.patch.status = status;
      out.changes.push({ label: "Status", before, after: status });
    }
    out.msg = out.changes.length ? `Already in CAPs · status ${before} → ${status}` : "Already in CAPs · no changes";
    out.shown = { name: current.name, email: current.email, phone: current.phone, status: status || before };
    return out;
  });

  const ok = rows.filter((row) => row.ok);
  return {
    rows,
    adds: ok.filter((row) => row.kind === "add"),
    updates: ok.filter((row) => row.kind === "update" && row.changes.length),
    unchanged: ok.filter((row) => row.kind === "update" && !row.changes.length),
    skipped: rows.filter((row) => !row.ok),
  };
}
