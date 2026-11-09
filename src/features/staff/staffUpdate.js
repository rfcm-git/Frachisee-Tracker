/*
 * Update the FBC / OM list from a spreadsheet:
 *   Staff sheet  — Name, Role, Email: adds people and changes their role, email or name.
 *   Stores sheet — Store #, FBC, OM: changes who covers each store.
 * Either sheet may be uploaded alone. Blank cells leave saved values unchanged. Nobody is deleted.
 */
import { TABLES, insertWithNextIds, mergeRowSave } from "../../services/api.js";
import { contactsOf, emailOf, rolesOf } from "../../domain/records.js";
import { localDateInput } from "../../lib/format.js";
import { compareNumbers, isEmail, normalizeName } from "../../lib/text.js";
import { loadXlsx } from "../../lib/xlsx.js";

export const STAFF_COLUMNS = ["Name", "Role", "Email"];
export const STORE_COLUMNS = ["Store #", "Territory", "Franchisee", "FBC", "OM"];
const STAFF_WIDTHS = [30, 12, 34];
const STORE_WIDTHS = [9, 10, 30, 28, 28];

const HEADERS = {
  name: ["name", "full name", "fbc / om", "fbc/om", "staff", "person"],
  role: ["role", "position", "title"],
  email: ["email", "email address", "e-mail"],
  num: ["store #", "store", "store number", "store no", "store num"],
  fbc: ["fbc", "fbc name"],
  om: ["om", "om name"],
};
/** Words in an FBC / OM cell that remove the person from the store. */
const CLEAR_WORDS = ["none", "-", "—", "n/a", "na", "unassigned", "not assigned", "vacant"];

const headerKey = (value) => String(value || "").replace(/\*/g, "").toLowerCase().replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();
const fieldOfHeader = (value) => {
  const key = headerKey(value);
  return Object.keys(HEADERS).find((field) => HEADERS[field].some((name) => headerKey(name) === key)) || null;
};

/** "fbc", "OM", "OM & FBC", "FBC/OM", "Both" -> ["FBC"], ["OM"], ["FBC", "OM"]; null when not a role. */
export function parseRoles(value) {
  const text = String(value || "").toLowerCase();
  if (!text.trim()) return [];
  if (/\bboth\b/.test(text)) return ["FBC", "OM"];
  const roles = [/\bfbc\b/.test(text) && "FBC", /\bom\b/.test(text) && "OM"].filter(Boolean);
  const leftover = text.replace(/\bfbc\b|\bom\b|&|\/|,|\band\b|\s/g, "");
  return roles.length && !leftover ? roles : null;
}

/** ["FBC", "OM"] -> "OM & FBC" (the app's spelling). */
const roleText = (roles) => (roles.includes("FBC") && roles.includes("OM") ? "OM & FBC" : roles[0] || "");

/* ---------- template and export ---------- */

function instructionsSheet(XLSX) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["How to fill the FBC / OM update"], [""],
    ["Staff sheet — one row per person:"],
    ["• Name is required. Role is FBC, OM or OM & FBC. Blank Role or Email leaves the saved one unchanged."],
    ["• A name (or email) that isn't saved yet adds a new person — Role is then required."],
    ["• Matching is by email first, then by name. To rename someone, keep their email and change the name."],
    ["• People not in the file are left as they are (nobody is deleted)."], [""],
    ["Stores sheet — one row per store:"],
    ["• Store # is required. FBC and OM: the person's name (or email) as on the Staff sheet or in the app."],
    ["• Blank FBC / OM leaves it unchanged. Type None to remove the FBC or OM from the store."],
    ["• Territory and Franchisee are only there to help you find the store — they are not changed here."],
    ["• Putting an OM in the FBC column (or the other way round) makes them OM & FBC."], [""],
    ["You can upload just one of the two sheets. Nothing is saved until you check the preview and click Update."],
  ]);
  sheet["!cols"] = [{ wch: 110 }];
  return sheet;
}

function textSheet(XLSX, rows, widths) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  // Keep Store # as text so leading zeros survive.
  Object.keys(sheet).filter((ref) => ref[0] !== "!").forEach((ref) => { sheet[ref].t = "s"; sheet[ref].z = "@"; });
  return sheet;
}

