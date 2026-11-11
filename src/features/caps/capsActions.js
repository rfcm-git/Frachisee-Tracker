/* Adding, updating, deleting and importing CAPs records. */
import { CAP_STATES, STORAGE_KEYS } from "../../config/constants.js";
import { CAPS_LAST_IMPORT_KEY, TABLES, deleteWhere, guardedUpdate, insertRows, mergeRowSave, writeSetting } from "../../services/api.js";
import { addRows, getContext, removeRows, replaceRow, updateData } from "../../state/dataStore.js";
import { local } from "../../lib/storage.js";
import { confirmAction } from "../../state/dialogs.js";
import { saveSucceeded, toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";
import { capChanges, capHistoryField, normalizeCapStatus, cleanAssessmentId, contactToSave, findCapByAssessment, storeContactDefaults } from "../../domain/caps.js";
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

/** assessment_id to save, only when the database has the column. */
const assessmentField = (ctx, assessmentId) => (ctx.capsAssessmentReady ? { assessment_id: cleanAssessmentId(assessmentId) } : {});

/** Toast and true when another CAP record already uses the Assessment ID. */
function assessmentTaken(ctx, assessmentId, exceptId = null) {
  const other = ctx.capsAssessmentReady ? findCapByAssessment(ctx, assessmentId, exceptId) : null;
  if (other) toast(`Assessment ID ${cleanAssessmentId(assessmentId)} is already used by store ${other.store_num} in the CAP list`, "err");
  return !!other;
}

/** Adds one store. New stores always start at "No Action Yet". Returns true when saved. */
export async function createCap({ num, name, email, phone, notes, dueDate, assessmentId }) {
  const ctx = getContext();
  const storeNum = cleanStoreNumber(num);
  if (findCap(ctx, storeNum)) { toast(`Store ${storeNum} is already in the CAP list`, "err"); return false; }
  if (assessmentTaken(ctx, assessmentId)) return false;
  const ts = nowIso();
  const record = { store_num: storeNum, ...assessmentField(ctx, assessmentId), ...contactFields(ctx, storeNum, { name, email, phone }), status: CAP_STATES[0], notes: String(notes || "").trim(), ...dueField(ctx, dueDate), created_at: ts, updated_at: ts };
  Object.assign(record, capHistoryField(ctx, null, { ts, kind: "created", status: CAP_STATES[0] }));
  const result = await insertRows(TABLES.caps, [record]);
  if (result.error) {
    if (isDuplicateError(result.error)) toast(`Store ${storeNum} or its Assessment ID was just added by a teammate — click Refresh`, "err");
    else toastError(result.error);
    return false;
  }
  addRows("caps", result.rows);
  toast(`Store ${storeNum} added to the CAP list · ${CAP_STATES[0]}`, "ok");
  return true;
}

/**
 * Saves changed fields of a record (status, contacts, notes, due date), stamps Last Updated and logs the change.
 * Nothing is saved when no field changed. Returns true when saved (or nothing to save).
 */
export async function updateCap(record, { name, email, phone, status, notes, dueDate, assessmentId }, { quiet = false } = {}) {
  const ctx = getContext();
  const fields = {};
  if (assessmentId !== undefined) {
    if (assessmentTaken(ctx, assessmentId, record.id)) return false;
    Object.assign(fields, assessmentField(ctx, assessmentId));
  }
  if (name !== undefined || email !== undefined || phone !== undefined) Object.assign(fields, contactFields(ctx, record.store_num, { name, email, phone }));
  if (status !== undefined) fields.status = status;
  if (notes !== undefined) fields.notes = String(notes || "").trim();
  // Completed CAPs keep their due date (also when this save completes it).
  if (dueDate !== undefined && (fields.status ?? normalizeCapStatus(record.status)) !== "Completed") Object.assign(fields, dueField(ctx, dueDate));
  const changes = capChanges(record, fields);
  if (!changes.length) {
    if (!quiet) toast("No changes to save");
    return true;
  }
  const ts = nowIso();
  const patch = { ...fields, updated_at: ts, ...capHistoryField(ctx, record, { ts, kind: "update", changes }) };
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
    text: `Remove store ${record.store_num} from the CAP list? Its status and notes are deleted. The store itself and its issues are not affected.`,
    okLabel: "Remove",
    onConfirm: async () => {
      const error = await deleteWhere(TABLES.caps, "id", recordId);
      if (error) { toastError(error); return false; }
      removeRows("caps", (item) => item.id === recordId);
      toast(`Store ${record.store_num} removed from the CAP list`, "ok");
      return true;
    },
  });
}

