/*
 * CAP spreadsheet: template, export of the current list, reading and checking rows.
 * Store Number, Assessment ID, Status and an optional Due Date are read: franchisee, email and phone always come from the store records.
 * A store is "already in the CAP list" when its Assessment ID or its store number is. Assessment IDs are unique: one never moves to another store.
 * Status "Not Started" (or blank) adds a store that is not in the CAP list yet, at No Action Yet; stores already in the list keep their status.
 * Status "In Progress" / "In Review" adds the store at that status, or changes a store already in the list to it.
 * Status "Closed" marks a store already in the CAP list Completed.
 * Nothing is saved here — the import dialog shows the plan first, then capsActions.runCapsImport saves it.
 */
import { CAP_STATES } from "../../config/constants.js";
import { capContact, capDueDate, capAssessmentId, cleanAssessmentId, findCapByAssessment, formatDueDate, normalizeCapStatus, sameAssessmentId, storeContactDefaults } from "../../domain/caps.js";
import { localDateInput, pad2 } from "../../lib/format.js";
import { cleanStoreNumber, compareNumbers } from "../../lib/text.js";
import { loadXlsx } from "../../lib/xlsx.js";

/** Columns read on import. */
export const CAP_COLUMNS = ["Store Number", "Assessment ID", "Status", "Due Date"];
const COLUMN_WIDTHS = [14, 14, 14, 14];
/** The "Current list" export adds these for reading only — they are ignored on import. */
const EXPORT_COLUMNS = [...CAP_COLUMNS, "Status in App", "Franchisee", "Email Address", "Phone Number", "Notes"];
const EXPORT_WIDTHS = [...COLUMN_WIDTHS, 16, 30, 32, 18, 50];
const SHEET_NAME = "CAPs";

/** Field of each column, with the header spellings accepted for it. Other columns are ignored. */
const HEADERS = {
  num: ["store number", "store #", "store", "store no", "store num"],
  aid: ["assessment id", "assessmentid", "assessment #", "assessment no", "assessment number", "assessment"],
  status: ["status", "cap status"],
  due: ["due date", "submission due date", "due", "deadline"],
};

/** Status values accepted in the file. A blank status (or no Status column) counts as Not Started. */
export const FILE_STATUS_LABELS = { notStarted: "Not Started", inProgress: "In Progress", inReview: "In Review", closed: "Closed" };
const FILE_STATUSES = {
  notStarted: ["not started", "notstarted", "", "new", "no action yet"],
  inProgress: ["in progress", "inprogress", "progress", "wip", "work in progress"],
  inReview: ["in review", "inreview", "review", "under review", "for review"],
  closed: ["closed", "close", "completed", "complete", "done"],
};
/** App status each file status sets. Not Started only applies to new stores. */
const FILE_TO_APP = { notStarted: CAP_STATES[0], inProgress: "In Progress", inReview: "In Review", closed: "Completed" };
const APP_TO_FILE = { "In Progress": "inProgress", "In Review": "inReview", Completed: "closed" };

/** "notStarted" | "inProgress" | "inReview" | "closed", or null when the value is not known. */
export function readFileStatus(value) {
  const text = String(value || "").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  return Object.keys(FILE_STATUSES).find((key) => FILE_STATUSES[key].includes(text)) || null;
}

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
    ["• Assessment ID is the store's assessment ID. It is used to check whether the store is already in the CAP list, so fill it in whenever you have it."],
    ["    Each Assessment ID must be unique: it can't be repeated in the file or belong to a different store in the CAP list (those rows are skipped)."],
    ["    A store already in the CAP list without a Assessment ID gets the one in the file."],
    ["• Franchisee, Email Address and Phone Number are filled in automatically from the store records — don't add them."],
    ["• Status is Not Started, In Progress, In Review or Closed:"],
    ["    Not Started — adds the store to the CAP list at No Action Yet. If the store is already in the list, its status is left as it is (not added again)."],
    ["    In Progress / In Review — adds the store at that status, or changes a store already in the list to it."],
    ["    Closed — the store's CAP is done: a store already in the CAP list is changed to Completed. Closed stores that are not in the list are skipped."],
    ["• A blank Status counts as Not Started."],
    ["• New stores must already be in the store list (All Stores). Rows for unknown stores are skipped."],
    ["• Due Date is optional: the CAP submission due date, e.g. 11/15/2026 (month/day/year) or 2026-11-15. Reminders are sent as it gets close. It is not used for Closed rows."],
    ["• Stores already in the CAP list only get a new due date if you tick \"Update the due date of stores already in the CAP list\"."],
    ["• Notes are added in the app, not in the file. Other columns are ignored."],
    ["• Nothing is saved until you check the preview and click Import in the app."], [""],
    ["Example rows (do not paste these into the CAPs sheet):"],
    CAP_COLUMNS,
    ["99901", "A-1001", "Not Started", ""],
    ["99902", "A-1002", "In Review", "11/15/2026"],
    ["99903", "A-1003", "Closed", ""],
    [""],
    ["Row 1: adds store 99901 at No Action Yet with no due date. Row 2: adds store 99902 at In Review, due Nov 15, 2026 (or changes it to In Review if it is already in the list)."],
    ["Row 3: store 99903 (or Assessment ID A-1003) is already in the CAP list and is changed to Completed."],
  ]);
  sheet["!cols"] = COLUMN_WIDTHS.map((wch) => ({ wch }));
  return sheet;
}

