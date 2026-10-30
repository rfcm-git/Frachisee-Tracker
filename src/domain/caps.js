/*
 * CAPs (Corrective Action Plan) records: one row per store number.
 * store_name, email and phone are saved only when they differ from the store records;
 * blank means "use the store records" (owner name, owner email, store phone).
 */
import { CAP_STATES } from "../config/constants.js";
import { franchiseeName } from "./context.js";
import { emailOf } from "./records.js";
import { cleanStoreNumber } from "../lib/text.js";

export const capStatusClass = (status) => (status === "Completed" ? "cap-done" : status === "In Progress" ? "cap-wip" : status === "Email Sent" ? "cap-sent" : "cap-none");

/** Known status, or the starting status for anything else. */
export const normalizeCapStatus = (status) => (CAP_STATES.includes(status) ? status : CAP_STATES[0]);

export const capIsOpen = (record) => normalizeCapStatus(record.status) !== "Completed";

/** Name, email and phone of a store from the store records ("" when unknown). */
export function storeContactDefaults(ctx, num) {
  const store = ctx.storeByNum.get(cleanStoreNumber(num));
  if (!store) return { found: false, name: "", email: "", phone: "" };
  const owner = ctx.frById.get(store.franchisee_id);
  return { found: true, name: franchiseeName(ctx, store.franchisee_id), email: owner ? emailOf(owner) : "", phone: store.phone || "" };
}

/**
 * Name, email and phone shown for a record: the saved value, or the store records when blank.
 * fromStore.<field> is true when the value comes from the store records.
 */
export function capContact(ctx, record) {
  const defaults = storeContactDefaults(ctx, record.store_num);
  const pick = (saved, fallback) => (String(saved || "").trim() ? String(saved).trim() : fallback);
  return {
    storeFound: defaults.found,
    name: pick(record.store_name, defaults.name),
    email: pick(record.email, defaults.email),
    phone: pick(record.phone, defaults.phone),
    fromStore: { name: !String(record.store_name || "").trim(), email: !String(record.email || "").trim(), phone: !String(record.phone || "").trim() },
  };
}

const sameText = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/** Value to save for a contact field: "" when it matches the store records, so the record keeps following them. */
export const contactToSave = (value, storeValue) => (sameText(value, storeValue) ? "" : String(value || "").trim());

/** Counts per status and the completion percentage. */
export function capsSummary(records) {
  const counts = Object.fromEntries(CAP_STATES.map((status) => [status, 0]));
  records.forEach((record) => { counts[normalizeCapStatus(record.status)] += 1; });
  const total = records.length;
  const completed = counts.Completed;
  return { total, counts, completed, percent: total ? Math.round((completed / total) * 100) : 0 };
}
