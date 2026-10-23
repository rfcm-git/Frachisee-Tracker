/*
 * Update franchisees and stores from a spreadsheet: template, export of the current data, reading and checking rows, saving.
 * Blank cells leave the saved value unchanged, so a file can update only some columns (for example just Email and Cell Phone).
 */
import { TABLES, insertRows, insertWithNextIds, mergeRowSave } from "../../services/api.js";
import { contactsOf, emptyPlatforms, territorySet } from "../../domain/records.js";
import { localDateInput, phone10 } from "../../lib/format.js";
import { compareNumbers, isEmail, normalizeName } from "../../lib/text.js";
import { loadXlsx } from "../../lib/xlsx.js";
import { findDuplicateFranchisee } from "./franchiseeSelectors.js";

export const UPDATE_COLUMNS = ["Territory", "Store #", "Owner / Franchisee", "Email", "Store Address", "City", "State", "Zip", "Cell Phone", "Other Phone", "Store Phone"];
const COLUMN_WIDTHS = [10, 9, 30, 32, 32, 16, 7, 9, 18, 18, 16];

/** Field of each column, with the header spellings accepted for it. Other columns (e.g. Source Tab) are ignored. */
const HEADERS = {
  territory: ["territory", "terr"],
  num: ["store #", "store", "store number", "store no", "store num"],
  owner: ["owner / franchisee", "owner", "franchisee", "franchisee name"],
  email: ["email", "emails", "franchisee email"],
  address: ["store address", "address"],
  city: ["city"],
  state: ["state"],
  zip: ["zip", "zip code", "zipcode"],
  cell: ["cell phone", "cell", "franchisee cell"],
  other: ["other phone"],
  phone: ["store phone"],
};
const STORE_FIELDS = [["territory", "Territory"], ["address", "Address"], ["city", "City"], ["state", "State"], ["zip", "Zip"], ["phone", "Store Phone"]];
const CONTACT_TYPES = [["email", "Email"], ["cell", "Cell Phone"], ["other", "Other Phone"]];

const headerKey = (value) => String(value || "").replace(/\*/g, "").toLowerCase().replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();
const fieldOfHeader = (value) => Object.keys(HEADERS).find((field) => HEADERS[field].includes(headerKey(value))) || null;

const splitEmails = (value) => String(value || "").split(/[;,\s]+/).map((part) => part.trim()).filter(Boolean);
const splitPhones = (value) => String(value || "").split(/[;,\n/|]+/).map((part) => part.trim()).filter(Boolean);
const contactKey = (type, value) => (type === "email" ? String(value).trim().toLowerCase() : String(value).replace(/\D/g, "").slice(-10));
/** Contacts of a type. "Other" contacts count only when they hold a phone number. */
const isContactOf = (type) => (contact) => contact.type === type && (type !== "other" || !!phone10(contact.value));
const valuesOf = (contacts, type) => contacts.filter(isContactOf(type)).map((contact) => contact.value);

/** Adds the file's emails / phones to the contacts. mode "replace" first removes the saved ones of each type the file fills. */
export function mergeContacts(contacts, incoming, mode) {
  let list = contacts.slice();
  CONTACT_TYPES.forEach(([type]) => {
    const values = incoming[type];
    if (!values.length) return;
    if (mode === "replace") list = list.filter((contact) => !isContactOf(type)(contact));
    values.forEach((value) => {
      if (!list.some((contact) => isContactOf(type)(contact) && contactKey(type, contact.value) === contactKey(type, value))) list.push({ type, value });
    });
  });
  return list;
}

const sameContacts = (a, b) => {
  const keys = (list) => list.map((contact) => `${contact.type}:${contactKey(contact.type, contact.value)}`).sort().join("|");
  return keys(a) === keys(b);
};

const mergeTerritory = (current, added) => {
  const set = territorySet(current);
  added.forEach((value) => set.add(value));
  return [...set].sort(compareNumbers).join(", ");
};

