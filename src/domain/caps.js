/*
 * CAPs (Corrective Action Plan) records: one row per store number.
 * store_name, email and phone are saved only when they differ from the store records;
 * blank means "use the store records" (owner name, owner email, store phone).
 */
import { CAP_DUE_SOON_DAYS, CAP_STATES } from "../config/constants.js";
import { franchiseeName } from "./context.js";
import { emailOf } from "./records.js";
import { parseLocalDate, startOfDay } from "../lib/format.js";
import { cleanStoreNumber } from "../lib/text.js";

const DAY = 864e5;

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

/* ---------- submission due date ---------- */

/** Saved due date as "yyyy-mm-dd", or "". */
export const capDueDate = (record) => (record?.due_date ? String(record.due_date).slice(0, 10) : "");

/** Days from today to the due date: 0 = today, negative = overdue. null when there is no due date. */
export function capDueDays(record, now = new Date()) {
  const due = parseLocalDate(capDueDate(record));
  if (!due || Number.isNaN(due.getTime())) return null;
  return Math.round((due - startOfDay(now)) / DAY);
}

/** "none" (no date) | "done" (Completed) | "overdue" | "today" | "soon" (within CAP_DUE_SOON_DAYS) | "later" */
export function capDueState(record, now = new Date()) {
  const days = capDueDays(record, now);
  if (days === null) return "none";
  if (!capIsOpen(record)) return "done";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  return days <= CAP_DUE_SOON_DAYS ? "soon" : "later";
}

/** "Overdue by 3 days", "Due today", "Due tomorrow", "Due in 5 days" ("" without a date). */
export function capDueText(record, now = new Date()) {
  const days = capDueDays(record, now);
  if (days === null) return "";
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  return days === 1 ? "Due tomorrow" : `Due in ${days} days`;
}

/** "Nov 15, 2026" */
export const formatDueDate = (value) => {
  const date = parseLocalDate(String(value || "").slice(0, 10));
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "";
};

/** Counts per status, the completion percentage and how many open CAPs are overdue or due soon (today included). */
export function capsSummary(records, now = new Date()) {
  const counts = Object.fromEntries(CAP_STATES.map((status) => [status, 0]));
  let overdue = 0;
  let dueSoon = 0;
  records.forEach((record) => {
    counts[normalizeCapStatus(record.status)] += 1;
    const state = capDueState(record, now);
    if (state === "overdue") overdue += 1;
    else if (state === "today" || state === "soon") dueSoon += 1;
  });
  const total = records.length;
  const completed = counts.Completed;
  return { total, counts, completed, overdue, dueSoon, percent: total ? Math.round((completed / total) * 100) : 0 };
}
