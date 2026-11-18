/* Saving and deleting FBC / OM records. */
import { TABLES, deleteWhere, guardedUpdate, insertRows } from "../../services/api.js";
import { addRows, getContext, replaceRow, updateData } from "../../state/dataStore.js";
import { DIALOG, closeDialogs, confirmAction } from "../../state/dialogs.js";
import { saveSucceeded, toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";
import { contactsOf, emailOf } from "../../domain/records.js";
import { isEmail } from "../../lib/text.js";

/** Validates and saves. Returns true when saved. */
export async function saveStaff(existing, { role, name, email }) {
  const ctx = getContext();
  const cleanEmail = email.trim().toLowerCase();
  const record = { role, name: name.trim(), email: cleanEmail || null };
  if (!record.name) { toast("Enter a name", "err"); return false; }
  if (cleanEmail && !isEmail(cleanEmail)) { toast("Check the email address", "err"); return false; }
  const duplicate = cleanEmail && ctx.staff.find((person) => String(emailOf(person)).toLowerCase() === cleanEmail && person.id !== existing?.id);
  if (duplicate) { toast(`That email already belongs to ${duplicate.name}`, "err"); return false; }
  record.contacts = [...(existing ? contactsOf(existing).filter((contact) => contact.type !== "email") : []), ...(cleanEmail ? [{ type: "email", value: cleanEmail }] : [])];

  if (existing) {
    const result = await guardedUpdate(TABLES.staff, existing, record);
    if (!saveSucceeded(result, `This ${existing.role || "staff"} record`)) return false;
    replaceRow("staff", result.row);
  } else {
    record.id = ctx.staff.reduce((max, person) => Math.max(max, person.id || 0), 0) + 1;
    const result = await insertRows(TABLES.staff, [record]);
    if (result.error) { toastError(result.error); return false; }
    addRows("staff", result.rows.length ? result.rows : [record]);
  }
  toast("Saved", "ok");
  return true;
}

export function askDeleteStaff(person) {
  confirmAction({
    text: `Delete ${person.role || ""} "${person.name || ""}"? Their stores will show "Not assigned".`,
    onConfirm: async () => {
      const error = await deleteWhere(TABLES.staff, "id", person.id);
      if (error) { toastError(error); return; }
      updateData((data) => ({
        stores: data.stores.map((store) => (store.fbc_id === person.id || store.om_id === person.id
          ? { ...store, fbc_id: store.fbc_id === person.id ? null : store.fbc_id, om_id: store.om_id === person.id ? null : store.om_id }
          : store)),
        staff: data.staff.filter((item) => item.id !== person.id),
      }));
      closeDialogs(DIALOG.staffDetail);
      toast("Deleted", "ok");
    },
  });
}
