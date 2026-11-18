/* Creating, updating and deleting onboarding records. */
import { TABLES, deleteWhere, guardedUpdate, insertRows } from "../../services/api.js";
import { addRows, getContext, removeRows, replaceRow } from "../../state/dataStore.js";
import { confirmAction } from "../../state/dialogs.js";
import { saveSucceeded, toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";
import { obHistory, obPlatformName } from "../../domain/onboarding.js";
import { nowIso } from "../../lib/format.js";
import { syncStorePlatforms } from "../stores/storeActions.js";

const newGroupId = () => `O${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The database still has the old status check (Pending, Email Sent/Text Message…) until the migration is run. */
const isOldStatusCheck = (error) => error?.code === "23514" || /onboarding_status_check/i.test(String(error?.message || ""));

function onboardingSaveError(error) {
  if (isOldStatusCheck(error)) toast("The database still uses the old onboarding statuses. Run migrate-onboarding-statuses.sql in Supabase, then try again.", "err");
  else toastError(error);
}

/**
 * Creates one record per store + platform and sets the same status in each store's Delivery Platforms.
 * Items flagged exempt (store is Exempted on that platform) are recorded as Exempted instead of the starting status.
 * items = [{ num, platform, exempt, status?, details?, group? }]: status and details override the shared ones for that item;
 * items with the same group form one request (default: all items are one request). Returns the number created, or 0.
 */
export async function createOnboarding({ items, status, details, quiet = false }) {
  if (!items.length) return 0;
  const ctx = getContext();
  const ts = nowIso();
  const groupId = newGroupId();
  const records = items.map(({ num, platform, exempt, status: ownStatus, details: ownDetails, group }) => {
    const itemStatus = exempt ? "Exempted" : ownStatus || status;
    return {
      group_id: group ? `${groupId}-${group}` : groupId, store_num: num, franchisee_id: ctx.storeByNum.get(num)?.franchisee_id ?? null, platform, status: itemStatus, details: ownDetails ?? details, last_update: "",
      history: [{ ts, kind: "created", status: itemStatus, action: exempt ? "Store is Exempted on this platform" : "" }], created_at: ts, updated_at: ts,
    };
  });
  const result = await insertRows(TABLES.onboarding, records);
  if (result.error) { onboardingSaveError(result.error); return 0; }
  addRows("onboarding", result.rows);
  await syncStorePlatforms(records.map((record) => ({ num: record.store_num, platform: record.platform, status: record.status })));
  if (!quiet) {
    const exempted = records.filter((record) => record.status === "Exempted" && status !== "Exempted").length;
    toast(`${records.length} onboarding record${records.length > 1 ? "s" : ""} created${exempted ? ` · ${exempted} recorded as Exempted` : ""}`, "ok");
  }
  return records.length;
}

/**
 * Changes the status and/or adds a progress note, and sets the same status in the store's Delivery Platforms.
 * Returns true when saved.
 */
export async function updateOnboarding(record, { status, text, quiet = false }) {
  const ts = nowIso();
  const patch = { status, updated_at: ts, history: [...obHistory(record), { ts, kind: "update", prev: record.status, status, action: text }] };
  if (text) patch.last_update = text;
  const result = await guardedUpdate(TABLES.onboarding, record, patch);
  if (result.error) { onboardingSaveError(result.error); return false; }
  if (!saveSucceeded(result, "This onboarding record")) return false;
  replaceRow("onboarding", result.row);
  await syncStorePlatforms([{ num: String(result.row.store_num), platform: result.row.platform, status }]);
  if (!quiet) toast(`Store ${result.row.store_num} · ${obPlatformName(result.row.platform)} → ${status}`, "ok");
  return true;
}

/**
 * Saves a plan of new records and updates to records already on the list (single add and spreadsheet import).
 * plan = { make: [{ num, platform, exempt, status }], updates: [{ record, status, text }] }. onProgress(done, total).
 * Returns { created, updated, failures: [text] }.
 */
export async function saveOnboardingPlan({ make, updates }, { status, details, onProgress = () => {} }) {
  const total = (make.length ? 1 : 0) + updates.length;
  let done = 0;
  const failures = [];
  let created = 0;
  if (make.length) {
    created = await createOnboarding({ items: make, status, details, quiet: true });
    if (!created) failures.push(`${make.length} new record${make.length > 1 ? "s" : ""} could not be created`);
    onProgress(++done, total);
  }
  let updated = 0;
  for (const item of updates) {
    const fresh = getContext().onboarding.find((record) => record.id === item.record.id) || item.record;
    if (await updateOnboarding(fresh, { status: item.status, text: item.text, quiet: true })) updated += 1;
    else failures.push(`Store ${item.record.store_num} · ${obPlatformName(item.record.platform)} was not updated`);
    onProgress(++done, total);
  }
  return { created, updated, failures };
}

export function askDeleteOnboarding(recordId) {
  const record = getContext().onboarding.find((item) => item.id === recordId);
  if (!record) return;
  confirmAction({
    text: `Delete the ${obPlatformName(record.platform)} onboarding for store ${record.store_num}? Other stores and platforms in the same request are not affected.`,
    onConfirm: async () => {
      const error = await deleteWhere(TABLES.onboarding, "id", recordId);
      if (error) { toastError(error); return; }
      removeRows("onboarding", (item) => item.id === recordId);
      toast("Deleted", "ok");
    },
  });
}