/* ---------- template and export ---------- */

function instructionsSheet(XLSX) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["How to fill the Stores sheet"], [""],
    ["• One row = one store. Fill Store # on every row, plus the columns you want to change."],
    ["• Blank cells are left unchanged. To update only a phone or email, fill Store # (or Owner / Franchisee) and that column."],
    ["• Owner / Franchisee: the store's owner. A different name than today moves (transfers) the store to that owner."],
    ["  If no franchisee has that name yet, a new franchisee is created. Match existing names exactly, e.g. \"Doe, John\"."],
    ["• A Store # that doesn't exist yet adds a new store — Owner / Franchisee is then required."],
    ["• Leave Store # blank to update only the franchisee's Email / Cell Phone / Other Phone."],
    ["• Email, Cell Phone and Other Phone belong to the franchisee. Separate several with \";\"."],
    ["  In the app you choose whether they replace the saved ones (default) or are added to them."],
    ["• Phones: any 10-digit number — it is formatted as (555) 123-4567."],
    ["• Columns may be in any order. Extra columns (e.g. Source Tab) are ignored. Don't rename the column titles."],
    ["• Nothing is saved until you check the preview and click Update in the app."], [""],
    ["Example rows (do not paste these into the Stores sheet):"],
    UPDATE_COLUMNS,
    ["540", "99901", "Doe, John", "john@email.com", "123 Main St", "Fresno", "CA", "93701", "5551234567", "", "5559876543"],
    ["", "99902", "", "", "", "", "", "", "", "", "5551112222"],
    ["626", "99903", "Smith, Anna", "", "", "", "", "", "", "", ""],
    ["", "", "Smith, Anna", "anna@email.com", "", "", "", "", "5553334444", "", ""],
    [""],
    ["Row 1: updates store 99901 and John Doe's email and cell. Row 2: changes only the store phone of 99902."],
    ["Row 3: transfers store 99903 to Anna Smith (created if new). Row 4: updates only Anna Smith's email and cell."],
  ]);
  sheet["!cols"] = [{ wch: 12 }, ...COLUMN_WIDTHS.slice(1).map((wch) => ({ wch }))];
  return sheet;
}

function writeWorkbook(XLSX, rows, fileName) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([UPDATE_COLUMNS, ...rows]);
  sheet["!cols"] = COLUMN_WIDTHS.map((wch) => ({ wch }));
  // Keep Store #, Zip and phones as text so leading zeros survive.
  Object.keys(sheet).filter((ref) => ref[0] !== "!").forEach((ref) => { sheet[ref].t = "s"; sheet[ref].z = "@"; });
  XLSX.utils.book_append_sheet(workbook, sheet, "Stores");
  XLSX.utils.book_append_sheet(workbook, instructionsSheet(XLSX), "Instructions");
  XLSX.writeFile(workbook, fileName);
}

export async function downloadUpdateTemplate() {
  writeWorkbook(await loadXlsx(), [], "franchisee-store-update-template.xlsx");
}

/** Every store (and franchisees without stores) in the template format, to edit and upload again. */
export async function downloadCurrentData(ctx) {
  const contactCells = (franchisee) => {
    const contacts = franchisee ? contactsOf(franchisee) : [];
    return CONTACT_TYPES.map(([type]) => valuesOf(contacts, type).join("; "));
  };
  const rows = [];
  ctx.franchisees.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))).forEach((franchisee) => {
    const [email, cell, other] = contactCells(franchisee);
    const stores = ctx.stores.filter((store) => store.franchisee_id === franchisee.id).sort((a, b) => compareNumbers(a.num, b.num));
    if (!stores.length) rows.push([franchisee.territory || "", "", franchisee.name || "", email, "", "", "", "", cell, other, ""]);
    stores.forEach((store) => rows.push([store.territory || "", store.num || "", franchisee.name || "", email, store.address || "", store.city || "", store.state || "", store.zip || "", cell, other, store.phone || ""]));
  });
  writeWorkbook(await loadXlsx(), rows, `franchisee-store-data-${localDateInput()}.xlsx`);
}

