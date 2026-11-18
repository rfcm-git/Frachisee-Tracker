/* Saving, completing and deleting call logs. */
import { TABLES, deleteWhere, guardedUpdate, insertRows } from "../../services/api.js";
import { addRows, getContext, removeRows, replaceRow } from "../../state/dataStore.js";
import { DIALOG, closeDialogs, confirmAction } from "../../state/dialogs.js";
import { toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";
import { callFranchiseeName, callHistory, hasOpenFollowUp } from "../../domain/calls.js";
import { formatCallTime, formatTimestamp, nowIso } from "../../lib/format.js";
import { friendlyError } from "../../lib/errors.js";
import { askNotificationPermission, clearCallSnooze } from "./callReminders.js";

const CHANGE_LABELS = { call_at: "call time", reason: "reason", result: "result", outcome: "outcome", store_num: "store", follow_up: "follow-up", next_follow_up_at: "next follow-up" };

/** Names of the fields that differ between the saved call and the edited record. */
function changedFields(before, after) {
  const value = (row, key) => (key === "call_at" || key === "next_follow_up_at" ? (row[key] ? new Date(row[key]).getTime() : null) : (row[key] ?? null));
  return Object.keys(CHANGE_LABELS).filter((key) => String(value(before, key)) !== String(value(after, key))).map((key) => CHANGE_LABELS[key]);
}

/**
 * Inserts or updates a call. Returns { ok: true } or { message } to show in the form.
 * existing: the call being edited (or null); franchisee: the franchisee row (or null);
 * note: optional update note saved in the call's history.
 */
export async function saveCall(existing, record, franchisee, note = "") {
  const ts = nowIso();
  const follow = record.follow_up;
  let result;
  if (existing) {
    const patch = { ...record };
    const wasOpen = hasOpenFollowUp(existing);
    if (follow) patch.follow_up_done_at = null;
    else if (wasOpen && record.outcome === "Completed") { patch.follow_up = true; patch.follow_up_done_at = ts; } // Completed closes the open follow-up
    else {
      patch.follow_up = !!existing.follow_up && !!existing.follow_up_done_at;
      if (!patch.follow_up) patch.follow_up_done_at = null;
    }
    patch.history = [...callHistory(existing), {
      ts, kind: "edited", prev: existing.outcome || null, outcome: record.outcome, note, changes: changedFields(existing, patch),
      follow_up: patch.follow_up && !patch.follow_up_done_at, next: patch.next_follow_up_at, closed: !!(wasOpen && patch.follow_up_done_at),
    }];
    if (franchisee && !existing.franchisee_name) patch.franchisee_name = franchisee.name;
    result = await guardedUpdate(TABLES.callLogs, existing, patch);
    if (result.row) replaceRow("callLogs", result.row);
  } else {
    const history = [{ ts, kind: "logged", call_at: record.call_at, outcome: record.outcome, note, follow_up: follow, next: record.next_follow_up_at }];
    result = await insertRows(TABLES.callLogs, [{ ...record, history, franchisee_name: franchisee ? franchisee.name : "" }]);
    if (result.rows) addRows("callLogs", result.rows);
  }
  if (result.conflict) return { message: "Someone else changed this call log. Close and reopen it to get the latest version." };
  if (result.error) { const info = friendlyError(result.error); return { message: `${info.title} — ${info.body}` }; }
  const next = follow && record.next_follow_up_at;
  toast(existing ? "Call log updated" : `Call logged${franchisee ? ` for ${franchisee.name}` : ""}${next ? ` · follow-up ${formatTimestamp(next)}` : ""}`, "ok");
  if (next) {
    askNotificationPermission();
    if (existing) clearCallSnooze(existing.id);
  }
  return { ok: true };
}

export function askDeleteCall(callId) {
  const ctx = getContext();
  const call = ctx.callLogs.find((item) => item.id === callId);
  if (!call) return;
  const when = formatCallTime(call.call_at);
  confirmAction({
    text: `Delete the call to ${callFranchiseeName(ctx, call)} on ${when.date} at ${when.time}? This can't be undone.`,
    onConfirm: async () => {
      const error = await deleteWhere(TABLES.callLogs, "id", callId);
      if (error) { toastError(error); return; }
      removeRows("callLogs", (item) => item.id === callId);
      closeDialogs(DIALOG.callDetails);
      toast("Deleted", "ok");
    },
  });
}
