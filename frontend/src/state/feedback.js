/* Shared handling of save results: error toast, or the "someone else changed this" dialog. */
import { errorTitle } from "../lib/errors.js";
import { showConflict } from "./dialogs.js";
import { toast } from "./toastStore.js";

/**
 * Returns true when the save worked. Otherwise shows the problem:
 * error -> toast, conflict/gone -> conflict dialog (what = "Store 123", "This issue", …).
 */
export function saveSucceeded(result, what) {
  if (result.error) { toast(errorTitle(result.error), "err"); return false; }
  if (result.conflict || result.gone) { showConflict(what); return false; }
  return true;
}

export const toastError = (error) => toast(errorTitle(error), "err");