/* ---------- reading ---------- */

/** Reads the file. Returns { rows: [{ row, values }], fields: Set } or { error }. */
export async function readUpdateFile(file) {
  const XLSX = await loadXlsx();
  let workbook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } catch {
    return { error: "Couldn't read that file. Save it as .xlsx or .csv and try again." };
  }
  const names = [...workbook.SheetNames].sort((a, b) => (b === "Stores") - (a === "Stores"));
  for (const name of names.filter((sheetName) => sheetName !== "Instructions")) {
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: false, blankrows: true });
    const headerIndex = grid.slice(0, 10).findIndex((cells) => cells.some((cell) => fieldOfHeader(cell) === "num") || cells.some((cell) => fieldOfHeader(cell) === "owner"));
    if (headerIndex < 0) continue;
    const columns = grid[headerIndex].map(fieldOfHeader);
    const fields = new Set(columns.filter(Boolean));
    const rows = grid.slice(headerIndex + 1).map((cells, index) => ({
      row: headerIndex + index + 2,
      values: Object.fromEntries(columns.map((field, column) => [field, String(cells[column] ?? "").trim()]).filter(([field]) => field)),
    })).filter((entry) => Object.values(entry.values).some(Boolean));
    return { rows, fields };
  }
  return { error: `No "Store #" or "Owner / Franchisee" column found. Use the template — its columns are: ${UPDATE_COLUMNS.join(" | ")}.` };
}

/* ---------- checking ---------- */

