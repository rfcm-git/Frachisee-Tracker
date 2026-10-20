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

/** Creates one record per store + platform. Returns true when saved. */
export async function createOnboarding({ items, status, details, syncStores, skipped }) {
  const ctx = getContext();
  const ts = nowIso();
  const groupId = newGroupId();
  const records = items.map(({ num, platform }) => ({
    group_id: groupId, store_num: num, franchisee_id: ctx.storeByNum.get(num)?.franchisee_id ?? null, platform, status, details, last_update: "",
    history: [{ ts, kind: "created", status, action: "" }], created_at: ts, updated_at: ts,
  }));
  const result = await insertRows(TABLES.onboarding, records);
  if (result.error) { toastError(result.error); return false; }
  addRows("onboarding", result.rows);
  if (syncStores) await syncStorePlatforms(records.map((record) => ({ num: record.store_num, platform: record.platform, status })));
  toast(`${records.length} onboarding record${records.length > 1 ? "s" : ""} created${skipped ? ` · ${skipped} skipped` : ""}`, "ok");
  return true;
}

/** Changes the status and/or adds a progress note. Returns true when saved. */
export async function updateOnboarding(record, { status, text, syncStore }) {
  const ts = nowIso();
  const patch = { status, updated_at: ts, history: [...obHistory(record), { ts, kind: "update", prev: record.status, status, action: text }] };
  if (text) patch.last_update = text;
  const result = await guardedUpdate(TABLES.onboarding, record, patch);
  if (!saveSucceeded(result, "This onboarding record")) return false;
  replaceRow("onboarding", result.row);
  if (syncStore) await syncStorePlatforms([{ num: String(result.row.store_num), platform: result.row.platform, status }]);
  toast(`Store ${result.row.store_num} · ${obPlatformName(result.row.platform)} → ${status}`, "ok");
  return true;
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
