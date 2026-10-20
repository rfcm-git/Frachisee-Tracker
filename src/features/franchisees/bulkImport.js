/* Bulk add franchisees and stores from a spreadsheet: template, reading and checking rows, importing. */
import { TABLES, insertRows, insertWithNextIds } from "../../services/api.js";
import { emptyPlatforms } from "../../domain/records.js";
import { phone10 } from "../../lib/format.js";
import { isEmail, normalizeName } from "../../lib/text.js";
import { loadXlsx } from "../../lib/xlsx.js";
import { findDuplicateFranchisee } from "./franchiseeSelectors.js";

export const BULK_COLUMNS = ["Franchisee Name", "Franchisee Email", "Franchisee Cell", "Territory", "Store Number", "Address", "City", "State", "ZIP", "Store Phone"];
export const BULK_REQUIRED = ["Franchisee Name"];

export async function downloadBulkTemplate() {
  const XLSX = await loadXlsx();
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([BULK_COLUMNS]);
  sheet["!cols"] = [30, 28, 16, 10, 13, 32, 16, 7, 9, 16].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, sheet, "Stores");
  const help = XLSX.utils.aoa_to_sheet([
    ["How to fill the Stores sheet"], [""],
    ["• One row = one store. Put the franchisee name on every row of their stores."],
    ["• Franchisee Name is required. Match the exact name if the franchisee already exists, e.g. \"Agrawal, Govind\"."],
    ["• Leave Store Number blank to add only the franchisee (no store)."],
    ["• Phones: any 10-digit number is fine — it is formatted to (555) 123-4567."],
    ["• Territory: one number per row, e.g. 540."],
    ["• Don't rename, remove or reorder the columns."], [""],
    ["Example rows (do not paste these into the Stores sheet):"],
    BULK_COLUMNS,
    ["Doe, John", "john@email.com", "5551234567", "540", "99901", "123 Main St", "Fresno", "CA", "93701", "5559876543"],
    ["Doe, John", "", "", "540", "99902", "456 Oak Ave", "Clovis", "CA", "93612", "5551112222"],
    ["Smith, Anna", "anna@email.com", "", "626", "", "", "", "", "", ""],
  ]);
  help["!cols"] = [30, 22, 14, 10, 13, 18, 12, 7, 9, 14].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, help, "Instructions");
  XLSX.writeFile(workbook, "franchisee-bulk-template.xlsx");
}

/** Reads the file. Returns { rows } (data rows without the header) or { error }. */
export async function readBulkFile(file) {
  const XLSX = await loadXlsx();
  let rows;
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets.Stores || workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: false });
  } catch {
    return { error: "Couldn't read that file. Save it as .xlsx or .csv and try again." };
  }
  const head = (rows[0] || []).map((cell) => String(cell).replace(/\*/g, "").trim().toLowerCase());
  if (!BULK_COLUMNS.every((column, index) => head[index] === column.toLowerCase())) {
    return { error: `Wrong format. The first row must be exactly: ${BULK_COLUMNS.join(" | ")}. Download the template and copy your data into it.` };
  }
  return { rows: rows.slice(1) };
}

/**
 * Checks every row. Returns { rows: [{row, name, num, ok, msg, ...}], newFranchisees: Map(key -> {name, emails, cells, territories}) }.
 */
export function planBulkImport(ctx, dataRows) {
  const results = [];
  const newFranchisees = new Map();
  const seenNumbers = {};
  let rowNumber = 1;
  dataRows.forEach((cells) => {
    rowNumber += 1;
    const cell = (column) => String(cells[BULK_COLUMNS.indexOf(column)] ?? "").trim();
    if (BULK_COLUMNS.every((column) => !cell(column))) return;
    const name = cell("Franchisee Name").replace(/\s+/g, " ");
    const num = cell("Store Number").replace(/^#/, "");
    const out = { row: rowNumber, name, num, ok: false, msg: "" };
    results.push(out);
    if (!name) { out.msg = "Franchisee Name is missing"; return; }
    const emails = cell("Franchisee Email").split(/[;,\s]+/).filter(Boolean);
    const badEmail = emails.find((email) => !isEmail(email));
    if (badEmail) { out.msg = `Email not valid: ${badEmail}`; return; }
    let franchiseeCell = "";
    if (cell("Franchisee Cell")) { franchiseeCell = phone10(cell("Franchisee Cell")); if (!franchiseeCell) { out.msg = "Franchisee Cell must be 10 digits"; return; } }
    let storePhone = "";
    if (cell("Store Phone")) { storePhone = phone10(cell("Store Phone")); if (!storePhone) { out.msg = "Store Phone must be 10 digits"; return; } }
    const existing = findDuplicateFranchisee(ctx, name, null);
    const key = normalizeName(name);
    if (num) {
      const taken = ctx.storeByNum.get(num);
      if (taken) { const owner = ctx.frById.get(taken.franchisee_id); out.msg = `Store ${num} already exists${owner ? ` ("${owner.name}")` : ""}`; return; }
      if (seenNumbers[num]) { out.msg = `Store ${num} is repeated (row ${seenNumbers[num]})`; return; }
      seenNumbers[num] = rowNumber;
    } else if (existing || newFranchisees.has(key)) {
      out.msg = "Franchisee already listed — no store to add";
      return;
    }
    const territory = cell("Territory");
    if (!existing) {
      if (!newFranchisees.has(key)) newFranchisees.set(key, { name, emails: new Set(), cells: new Set(), territories: new Set() });
      const entry = newFranchisees.get(key);
      emails.forEach((email) => entry.emails.add(email));
      if (franchiseeCell) entry.cells.add(franchiseeCell);
      if (territory) entry.territories.add(territory);
    }
    Object.assign(out, {
      ok: true, isNew: !existing, key, franchiseeId: existing ? existing.id : null,
      msg: num ? (existing ? "Add store to existing franchisee" : "Add store + new franchisee") : "Add franchisee only",
    });
    if (num) out.store = { num, address: cell("Address"), city: cell("City"), state: cell("State").toUpperCase(), zip: cell("ZIP"), phone: storePhone, territory };
  });
  return { rows: results, newFranchisees };
}

const chunks = (list, size) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

/** Imports the ready rows. Returns { franchisees, stores, error } (counts added before any error). */
export async function runBulkImport(plan) {
  const ready = plan.rows.filter((row) => row.ok);
  const idByKey = {};
  ready.filter((row) => !row.isNew).forEach((row) => { idByKey[row.key] = row.franchiseeId; });
  let franchisees = 0;
  let stores = 0;
  try {
    for (const part of chunks([...plan.newFranchisees.values()], 200)) {
      const records = part.map((entry) => ({
        name: entry.name, closed: false, territory: [...entry.territories].join(", "), notes: "",
        contacts: [...[...entry.emails].map((value) => ({ type: "email", value })), ...[...entry.cells].map((value) => ({ type: "cell", value }))],
      }));
      const result = await insertWithNextIds(TABLES.franchisees, records, "id,name");
      if (result.error) throw result.error;
      result.rows.forEach((row) => { idByKey[normalizeName(row.name)] = row.id; });
      franchisees += result.rows.length;
    }
    const storeRecords = ready.filter((row) => row.store).map((row) => ({
      franchisee_id: idByKey[row.key], ...row.store, closed: false, platforms: emptyPlatforms(), gbp: "", notes: [],
    }));
    for (const part of chunks(storeRecords, 300)) {
      const result = await insertRows(TABLES.stores, part);
      if (result.error) throw result.error;
      stores += result.rows.length;
    }
    return { franchisees, stores };
  } catch (error) {
    return { franchisees, stores, error };
  }
}
