/* Contact editor rows: saved contacts <-> editable rows with stable keys. */
import { formatPhone } from "../../lib/format.js";

let keySeq = 0;
/** Wraps saved contacts as editor rows (one empty email row when there are none). */
export function toEditorRows(contacts) {
  const list = contacts && contacts.length ? contacts : [{ type: "email", value: "" }];
  return list.map((contact) => ({ key: ++keySeq, type: contact.type || "email", value: contact.type === "cell" ? formatPhone(contact.value) : String(contact.value || "") }));
}

export const newContactRow = () => ({ key: ++keySeq, type: "email", value: "" });

/** Rows with a value, ready to save. */
export const fromEditorRows = (rows) => rows.map((row) => ({ type: row.type, value: row.value.trim() })).filter((contact) => contact.value);