function writeWorkbook(XLSX, staffRows, storeRows, fileName) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, textSheet(XLSX, [STAFF_COLUMNS, ...staffRows], STAFF_WIDTHS), "Staff");
  XLSX.utils.book_append_sheet(workbook, textSheet(XLSX, [STORE_COLUMNS, ...storeRows], STORE_WIDTHS), "Stores");
  XLSX.utils.book_append_sheet(workbook, instructionsSheet(XLSX), "Instructions");
  XLSX.writeFile(workbook, fileName);
}

export async function downloadStaffTemplate() {
  writeWorkbook(await loadXlsx(), [], [], "fbc-om-update-template.xlsx");
}

/** Every FBC / OM and every store's FBC and OM, to edit and upload again. */
export async function downloadStaffData(ctx) {
  const nameOf = (id) => (id == null ? "" : ctx.staffById.get(id)?.name || "");
  const staffRows = ctx.staff.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map((person) => [person.name || "", person.role || "", emailOf(person) || ""]);
  const storeRows = ctx.stores.slice().sort((a, b) => compareNumbers(a.num, b.num))
    .map((store) => [store.num || "", store.territory || "", ctx.frById.get(store.franchisee_id)?.name || "", nameOf(store.fbc_id), nameOf(store.om_id)]);
  writeWorkbook(await loadXlsx(), staffRows, storeRows, `fbc-om-data-${localDateInput()}.xlsx`);
}

/* ---------- reading ---------- */

/** Reads the file. Returns { staffRows, storeRows } (each [{ row, sheet, values }]) or { error }. */
export async function readStaffFile(file) {
  const XLSX = await loadXlsx();
  let workbook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } catch {
    return { error: "Couldn't read that file. Save it as .xlsx or .csv and try again." };
  }
  const out = { staffRows: [], storeRows: [] };
  workbook.SheetNames.filter((name) => name !== "Instructions").forEach((name) => {
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: false, blankrows: true });
    const kindOf = (cells) => {
      const fields = cells.map(fieldOfHeader);
      if (fields.includes("num") && (fields.includes("fbc") || fields.includes("om"))) return "stores";
      if (fields.includes("name")) return "staff";
      return null;
    };
    const headerIndex = grid.slice(0, 10).findIndex((cells) => kindOf(cells));
    if (headerIndex < 0) return;
    const kind = kindOf(grid[headerIndex]);
    const columns = grid[headerIndex].map(fieldOfHeader);
    const rows = grid.slice(headerIndex + 1).map((cells, index) => ({
      row: headerIndex + index + 2, sheet: name,
      values: Object.fromEntries(columns.map((field, column) => [field, String(cells[column] ?? "").trim()]).filter(([field]) => field)),
    })).filter((entry) => Object.values(entry.values).some(Boolean));
    (kind === "stores" ? out.storeRows : out.staffRows).push(...rows);
  });
  if (!out.staffRows.length && !out.storeRows.length) {
    return { error: `No FBC / OM data found. Use the template — Staff sheet: ${STAFF_COLUMNS.join(" | ")}; Stores sheet: Store # | FBC | OM.` };
  }
  return out;
}

/* ---------- checking ---------- */

/**
 * Works out every change without saving.
 * Returns { staffResults, storeResults, newStaff, staffUpdates, storeUpdates }.
 */
