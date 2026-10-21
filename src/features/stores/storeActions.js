/* Saving store changes. All saves are team-safe (see services/api.js). */
import { PLATFORMS } from "../../config/constants.js";
import { TABLES, deleteWhere, guardedUpdate, insertRows, mergeStoreSave } from "../../services/api.js";
import { addRows, getContext, replaceRow, updateData } from "../../state/dataStore.js";
import { confirmAction, showConflict } from "../../state/dialogs.js";
import { saveSucceeded, toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";
import { emptyPlatforms, normalizePlatformStatus, normalizedPlatforms, notesOf, platformsOf } from "../../domain/records.js";
import { nowIso } from "../../lib/format.js";
import { errorTitle } from "../../lib/errors.js";

const platformName = (key) => (PLATFORMS.find(([value]) => value === key) || [key, key])[1];

/** Saves some store fields. Returns true when saved. */
export async function saveStoreFields(store, patch, successMessage = "Saved") {
  const result = await guardedUpdate(TABLES.stores, store, patch);
  if (!saveSucceeded(result, `Store ${store.num}`)) return false;
  replaceRow("stores", result.row);
  toast(successMessage, "ok");
  return true;
}

export function setStoreStatus(store, status) {
  return saveStoreFields(store, { store_status: status, closed: status !== "Open" }, `Store ${store.num} is now ${status}`);
}

/** Changes one delivery platform, merging with the latest saved store. */
export async function setStorePlatform(store, key, status) {
  const result = await mergeStoreSave(store.id, (fresh) => {
    const platforms = platformsOf(fresh);
    platforms[key] = status;
    return { platforms: normalizedPlatforms(platforms) };
  });
  if (result.error) { toastError(result.error); return false; }
  if (result.gone) { showConflict(`Store ${store.num}`); return false; }
  if (result.conflict) { toast("Busy — please try again", "err"); return false; }
  replaceRow("stores", result.row);
  toast(`${platformName(key)} → ${status}`, "ok");
  return true;
}

/** Adds a timestamped note to a store. Returns true when saved. */
export async function addStoreNote(store, text) {
  const note = { ts: nowIso(), text };
  const result = await mergeStoreSave(store.id, (fresh) => ({ notes: [...notesOf(fresh), note] }));
  if (result.error) { toastError(result.error); return false; }
  if (result.gone) { showConflict(`Store ${store.num}`); return false; }
  if (result.conflict) { toast("Busy — please try again", "err"); return false; }
  replaceRow("stores", result.row);
  toast("Note added", "ok");
  return true;
}

/**
 * Keeps stores' Delivery Platforms in step with onboarding:
 * Onboarded -> Active; otherwise Not enrolled -> Pending. Exempted statuses remain unchanged.
 * items = [{ num, platform, status }]
 */
export async function syncStorePlatforms(items) {
  const byStore = {};
  items.forEach((item) => { (byStore[item.num] = byStore[item.num] || []).push(item); });
  for (const num of Object.keys(byStore)) {
    const store = getContext().storeByNum.get(num);
    if (!store) continue;
    const result = await mergeStoreSave(store.id, (fresh) => {
      const platforms = platformsOf(fresh);
      byStore[num].forEach((item) => {
        const current = normalizePlatformStatus(platforms[item.platform] || "Not enrolled");
        if (item.status === "Exempted") { platforms[item.platform] = "Exempted"; return; }
        if (current === "Exempted") return;
        if (item.status === "Onboarded") platforms[item.platform] = "Active";
        else if (current === "Not enrolled") platforms[item.platform] = "Pending";
      });
      return { platforms: normalizedPlatforms(platforms) };
    });
    if (result.row) replaceRow("stores", result.row);
  }
}

/** Adds a store to a franchisee. Returns the new row or null. */
export async function createStore(record) {
  const result = await insertRows(TABLES.stores, [{ ...record, closed: false, platforms: emptyPlatforms(), gbp: "", notes: [] }]);
  if (result.error) { toast(errorTitle(result.error), "err"); return null; }
  addRows("stores", result.rows);
  toast(`Store ${record.num} added`, "ok");
  return result.rows[0] || null;
}

/** Confirms, then removes a store with its issues and onboarding records. */
export function askRemoveStore(storeId) {
  const ctx = getContext();
  const store = ctx.stores.find((item) => item.id === storeId);
  if (!store) return;
  const owner = ctx.frById.get(store.franchisee_id);
  const issueCount = ctx.issues.filter((issue) => String(issue.store_num) === String(store.num)).length;
  confirmAction({
    okLabel: "Remove",
    text: `Remove store ${store.num}${owner ? ` from "${owner.name}"` : ""}?${issueCount ? ` Its ${issueCount} issue${issueCount > 1 ? "s" : ""} will also be deleted.` : ""} This cannot be undone.`,
    onConfirm: () => removeStore(store),
  });
}

async function removeStore(store) {
  const num = String(store.num);
  let error = await deleteWhere(TABLES.issues, "store_num", num);
  if (!error && getContext().onboardingReady) error = await deleteWhere(TABLES.onboarding, "store_num", num);
  if (!error) error = await deleteWhere(TABLES.stores, "id", store.id);
  if (error) { toastError(error); return; }
  updateData((data) => ({
    onboarding: data.onboarding.filter((record) => String(record.store_num) !== num),
    issues: data.issues.filter((issue) => String(issue.store_num) !== num),
    stores: data.stores.filter((item) => item.id !== store.id),
  }));
  toast("Deleted", "ok");
}
