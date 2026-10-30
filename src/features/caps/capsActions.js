/* Adding, updating, deleting and importing CAPs records. */
import { CAP_STATES } from "../../config/constants.js";
import { TABLES, deleteWhere, guardedUpdate, insertRows, mergeRowSave } from "../../services/api.js";
import { addRows, getContext, removeRows, replaceRow } from "../../state/dataStore.js";
import { confirmAction } from "../../state/dialogs.js";
import { saveSucceeded, toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";
import { contactToSave, storeContactDefaults } from "../../domain/caps.js";
import { nowIso } from "../../lib/format.js";
import { cleanStoreNumber } from "../../lib/text.js";

const isDuplicateError = (error) => error?.code === "23505";

/** Saved CAPs record of a store number, or null. */
export const findCap = (ctx, num, exceptId = null) => ctx.caps.find((record) => String(record.store_num) === cleanStoreNumber(num) && record.id !== exceptId) || null;

/** Contact fields to save: blank when they match the store records. */
function contactFields(ctx, num, { name, email, phone }) {
  const defaults = storeContactDefaults(ctx, num);
  return { store_name: contactToSave(name, defaults.name), email: contactToSave(email, defaults.email), phone: contactToSave(phone, defaults.phone) };
}

/** due_date to save ("yyyy-mm-dd" or null), only when the database has the column. */
const dueField = (ctx, dueDate) => (ctx.capsDueReady ? { due_date: dueDate || null } : {});

/** Adds one store. New stores always start at "No Action Yet". Returns true when saved. */
export async function createCap({ num, name, email, phone, notes, dueDate }) {
  const ctx = getContext();
  const storeNum = cleanStoreNumber(num);
  if (findCap(ctx, storeNum)) { toast(`Store ${storeNum} is already in CAPs Monitoring`, "err"); return false; }
  const ts = nowIso();
  const record = { store_num: storeNum, ...contactFields(ctx, storeNum, { name, email, phone }), status: CAP_STATES[0], notes: String(notes || "").trim(), ...dueField(ctx, dueDate), created_at: ts, updated_at: ts };
  const result = await insertRows(TABLES.caps, [record]);
  if (result.error) {
    if (isDuplicateError(result.error)) toast(`Store ${storeNum} was just added by a teammate — click Refresh`, "err");
    else toastError(result.error);
    return false;
  }
  addRows("caps", result.rows);
  toast(`Store ${storeNum} added to CAPs Monitoring · ${CAP_STATES[0]}`, "ok");
  return true;
}

/** Saves changed fields of a record (status, contacts, notes, due date). Returns true when saved. */
export async function updateCap(record, { name, email, phone, status, notes, dueDate }, { quiet = false } = {}) {
  const ctx = getContext();
  const patch = { updated_at: nowIso() };
  if (name !== undefined || email !== undefined || phone !== undefined) Object.assign(patch, contactFields(ctx, record.store_num, { name, email, phone }));
  if (status !== undefined) patch.status = status;
  if (notes !== undefined) patch.notes = String(notes || "").trim();
  if (dueDate !== undefined) Object.assign(patch, dueField(ctx, dueDate));
  const result = await guardedUpdate(TABLES.caps, record, patch);
  if (!saveSucceeded(result, `CAPs record for store ${record.store_num}`)) return false;
  replaceRow("caps", result.row);
  if (!quiet) toast(status !== undefined && status !== record.status ? `Store ${record.store_num} → ${status}` : `Store ${record.store_num} updated`, "ok");
  return true;
}

export function askDeleteCap(recordId) {
  const record = getContext().caps.find((item) => item.id === recordId);
  if (!record) return;
  confirmAction({
    text: `Remove store ${record.store_num} from CAPs Monitoring? Its status and notes are deleted. The store itself and its issues are not affected.`,
    okLabel: "Remove",
    onConfirm: async () => {
      const error = await deleteWhere(TABLES.caps, "id", recordId);
      if (error) { toastError(error); return false; }
      removeRows("caps", (item) => item.id === recordId);
      toast(`Store ${record.store_num} removed from CAPs Monitoring`, "ok");
      return true;
    },
  });
}

const chunks = (list, size) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

/**
 * Saves an import plan: adds the new stores and, when overwrite is on, updates the existing ones.
 * onProgress(done, total). Returns { added, updated, failures: [text], error }.
 */
export async function runCapsImport(plan, overwrite, onProgress = () => {}) {
  const { adds } = plan;
  const updates = overwrite ? plan.updates : [];
  const total = adds.length + updates.length;
  const failures = [];
  let added = 0;
  let updated = 0;
  let done = 0;
  const step = (amount = 1) => { done += amount; onProgress(done, total); };
  try {
    for (const part of chunks(adds, 200)) {
      const ts = nowIso();
      const result = await insertRows(TABLES.caps, part.map((row) => ({ ...row.save, created_at: ts, updated_at: ts })));
      if (result.error) {
        if (!isDuplicateError(result.error)) throw result.error;
        failures.push(`Some of stores ${part.map((row) => row.num).join(", ")} were added by a teammate meanwhile — click Refresh and import again`);
      } else {
        addRows("caps", result.rows);
        added += result.rows.length;
      }
      step(part.length);
    }
    for (const row of updates) {
      const result = await mergeRowSave(TABLES.caps, row.existingId, () => ({ ...row.patch, updated_at: nowIso() }));
      if (result.row) { replaceRow("caps", result.row); updated += 1; } else failures.push(`Store ${row.num}: ${result.error ? result.error.message || "error" : result.gone ? "was removed by a teammate" : "kept changing — try again"}`);
      step();
    }
    return { added, updated, failures };
  } catch (error) {
    return { added, updated, failures, error };
  }
}
