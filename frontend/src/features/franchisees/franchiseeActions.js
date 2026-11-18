/* Saving and deleting franchisees. */
import { TABLES, deleteWhere, guardedUpdate, insertWithNextIds } from "../../services/api.js";
import { addRows, getContext, replaceRow, updateData } from "../../state/dataStore.js";
import { askPassword, confirmAction } from "../../state/dialogs.js";
import { saveSucceeded, toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";
import { useUiStore } from "../../state/uiStore.js";
import { storesOf } from "../../domain/context.js";
import { plural } from "../../lib/format.js";

/** Updates an existing franchisee. Returns true when saved. */
export async function updateFranchisee(franchisee, record) {
  const result = await guardedUpdate(TABLES.franchisees, franchisee, record);
  if (!saveSucceeded(result, `"${franchisee.name}"`)) return false;
  replaceRow("franchisees", result.row);
  toast("Saved", "ok");
  return true;
}

/** Adds a franchisee (id taken from the database). Returns the new row or null. */
export async function createFranchisee(record) {
  const result = await insertWithNextIds(TABLES.franchisees, [record]);
  if (result.error || !result.rows[0]) { toastError(result.error); return null; }
  const row = result.rows[0];
  addRows("franchisees", [row]);
  toast("Franchisee added — use + on Stores to add their stores", "ok");
  return row;
}

/** Password, then confirmation, then delete with their stores and issues. */
export function askDeleteFranchisee(franchiseeId) {
  const ctx = getContext();
  const franchisee = ctx.frById.get(franchiseeId);
  if (!franchisee) return;
  askPassword("Password to delete a franchisee", () => {
    const storeCount = storesOf(ctx, franchiseeId).length;
    const issueCount = ctx.issues.filter((issue) => issue.franchisee_id === franchiseeId).length;
    confirmAction({
      text: `Delete "${franchisee.name || ""}" with ${plural(storeCount, "store")} and ${plural(issueCount, "issue")}? This cannot be undone — save a backup first if unsure.`,
      onConfirm: () => deleteFranchisee(franchiseeId),
    });
  });
}

async function deleteFranchisee(franchiseeId) {
  const error = await deleteWhere(TABLES.franchisees, "id", franchiseeId);
  if (error) { toastError(error); return; }
  const storeNums = new Set(storesOf(getContext(), franchiseeId).map((store) => String(store.num)));
  updateData((data) => ({
    callLogs: data.callLogs.map((call) => (call.franchisee_id === franchiseeId ? { ...call, franchisee_id: null } : call)),
    franchisees: data.franchisees.filter((item) => item.id !== franchiseeId),
    stores: data.stores.filter((store) => store.franchisee_id !== franchiseeId),
    issues: data.issues.filter((issue) => issue.franchisee_id !== franchiseeId && !storeNums.has(String(issue.store_num))),
  }));
  if (useUiStore.getState().selectedFr === franchiseeId) useUiStore.setState({ selectedFr: null });
  toast("Deleted", "ok");
}