function writeWorkbook(XLSX, columns, widths, rows, fileName) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  // Keep Store Number and Assessment ID as text so leading zeros survive.
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
  writeWorkbook(await loadXlsx(), CAP_COLUMNS, COLUMN_WIDTHS, [], "cap-template.xlsx");
}

/**
 * Every CAP record with its Assessment ID, status, franchisee, email, phone and notes. The file Status matches the app
 * (Closed for Completed, In Progress, In Review, else Not Started), so importing the file back changes nothing.
 * Only Store Number, Assessment ID, Status and Due Date are read back on import.
 */
export async function downloadCapsList(ctx) {
  const rows = ctx.caps.slice().sort((a, b) => compareNumbers(a.store_num, b.store_num)).map((record) => {
    const contact = capContact(ctx, record);
    const status = normalizeCapStatus(record.status);
    const fileStatus = FILE_STATUS_LABELS[APP_TO_FILE[status] || "notStarted"];
    return [record.store_num, capAssessmentId(record), fileStatus, capDueDate(record), status, contact.name, contact.email, contact.phone, record.notes || ""];
  });
  writeWorkbook(await loadXlsx(), EXPORT_COLUMNS, EXPORT_WIDTHS, rows, `cap-list-${localDateInput()}.xlsx`);
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
    return { rows, hasAssessment: columns.includes("aid") };
  }
  return { error: `No "Store Number" column found. Use the template — its columns are: ${CAP_COLUMNS.join(" | ")}.` };
}

/* ---------- checking ---------- */

/**
 * Checks every row against the store list and the saved records, without saving.
 * Each row: { row, num, aid, fileStatus, ok, kind, reason, msg, shown, save (new record),
 *             existingId, patch + changes (always saved), duePatch + dueChange (saved only when allowed) }.
 * kind: "add" (not in the CAP list) | "existing" (already in the list, found by Assessment ID or store number).
 * changes / dueChange: { field, label, before, after }.
 * reason (skipped rows): "missing" | "repeat" | "repeatAid" | "badStatus" | "notFound" (not in the store database)
 *   | "notInList" (Closed, not in the CAP list) | "badDate" | "aidTaken" (the Assessment ID belongs to another store) | "aidDiffers".
 * New records save no franchisee, email or phone, so they always show the store records.
 * withDue / withAid: the database has the due_date / assessment_id column.
 */