/** Reads and checks one row's values. Returns { error } or the cleaned values. */
function cleanRow(values) {
  const emails = splitEmails(values.email);
  const badEmail = emails.find((email) => !isEmail(email));
  if (badEmail) return { error: `Email not valid: ${badEmail}` };
  const phones = {};
  for (const [field, label] of [["cell", "Cell Phone"], ["other", "Other Phone"]]) {
    phones[field] = splitPhones(values[field]).map(phone10);
    if (phones[field].some((value) => !value)) return { error: `${label} must be 10 digits` };
  }
  const storePhone = values.phone ? phone10(values.phone) : "";
  if (storePhone === null) return { error: "Store Phone must be 10 digits" };
  return {
    num: String(values.num || "").replace(/^#/, "").trim(),
    owner: String(values.owner || "").replace(/\s+/g, " ").trim(),
    contacts: { email: emails, cell: phones.cell, other: phones.other },
    store: { territory: values.territory || "", address: values.address || "", city: values.city || "", state: String(values.state || "").toUpperCase(), zip: values.zip || "", phone: storePhone },
  };
}

/**
 * Works out every change without saving. mode = "replace" | "add" (franchisee emails / phones).
 * Returns { rows, newFranchisees, franchiseeUpdates, storeUpdates, newStores, emptied }.
 */
export function planBulkUpdate(ctx, parsed, mode) {
  const rows = [];
  const owners = new Map(); // name key -> { key, name, existing, contacts: { email, cell, other }, territories }
  const seenStores = {};
  const storeUpdates = [];
  const newStores = [];

  const ownerEntry = (name, existing) => {
    const key = normalizeName(name);
    if (!owners.has(key)) owners.set(key, { key, name: existing ? existing.name : name, existing, contacts: { email: [], cell: [], other: [] }, territories: new Set() });
    return owners.get(key);
  };

  parsed.rows.forEach(({ row, values }) => {
    const out = { row, num: "", owner: "", ok: false, msg: "", notes: [] };
    rows.push(out);
    const clean = cleanRow(values);
    if (clean.error) { out.msg = clean.error; return; }
    Object.assign(out, { num: clean.num, owner: clean.owner });
    const store = clean.num ? ctx.storeByNum.get(clean.num) : null;
    if (clean.num && seenStores[clean.num]) { out.msg = `Store ${clean.num} is repeated (row ${seenStores[clean.num]})`; return; }

    // Owner named in the row, or the store's current owner when the cell is blank.
    const existing = clean.owner ? findDuplicateFranchisee(ctx, clean.owner, null) : store ? ctx.frById.get(store.franchisee_id) || null : null;
    if (!clean.owner) {
      if (store && !existing) { out.msg = `Store ${clean.num} has no owner saved — fill Owner / Franchisee`; return; }
      if (!store) { out.msg = clean.num ? `Store ${clean.num} is new — fill Owner / Franchisee to add it` : "Fill Store # or Owner / Franchisee"; return; }
    }

    const owner = ownerEntry(existing ? existing.name : clean.owner, existing);
    out.owner = owner.name;
    CONTACT_TYPES.forEach(([type]) => clean.contacts[type].forEach((value) => {
      if (!owner.contacts[type].some((saved) => contactKey(type, saved) === contactKey(type, value))) owner.contacts[type].push(value);
    }));
    if (clean.store.territory) owner.territories.add(clean.store.territory);

    if (!clean.num) { out.ok = true; out.msg = "Franchisee info only"; return; }
    seenStores[clean.num] = row;
    if (!store) {
      newStores.push({ ownerKey: owner.key, store: { num: clean.num, ...clean.store } });
      Object.assign(out, { ok: true, msg: owner.existing ? `New store for ${owner.name}` : `New store + new franchisee ${owner.name}` });
      return;
    }
    const patch = {};
    const changed = [];
    STORE_FIELDS.forEach(([field, label]) => {
      const value = clean.store[field];
      if (value && value !== String(store[field] ?? "")) { patch[field] = value; changed.push(label); }
    });
    const transfer = !owner.existing || owner.existing.id !== store.franchisee_id;
    const fromName = ctx.frById.get(store.franchisee_id)?.name || "no owner";
    if (transfer) out.notes.push(`Transfer: ${fromName} → ${owner.name}${owner.existing ? "" : " (new)"}`);
    if (changed.length) out.notes.push(`Updates ${changed.join(", ")}`);
    if (!out.notes.length && CONTACT_TYPES.some(([type]) => clean.contacts[type].length)) out.notes.push("Store unchanged · owner's email / phones are listed under Franchisee changes");
    if (transfer || changed.length) storeUpdates.push({ storeId: store.id, num: clean.num, patch, ownerKey: transfer ? owner.key : null, fromId: store.franchisee_id });
    Object.assign(out, { ok: true, transfer, msg: out.notes.length ? out.notes.join(" · ") : "Store already up to date" });
  });

  const newFranchisees = [];
  const franchiseeUpdates = [];
  owners.forEach((owner) => {
    if (!owner.existing) {
      newFranchisees.push(owner);
      return;
    }
    const saved = contactsOf(owner.existing);
    const contacts = mergeContacts(saved, owner.contacts, mode);
    const territory = mergeTerritory(owner.existing.territory, owner.territories);
    const changes = CONTACT_TYPES.map(([type, label]) => {
      const before = valuesOf(saved, type);
      const after = valuesOf(contacts, type);
      return before.join("|") === after.join("|") ? null : { label, before, after };
    }).filter(Boolean);
    if (territory !== (owner.existing.territory || "")) changes.push({ label: "Territory", before: [owner.existing.territory || ""].filter(Boolean), after: [territory] });
    if (!sameContacts(saved, contacts) || territory !== (owner.existing.territory || "")) franchiseeUpdates.push({ ...owner, id: owner.existing.id, changes });
  });

  // Franchisees left with no stores after the transfers.
  const movedAway = new Map();
  storeUpdates.filter((update) => update.ownerKey).forEach((update) => movedAway.set(update.fromId, (movedAway.get(update.fromId) || 0) + 1));
  const incoming = new Set([...storeUpdates.filter((update) => update.ownerKey), ...newStores].map((item) => item.ownerKey));
  const emptied = [...movedAway.entries()]
    .map(([id, count]) => ({ franchisee: ctx.frById.get(id), count }))
    .filter(({ franchisee, count }) => franchisee && !incoming.has(normalizeName(franchisee.name))
      && ctx.stores.filter((store) => store.franchisee_id === franchisee.id).length === count)
    .map(({ franchisee }) => franchisee.name);

  const ownerIds = Object.fromEntries([...owners.values()].filter((owner) => owner.existing).map((owner) => [owner.key, owner.existing.id]));
  return { rows, newFranchisees, franchiseeUpdates, storeUpdates, newStores, emptied, ownerIds, mode };
}

/* ---------- saving ---------- */

const chunks = (list, size) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

/** Runs task on every item, a few at a time. */
async function eachLimited(items, limit, task) {
  for (const part of chunks(items, limit)) await Promise.all(part.map(task));
}

/**
 * Saves the plan. onProgress(done, total) is called as it goes.
 * Returns { counts: { newFranchisees, franchisees, stores, transfers, newStores }, failures: [text], error }.
 */
export async function runBulkUpdate(plan, onProgress = () => {}) {
  const counts = { newFranchisees: 0, franchisees: 0, stores: 0, transfers: 0, newStores: 0 };
  const failures = [];
  const idByKey = { ...plan.ownerIds };
  const total = plan.newFranchisees.length + plan.franchiseeUpdates.length + plan.storeUpdates.length + plan.newStores.length;
  let done = 0;
  const step = (amount = 1) => { done += amount; onProgress(done, total); };
  const failText = (result) => (result.error ? result.error.message || "error" : result.gone ? "was deleted by a teammate" : "kept changing — try again");

  try {
    for (const part of chunks(plan.newFranchisees, 200)) {
      const records = part.map((owner) => ({
        name: owner.name, closed: false, territory: mergeTerritory("", owner.territories), notes: "",
        contacts: mergeContacts([], owner.contacts, "add"),
      }));
      const result = await insertWithNextIds(TABLES.franchisees, records, "id,name");
      if (result.error) throw result.error;
      result.rows.forEach((row) => { idByKey[normalizeName(row.name)] = row.id; });
      counts.newFranchisees += result.rows.length;
      step(part.length);
    }

    await eachLimited(plan.franchiseeUpdates, 6, async (owner) => {
      const result = await mergeRowSave(TABLES.franchisees, owner.id, (fresh) => ({
        contacts: mergeContacts(contactsOf(fresh), owner.contacts, plan.mode),
        territory: mergeTerritory(fresh.territory, owner.territories),
      }));
      if (result.row) counts.franchisees += 1;
      else failures.push(`Franchisee ${owner.name}: ${failText(result)}`);
      step();
    });

    await eachLimited(plan.storeUpdates, 6, async (update) => {
      const patch = { ...update.patch };
      if (update.ownerKey) {
        patch.franchisee_id = idByKey[update.ownerKey];
        if (!patch.franchisee_id) { failures.push(`Store ${update.num}: new owner wasn't created`); step(); return; }
      }
      const result = await mergeRowSave(TABLES.stores, update.storeId, () => patch);
      if (result.row) {
        counts.stores += 1;
        if (update.ownerKey) counts.transfers += 1;
      } else failures.push(`Store ${update.num}: ${failText(result)}`);
      step();
    });

    const storeRecords = plan.newStores.map(({ ownerKey, store }) => ({
      franchisee_id: idByKey[ownerKey], ...store, closed: false, platforms: emptyPlatforms(), gbp: "", notes: [],
    }));
    for (const part of chunks(storeRecords, 300)) {
      const result = await insertRows(TABLES.stores, part);
      if (result.error) throw result.error;
      counts.newStores += result.rows.length;
      step(part.length);
    }
    return { counts, failures };
  } catch (error) {
    return { counts, failures, error };
  }
}