export function planStaffUpdate(ctx, parsed) {
  const byEmail = new Map();
  const byName = new Map();
  ctx.staff.forEach((person) => {
    const email = String(emailOf(person) || "").toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, person);
    const name = normalizeName(person.name);
    if (name && !byName.has(name)) byName.set(name, person);
  });

  /** One entry per person touched by the file. */
  const entries = new Map();
  const entryNames = new Map(); // normalized name (saved or new) -> entry
  const entryFor = (existing, name) => {
    const key = existing ? `id:${existing.id}` : `new:${normalizeName(name)}`;
    if (!entries.has(key)) {
      const entry = {
        key, existing, name: existing ? existing.name || "" : name,
        roles: existing ? rolesOf(existing).filter((role) => role === "FBC" || role === "OM") : [],
        email: existing ? String(emailOf(existing) || "").toLowerCase() : "", fromStaffRow: 0,
      };
      entries.set(key, entry);
    }
    return entries.get(key);
  };
  const remember = (entry) => { entryNames.set(normalizeName(entry.name), entry); if (entry.existing) entryNames.set(normalizeName(entry.existing.name), entry); };

  // Staff sheet first, so the Stores sheet can use new people and new names.
  const staffResults = parsed.staffRows.map(({ row, sheet, values }) => {
    const out = { row, sheet, name: values.name || "", ok: false, msg: "" };
    const name = String(values.name || "").replace(/\s+/g, " ").trim();
    const email = String(values.email || "").trim().toLowerCase();
    const roles = parseRoles(values.role);
    if (!name) { out.msg = "Name is missing"; return out; }
    if (roles === null) { out.msg = `Role "${values.role}" isn't FBC, OM or OM & FBC`; return out; }
    if (email && !isEmail(email)) { out.msg = `Email not valid: ${email}`; return out; }

    const emailMatch = (email && byEmail.get(email)) || null;
    const nameMatch = byName.get(normalizeName(name)) || null;
    // The email belongs to someone else than the person with this name.
    if (emailMatch && nameMatch && emailMatch.id !== nameMatch.id) { out.msg = `${email} already belongs to ${emailMatch.name}`; return out; }
    const existing = emailMatch || nameMatch;
    if (!existing && !roles.length) { out.msg = `${name} is new — fill Role (FBC, OM or OM & FBC)`; return out; }
    const entry = entryFor(existing, name);
    if (entry.fromStaffRow) { out.msg = `${name} is repeated (row ${entry.fromStaffRow})`; return out; }
    const takenInFile = email && [...entries.values()].find((other) => other !== entry && other.fromStaffRow && other.email === email);
    if (takenInFile) { out.msg = `${email} is also on row ${takenInFile.fromStaffRow}`; return out; }

    entry.fromStaffRow = row;
    entry.name = name;
    if (roles.length) entry.roles = roles;
    if (email) entry.email = email;
    remember(entry);
    Object.assign(out, { ok: true, name, msg: existing ? "" : `New ${roleText(roles)}` });
    return out;
  });

  const findPerson = (text) => {
    const key = text.toLowerCase();
    const entry = entryNames.get(normalizeName(text));
    if (entry) return entry;
    const existing = (isEmail(key) && byEmail.get(key)) || byName.get(normalizeName(text));
    if (!existing) return null;
    const found = entryFor(existing, existing.name);
    remember(found);
    return found;
  };

  const seenStores = {};
  const storeUpdates = [];
  const storeResults = parsed.storeRows.map(({ row, sheet, values }) => {
    const num = String(values.num || "").replace(/^#/, "").trim();
    const out = { row, sheet, num, ok: false, msg: "", changes: [] };
    if (!num) { out.msg = "Store # is missing"; return out; }
    const store = ctx.storeByNum.get(num);
    if (!store) { out.msg = `Store ${num} isn't in the tracker`; return out; }
    if (seenStores[num]) { out.msg = `Store ${num} is repeated (row ${seenStores[num]})`; return out; }
    seenStores[num] = row;

    const update = { storeId: store.id, num, set: {} };
    for (const [field, role, column] of [["fbc", "FBC", "fbc_id"], ["om", "OM", "om_id"]]) {
      const text = String(values[field] || "").trim();
      if (!text) continue;
      const before = store[column] == null ? "" : ctx.staffById.get(store[column])?.name || "";
      if (CLEAR_WORDS.includes(text.toLowerCase())) {
        if (store[column] != null) { update.set[column] = null; out.changes.push({ label: role, before, after: "" }); }
        continue;
      }
      const entry = findPerson(text);
      if (!entry) { out.msg = `No FBC / OM named "${text}" — add them on the Staff sheet`; return out; }
      if (!entry.roles.includes(role)) entry.roles = [...entry.roles, role];
      if (!entry.existing || entry.existing.id !== store[column]) {
        update.set[column] = entry.key;
        out.changes.push({ label: role, before, after: entry.name });
      }
    }
    if (out.changes.length) storeUpdates.push(update);
    Object.assign(out, { ok: true, msg: out.changes.length ? "" : "Already up to date" });
    return out;
  });

  const newStaff = [];
  const staffUpdates = [];
  entries.forEach((entry) => {
    if (!entry.existing) { newStaff.push(entry); return; }
    const saved = entry.existing;
    const changes = [];
    if (entry.name !== (saved.name || "")) changes.push({ label: "Name", before: saved.name || "", after: entry.name });
    const role = roleText(entry.roles);
    if (role && role !== (saved.role || "")) changes.push({ label: "Role", before: saved.role || "", after: role });
    const email = String(emailOf(saved) || "").toLowerCase();
    if (entry.email !== email) changes.push({ label: "Email", before: email, after: entry.email });
    if (changes.length) staffUpdates.push({ ...entry, role, changes });
  });

  // Rows of the Staff sheet that change nothing say so.
  staffResults.forEach((out) => {
    if (out.ok && !out.msg) {
      const update = staffUpdates.find((item) => item.fromStaffRow === out.row);
      out.msg = update ? `Updates ${update.changes.map((change) => change.label).join(", ")}` : "Already up to date";
    }
  });

  return { staffResults, storeResults, newStaff: newStaff.map((entry) => ({ ...entry, role: roleText(entry.roles) })), staffUpdates, storeUpdates };
}