export function planCapsImport(ctx, parsed, withDue = ctx.capsDueReady, withAid = ctx.capsAssessmentReady) {
  const seen = {};
  const seenAid = {};
  const rows = parsed.rows.map(({ row, values }) => {
    const out = { row, num: cleanStoreNumber(values.num), aid: withAid ? cleanAssessmentId(values.aid) : "", fileStatus: "", ok: false, kind: "add", reason: "", msg: "",
      patch: {}, changes: [], duePatch: {}, dueChange: null };
    const skip = (reason, msg) => Object.assign(out, { reason, msg });
    if (!out.num) return skip("missing", "Store Number is missing");
    if (seen[out.num]) return skip("repeat", `Store ${out.num} is repeated (row ${seen[out.num]})`);
    seen[out.num] = row;
    const aidKey = out.aid.toLowerCase();
    if (aidKey && seenAid[aidKey]) return skip("repeatAid", `Assessment ID ${out.aid} is repeated (row ${seenAid[aidKey]})`);
    if (aidKey) seenAid[aidKey] = row;
    out.fileStatus = readFileStatus(values.status);
    if (!out.fileStatus) return skip("badStatus", `Status "${values.status}" is not known — use Not Started, In Progress, In Review or Closed`);

    // Already in the CAP list: by Assessment ID first, then by store number. A Assessment ID never moves to another store.
    const byAssessment = findCapByAssessment(ctx, out.aid);
    if (byAssessment && String(byAssessment.store_num) !== out.num) {
      return skip("aidTaken", `Assessment ID ${out.aid} already belongs to store ${byAssessment.store_num} in the CAP list`);
    }
    const existing = byAssessment || ctx.caps.find((record) => String(record.store_num) === out.num) || null;
    const savedAid = existing ? capAssessmentId(existing) : "";
    if (existing && out.aid && savedAid && !sameAssessmentId(savedAid, out.aid)) {
      return skip("aidDiffers", `Store ${out.num} is in the CAP list with Assessment ID ${savedAid}, not ${out.aid}`);
    }

    if (!existing) {
      if (out.fileStatus === "closed") return skip("notInList", `Closed, but store ${out.num} is not in the CAP list — nothing to complete`);
      const defaults = storeContactDefaults(ctx, out.num);
      if (!defaults.found) return skip("notFound", `Store ${out.num} is not in the database`);
      const due = withDue ? readDueDate(values.due) : "";
      if (due === null) return skip("badDate", `Due Date "${values.due}" is not a date — use month/day/year, e.g. 11/15/2026`);
      const status = FILE_TO_APP[out.fileStatus];
      out.ok = true;
      out.save = { store_num: out.num, ...(withAid ? { assessment_id: out.aid } : {}), store_name: "", email: "", phone: "", status, notes: "", ...(withDue ? { due_date: due || null } : {}) };
      out.msg = `New · ${status}${out.aid ? ` · Assessment ID ${out.aid}` : ""}${due ? ` · due ${formatDueDate(due)}` : ""}`;
      out.shown = { name: defaults.name, email: defaults.email, phone: defaults.phone, status, due, aid: out.aid };
      return out;
    }
    return planExisting(ctx, out, existing, values, withDue, skip);
  });

  const ok = rows.filter((row) => row.ok);
  const skipped = rows.filter((row) => !row.ok);
  const existing = ok.filter((row) => row.kind === "existing");
  const changed = existing.filter((row) => row.changes.length);
  const statusTo = (row) => row.changes.find((change) => change.field === "status")?.after;
  return {
    rows,
    adds: ok.filter((row) => row.kind === "add"),
    existing,
    /** Existing rows saved on Import (status change and/or a Assessment ID filled in). */
    changed,
    closes: changed.filter((row) => statusTo(row) === "Completed"),
    statusChanges: changed.filter((row) => statusTo(row) && statusTo(row) !== "Completed"),
    assessmentFills: changed.filter((row) => row.changes.some((change) => change.field === "assessment_id")),
    /** Existing rows with a different due date in the file: saved only when allowed. */
    updates: existing.filter((row) => row.dueChange),
    unchanged: existing.filter((row) => !row.changes.length && !row.dueChange),
    notFound: skipped.filter((row) => row.reason === "notFound"),
    notInList: skipped.filter((row) => row.reason === "notInList"),
    aidConflicts: skipped.filter((row) => row.reason === "aidTaken" || row.reason === "aidDiffers" || row.reason === "repeatAid"),
    problems: skipped.filter((row) => !["notFound", "notInList", "aidTaken", "aidDiffers", "repeatAid"].includes(row.reason)),
    skipped,
  };
}

/**
 * Row for a store already in the CAP list: the file status may change its status (never for Not Started),
 * a blank saved Assessment ID is filled in, and a different due date waits for permission (not for Closed rows).
 */
function planExisting(ctx, out, existing, values, withDue, skip) {
  const before = normalizeCapStatus(existing.status);
  const beforeDue = capDueDate(existing);
  const closing = out.fileStatus === "closed";
  const due = withDue && !closing ? readDueDate(values.due) : "";
  if (due === null) return skip("badDate", `Due Date "${values.due}" is not a date — use month/day/year, e.g. 11/15/2026`);
  Object.assign(out, { ok: true, kind: "existing", existingId: existing.id });

  const target = out.fileStatus === "notStarted" ? before : FILE_TO_APP[out.fileStatus];
  if (target !== before) {
    out.patch.status = target;
    out.changes.push({ field: "status", label: "Status", before, after: target });
  }
  if (out.aid && !capAssessmentId(existing)) {
    out.patch.assessment_id = out.aid;
    out.changes.push({ field: "assessment_id", label: "Assessment ID", before: "—", after: out.aid });
  }
  if (due && due !== beforeDue) {
    out.duePatch.due_date = due;
    out.dueChange = { field: "due_date", label: "Due Date", before: beforeDue ? formatDueDate(beforeDue) : "—", after: formatDueDate(due) };
  }

  const parts = ["Already in the CAP list", ...out.changes.map((change) => (change.field === "status" ? `${change.before} → ${change.after}` : `Assessment ID ${change.after} added`))];
  if (!out.changes.length) parts.push(out.fileStatus === "notStarted" ? "not added again" : "no changes");
  if (out.dueChange) parts.push("due date differs");
  out.msg = parts.join(" · ");
  const current = capContact(ctx, existing);
  out.shown = { name: current.name, email: current.email, phone: current.phone, status: out.patch.status || before, due: due || beforeDue, aid: out.aid || capAssessmentId(existing) };
  return out;
}
