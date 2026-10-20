/* Logging, updating and deleting concerns. */
import { TABLES, deleteIn, deleteWhere, fetchUpdatedAt, guardedUpdate, insertRows } from "../../services/api.js";
import { addRows, getContext, removeRows, replaceRow, replaceRows } from "../../state/dataStore.js";
import { DIALOG, closeDialogs, confirmAction, showConflict } from "../../state/dialogs.js";
import { saveSucceeded, toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";
import { historyEntries, issueNumber, normalizeIssueStatus } from "../../domain/issues.js";
import { nowIso } from "../../lib/format.js";
import { oneLine } from "../../lib/richText.js";

const newGroupId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Logs an issue for one store. Returns true when saved. */
export async function logIssue({ storeNum, title, status, platforms }) {
  const store = getContext().storeByNum.get(storeNum);
  const ts = nowIso();
  const record = {
    franchisee_id: store ? store.franchisee_id : null, store_num: storeNum, title, status, platforms, action_taken: "", notes: "", updated_at: ts,
    history: [{ ts, kind: "created", status }],
  };
  const result = await insertRows(TABLES.issues, [record]);
  if (result.error) { toastError(result.error); return false; }
  addRows("issues", result.rows);
  const number = result.rows[0]?.issue_no;
  toast(`Issue ${number ? `#${number} ` : ""}logged`, "ok");
  return true;
}

/** Logs the same issue to several stores (a multi-store issue). */
export async function logMultiStoreIssue({ storeNums, title, status, platforms }) {
  const ctx = getContext();
  const groupId = newGroupId("G");
  const ts = nowIso();
  const records = storeNums.map((num) => ({
    franchisee_id: ctx.storeByNum.get(num)?.franchisee_id ?? null, store_num: num, title, status, platforms, action_taken: "", notes: "",
    group_id: groupId, created_at: ts, updated_at: ts, history: [{ ts, kind: "created", status }],
  }));
  const result = await insertRows(TABLES.issues, records);
  if (result.error) { toastError(result.error); return false; }
  addRows("issues", result.rows);
  toast(`Issue logged to ${records.length} stores`, "ok");
  return true;
}

/** Changes the status and/or adds an action taken. Returns true when saved. */
export async function updateIssue(issue, { status, action }) {
  const previous = normalizeIssueStatus(issue.status);
  const ts = nowIso();
  const patch = { status, updated_at: ts, history: [...historyEntries(issue), { ts, kind: "update", prev: previous, status, action }] };
  if (action) patch.action_taken = action;
  const result = await guardedUpdate(TABLES.issues, issue, patch);
  if (!saveSucceeded(result, "This issue")) return false;
  replaceRow("issues", result.row);
  toast("Issue updated", "ok");
  return true;
}

/** Updates the selected stores of a multi-store issue. Returns true when everything saved. */
export async function updateIssueGroup(issueIds, { status, action }) {
  const ctx = getContext();
  const check = await fetchUpdatedAt(TABLES.issues, issueIds);
  if (check.error) { toastError(check.error); return false; }
  const current = Object.fromEntries(check.rows.map((row) => [row.id, row.updated_at]));
  const changed = issueIds.some((id) => {
    const local = ctx.issues.find((issue) => issue.id === id);
    return !(id in current) || (local?.updated_at && current[id] && new Date(current[id]).getTime() !== new Date(local.updated_at).getTime());
  });
  if (changed) { showConflict("This multi-store issue"); return false; }

  const ts = nowIso();
  const results = await Promise.all(issueIds.map((id) => {
    const issue = ctx.issues.find((item) => item.id === id);
    const previous = normalizeIssueStatus(issue.status);
    const patch = { updated_at: ts, history: [...historyEntries(issue), { ts, kind: "update", prev: previous, status: status || previous, action }] };
    if (status) patch.status = status;
    if (action) patch.action_taken = action;
    return guardedUpdate(TABLES.issues, issue, patch);
  }));
  replaceRows("issues", results.filter((result) => result.row).map((result) => result.row));
  const failed = results.find((result) => result.error);
  if (failed) { toastError(failed.error); return false; }
  if (results.some((result) => result.conflict)) { showConflict("Some stores in this issue"); return false; }
  toast(`${issueIds.length} store${issueIds.length > 1 ? "s" : ""} updated`, "ok");
  return true;
}

export function askDeleteIssue(issueId) {
  const issue = getContext().issues.find((item) => item.id === issueId);
  const number = issue ? issueNumber(issue) : "";
  confirmAction({
    text: `Delete issue ${number ? `#${number} ` : ""}"${issue ? oneLine(issue.title, 80) : ""}"?`,
    onConfirm: async () => {
      const error = await deleteWhere(TABLES.issues, "id", issueId);
      if (error) { toastError(error); return; }
      removeRows("issues", (item) => item.id === issueId);
      toast("Deleted", "ok");
    },
  });
}

/** Deletes a multi-store issue from the selected stores. */
export function askDeleteIssues(issueIds) {
  confirmAction({
    text: `Delete this issue from ${issueIds.length} selected store${issueIds.length > 1 ? "s" : ""}?`,
    onConfirm: async () => {
      const error = await deleteIn(TABLES.issues, "id", issueIds);
      if (error) { toastError(error); return; }
      removeRows("issues", (item) => issueIds.includes(item.id));
      closeDialogs(DIALOG.groupUpdate);
      toast("Deleted", "ok");
    },
  });
}