/* ---------- saving ---------- */

const chunks = (list, size) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

const withEmail = (contacts, email) => [...contacts.filter((contact) => contact.type !== "email"), ...(email ? [{ type: "email", value: email }] : [])];

/**
 * Saves the plan. onProgress(done, total) is called as it goes.
 * Returns { counts: { newStaff, staff, stores }, failures: [text], error }.
 */
export async function runStaffUpdate(plan, onProgress = () => {}) {
  const counts = { newStaff: 0, staff: 0, stores: 0 };
  const failures = [];
  const idByKey = {};
  const total = plan.newStaff.length + plan.staffUpdates.length + plan.storeUpdates.length;
  let done = 0;
  const step = (amount = 1) => { done += amount; onProgress(done, total); };
  const failText = (result) => (result.error ? result.error.message || "error" : result.gone ? "was deleted by a teammate" : "kept changing — try again");

  try {
    if (plan.newStaff.length) {
      const records = plan.newStaff.map((entry) => ({ role: entry.role, name: entry.name, email: entry.email || null, contacts: withEmail([], entry.email) }));
      const result = await insertWithNextIds(TABLES.staff, records, "id,name");
      if (result.error) throw result.error;
      const byName = new Map(result.rows.map((row) => [normalizeName(row.name), row.id]));
      plan.newStaff.forEach((entry) => { idByKey[entry.key] = byName.get(normalizeName(entry.name)); });
      counts.newStaff += result.rows.length;
      step(plan.newStaff.length);
    }

    for (const part of chunks(plan.staffUpdates, 6)) {
      await Promise.all(part.map(async (entry) => {
        const result = await mergeRowSave(TABLES.staff, entry.existing.id, (fresh) => ({
          name: entry.name, role: entry.role || fresh.role, email: entry.email || null, contacts: withEmail(contactsOf(fresh), entry.email),
        }));
        if (result.row) counts.staff += 1;
        else failures.push(`${entry.name}: ${failText(result)}`);
        step();
      }));
    }

    const idOf = (key) => (key == null ? null : key.startsWith("id:") ? Number(key.slice(3)) : idByKey[key]);
    for (const part of chunks(plan.storeUpdates, 6)) {
      await Promise.all(part.map(async (update) => {
        const patch = {};
        for (const [column, key] of Object.entries(update.set)) {
          const id = idOf(key);
          if (key != null && !id) { failures.push(`Store ${update.num}: the new person wasn't created`); step(); return; }
          patch[column] = id;
        }
        const result = await mergeRowSave(TABLES.stores, update.storeId, () => patch);
        if (result.row) counts.stores += 1;
        else failures.push(`Store ${update.num}: ${failText(result)}`);
        step();
      }));
    }
    return { counts, failures };
  } catch (error) {
    return { counts, failures, error };
  }
}