const chunks = (list, size) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

/** Last CAP import, shared with the team in app_settings, or saved on this computer when that table is not set up. */
export const lastCapsImport = (ctx) => (ctx.capsLastImport === undefined ? local.getJson(STORAGE_KEYS.capLastImport, null) : ctx.capsLastImport);

async function saveLastImport(info) {
  local.setJson(STORAGE_KEYS.capLastImport, info);
  const shared = getContext().capsLastImport !== undefined && !(await writeSetting(CAPS_LAST_IMPORT_KEY, info));
  updateData(() => ({ capsLastImport: shared ? info : undefined }));
}

/**
 * Saves an import plan: adds the new stores, changes the status of stores already in the list (Completed, In Progress, In Review),
 * fills in missing Assessment IDs and, when overwrite is on, updates due dates of stores already in the list. Stamps the last import.
 * onProgress(done, total). Returns { added, completed, statusChanged, assessed, updated, failures: [text], error }.
 */
export async function runCapsImport(plan, overwrite, onProgress = () => {}, fileName = "") {
  const { adds } = plan;
  const updates = plan.existing
    .map((row) => ({ row, patch: { ...row.patch, ...(overwrite ? row.duePatch : {}) } }))
    .filter(({ patch }) => Object.keys(patch).length);
  const total = adds.length + updates.length;
  const failures = [];
  let added = 0;
  let completed = 0;
  let statusChanged = 0;
  let assessed = 0;
  let updated = 0;
  let done = 0;
  const finish = async (extra = {}) => {
    if (!extra.error || added || completed || statusChanged || assessed || updated) {
      await saveLastImport({ at: nowIso(), file: fileName, added, completed, statusChanged, assessed, updated });
    }
    return { added, completed, statusChanged, assessed, updated, failures, ...extra };
  };
  const step = (amount = 1) => { done += amount; onProgress(done, total); };
  try {
    for (const part of chunks(adds, 200)) {
      const ts = nowIso();
      const ctx = getContext();
      const result = await insertRows(TABLES.caps, part.map((row) => ({ ...row.save, created_at: ts, updated_at: ts, ...capHistoryField(ctx, null, { ts, kind: "created", source: "import", status: row.save.status }) })));
      if (result.error) {
        if (!isDuplicateError(result.error)) throw result.error;
        failures.push(`Some of stores ${part.map((row) => row.num).join(", ")} (or their Assessment IDs) were added by a teammate meanwhile — click Refresh and import again`);
      } else {
        addRows("caps", result.rows);
        added += result.rows.length;
      }
      step(part.length);
    }
    for (const { row, patch } of updates) {
      const result = await mergeRowSave(TABLES.caps, row.existingId, (fresh) => {
        const ts = nowIso();
        const changes = capChanges(fresh, patch);
        return { ...patch, updated_at: ts, ...(changes.length ? capHistoryField(getContext(), fresh, { ts, kind: "update", source: "import", changes }) : {}) };
      });
      if (result.row) {
        replaceRow("caps", result.row);
        if (patch.status === "Completed") completed += 1;
        else if (patch.status) statusChanged += 1;
        if (patch.assessment_id) assessed += 1;
        if (patch.due_date) updated += 1;
      } else {
        const reason = isDuplicateError(result.error) ? `Assessment ID ${row.aid} is now used by another store — click Refresh`
          : result.error ? result.error.message || "error" : result.gone ? "was removed by a teammate" : "kept changing — try again";
        failures.push(`Store ${row.num}: ${reason}`);
      }
      step();
    }
    return finish();
  } catch (error) {
    return finish({ error });
  }
}
