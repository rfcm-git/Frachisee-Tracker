/* Saving Walmart records. The store's Walmart status (Delivery Platforms) always follows the saved stage. */
import { WM_STAGES } from "../../config/constants.js";
import { TABLES, deleteWhere, guardedUpdate, insertRows, mergeRowSave } from "../../services/api.js";
import { addRows, getContext, removeRows, replaceRow } from "../../state/dataStore.js";
import { confirmAction } from "../../state/dialogs.js";
import { saveSucceeded, toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";
import { normalizeWmStage, wmHistory, wmPlatformStatus } from "../../domain/walmart.js";
import { nowIso } from "../../lib/format.js";
import { syncStorePlatforms } from "../stores/storeActions.js";

const MAX_NOTE = 2000;

const isDuplicateError = (error) => error?.code === "23505";

const chunks = (list, size) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

const failText = (result) => (result.error ? result.error.message || "error" : result.gone ? "was removed by a teammate" : "kept changing — try again");

/**
 * Saves an import plan: adds the new stores, changes the stages that differ, then sets each store's
 * Walmart status to match its stage. onProgress(done, total).
 * Returns { added, changed, synced, failures: [text], error }.
 */
export async function runWalmartImport(plan, onProgress = () => {}) {
  const syncRows = plan.storeSync;
  const total = plan.adds.length + plan.changes.length + syncRows.length;
  const failures = [];
  const saved = new Set();
  let added = 0;
  let changed = 0;
  let done = 0;
  let error = null;
  const step = (amount = 1) => { done += amount; onProgress(done, total); };

  try {
    for (const part of chunks(plan.adds, 200)) {
      const ts = nowIso();
      const result = await insertRows(TABLES.walmart, part.map((row) => ({
        store_num: row.num, stage: row.stage, notes: "", created_at: ts, updated_at: ts,
        history: [{ ts, kind: "created", source: "import", stage: row.stage }],
      })));
      if (result.error) {
        if (!isDuplicateError(result.error)) throw result.error;
        failures.push(`Some of stores ${part.map((row) => row.num).join(", ")} were added by a teammate meanwhile — click Refresh and import again`);
      } else {
        addRows("walmart", result.rows);
        result.rows.forEach((row) => saved.add(String(row.store_num)));
        added += result.rows.length;
      }
      step(part.length);
    }

    for (const part of chunks(plan.changes, 6)) {
      await Promise.all(part.map(async (row) => {
        const result = await mergeRowSave(TABLES.walmart, row.existingId, (fresh) => {
          const ts = nowIso();
          const from = normalizeWmStage(fresh.stage);
          return { stage: row.stage, updated_at: ts, history: [...wmHistory(fresh), { ts, kind: "update", source: "import", from, to: row.stage }] };
        });
        if (result.row) { replaceRow("walmart", result.row); saved.add(row.num); changed += 1; }
        else failures.push(`Store ${row.num}: ${failText(result)}`);
        step();
      }));
    }
  } catch (caught) {
    error = caught;
  }

  // Only stores whose Walmart record is saved (or already had this stage) get the new status, so the two never disagree.
  const items = syncRows.filter((row) => row.kind === "same" || saved.has(row.num))
    .map((row) => ({ num: row.num, platform: "wm", status: wmPlatformStatus(row.stage) }));
  try {
    await syncStorePlatforms(items);
  } catch (caught) {
    error = error || caught;
  }
  step(syncRows.length);
  return { added, changed, synced: items.length, failures, ...(error ? { error } : {}) };
}

/* ---------- one store at a time ---------- */

/**
 * Adds stores to the Walmart tab at one stage, with an optional note, and sets their Walmart status.
 * Stores already on the tab are not added again. Returns true when saved.
 */
export async function createWalmart({ nums, stage = WM_STAGES[0], note = "" }) {
  const ctx = getContext();
  const value = normalizeWmStage(stage);
  const text = String(note || "").trim().slice(0, MAX_NOTE);
  const fresh = [...new Set(nums.map(String))].filter((num) => !ctx.walmart.some((record) => String(record.store_num) === num));
  if (!fresh.length) { toast("Those stores are already on the Walmart tab", "err"); return false; }
  const ts = nowIso();
  const result = await insertRows(TABLES.walmart, fresh.map((num) => ({
    store_num: num, stage: value, notes: text, created_at: ts, updated_at: ts,
    history: [{ ts, kind: "created", stage: value, ...(text ? { note: text } : {}) }],
  })));
  if (result.error) {
    if (isDuplicateError(result.error)) toast("One of these stores was just added by a teammate — click Refresh", "err");
    else toastError(result.error);
    return false;
  }
  addRows("walmart", result.rows);
  await syncStorePlatforms(fresh.map((num) => ({ num, platform: "wm", status: wmPlatformStatus(value) })));
  toast(fresh.length === 1 ? `Store ${fresh[0]} added to Walmart · ${value}` : `${fresh.length} stores added to Walmart · ${value}`, "ok");
  return true;
}

/**
 * Changes the stage and/or adds a note, logs it, and sets the store's Walmart status to match.
 * Returns true when saved (or nothing to save).
 */
export async function updateWalmart(record, { stage, note = "" }, { quiet = false } = {}) {
  const before = normalizeWmStage(record.stage);
  const after = stage === undefined ? before : normalizeWmStage(stage);
  const text = String(note || "").trim().slice(0, MAX_NOTE);
  if (after === before && !text) {
    if (!quiet) toast("No changes to save");
    return true;
  }
  const ts = nowIso();
  const entry = { ts, kind: "update", ...(after !== before ? { from: before, to: after } : {}), ...(text ? { note: text } : {}) };
  const patch = { stage: after, updated_at: ts, history: [...wmHistory(record), entry], ...(text ? { notes: text } : {}) };
  const result = await guardedUpdate(TABLES.walmart, record, patch);
  if (!saveSucceeded(result, `Walmart record for store ${record.store_num}`)) return false;
  replaceRow("walmart", result.row);
  if (after !== before) await syncStorePlatforms([{ num: String(record.store_num), platform: "wm", status: wmPlatformStatus(after) }]);
  if (!quiet) toast(after !== before ? `Store ${record.store_num} → ${after}` : `Note added to store ${record.store_num}`, "ok");
  return true;
}

/** Confirms, then removes a store from the Walmart tab. The store's Walmart status is left as it is. */
export function askDeleteWalmart(recordId, onDone = () => {}) {
  const record = getContext().walmart.find((item) => item.id === recordId);
  if (!record) return;
  confirmAction({
    text: `Remove store ${record.store_num} from the Walmart tab? Its stage and notes are deleted. The store itself and its Walmart status under Delivery Platforms are not changed.`,
    okLabel: "Remove",
    onConfirm: async () => {
      const error = await deleteWhere(TABLES.walmart, "id", recordId);
      if (error) { toastError(error); return false; }
      removeRows("walmart", (item) => item.id === recordId);
      toast(`Store ${record.store_num} removed from the Walmart tab`, "ok");
      onDone();
      return true;
    },
  });
}
