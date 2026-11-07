/* CAP email: saving the template and opening a filled-in email in Outlook. */
import { CAP_STATES, STORAGE_KEYS } from "../../config/constants.js";
import { CAP_EMAIL_STATUS, MAILTO_SAFE_LENGTH, buildCapEmail, buildCapEmailMulti, capEmailTemplate, capFranchiseeRecords } from "../../domain/capEmail.js";
import { formatDueDate } from "../../domain/caps.js";
import { normalizeCapStatus } from "../../domain/caps.js";
import { CAPS_EMAIL_KEY, writeSetting } from "../../services/api.js";
import { local } from "../../lib/storage.js";
import { openMailto } from "../../lib/mailto.js";
import { getContext, updateData } from "../../state/dataStore.js";
import { confirmAction, openCapEmail, openEmailScope } from "../../state/dialogs.js";
import { toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";
import { updateCap } from "./capsActions.js";

/** Saved template: shared with the team in app_settings, or on this computer when that table is not set up. null = never saved. */
export function savedCapEmail(ctx = getContext()) {
  return ctx.capsEmail === undefined ? local.getJson(STORAGE_KEYS.capEmail, null) : ctx.capsEmail;
}

/** Template in use (the defaults until one is saved). */
export const currentCapEmail = (ctx = getContext()) => capEmailTemplate(savedCapEmail(ctx));

/** Saves the template. Returns true when saved. */
export async function saveCapEmail(template) {
  const value = { ...template, updatedAt: new Date().toISOString() };
  local.setJson(STORAGE_KEYS.capEmail, value);
  if (getContext().capsEmail === undefined) {
    toast("Email template saved on this computer (the shared settings table is not set up)", "ok");
    return true;
  }
  const error = await writeSetting(CAPS_EMAIL_KEY, value);
  if (error) { toastError(error); return false; }
  updateData(() => ({ capsEmail: value }));
  toast("Email template saved for the whole team", "ok");
  return true;
}

/** Opens the email in Outlook, then sets the status to Email Sent (whatever it was before). */
async function openAndMark(record, email) {
  openMailto(email.href);
  if (normalizeCapStatus(record.status) === CAP_EMAIL_STATUS) {
    toast(`Outlook opened for store ${record.store_num} — press Send there`, "ok");
    return;
  }
  const ok = await updateCap(record, { status: CAP_EMAIL_STATUS }, { quiet: true });
  if (ok) toast(`Outlook opened for store ${record.store_num} · status → ${CAP_EMAIL_STATUS}`, "ok");
}

/** One email about several stores: opens Outlook, then sets every record to Email Sent. */
async function openAndMarkAll(email) {
  openMailto(email.href);
  const todo = email.records.filter((record) => normalizeCapStatus(record.status) !== CAP_EMAIL_STATUS);
  let marked = 0;
  for (const record of todo) {
    const fresh = getContext().caps.find((item) => item.id === record.id) || record;
    if (await updateCap(fresh, { status: CAP_EMAIL_STATUS }, { quiet: true })) marked += 1;
  }
  const long = email.href.length > MAILTO_SAFE_LENGTH ? " · the email is long, check Outlook kept all of it" : "";
  if (marked === todo.length) toast(`Outlook opened for ${email.records.length} stores — press Send there · status → ${CAP_EMAIL_STATUS}${long}`, long ? "err" : "ok");
  else toast(`Outlook opened for ${email.records.length} stores, but only ${marked} of ${todo.length} were set to ${CAP_EMAIL_STATUS}`, "err");
}

/** "Store #100 · Email Sent · due Nov 15, 2026" */
const capLine = (record) => {
  const due = formatDueDate(record.due_date);
  return `Store #${record.store_num} · ${normalizeCapStatus(record.status)}${due ? ` · due ${due}` : ""}`;
};

/**
 * The row's email button. Opens the editor first when no template was ever saved.
 * When the franchisee has other stores in the CAP list that are not Completed, asks: just this store, or all of them in one email.
 */
export function sendCapEmail(recordId) {
  const ctx = getContext();
  const record = ctx.caps.find((item) => item.id === recordId);
  if (!record) return;
  if (savedCapEmail(ctx) === null) {
    toast("Set up the email message first, then click the email button again");
    openCapEmail(record.id);
    return;
  }
  const records = capFranchiseeRecords(ctx, record);
  if (records.length < 2) { sendOneCapEmail(record); return; }
  openEmailScope({
    heading: `Email about store ${record.store_num}`,
    one: { title: `Just store #${record.store_num}`, text: `Uses the one-store message. Status → ${CAP_EMAIL_STATUS}.`, run: () => sendOneCapEmail(record) },
    all: { title: `All ${records.length} stores of this franchisee`, text: `One email using the several-stores message. Each store's status → ${CAP_EMAIL_STATUS}.`,
      lines: records.map(capLine), run: () => sendAllCapEmail(record, records) },
    note: "Completed stores are left out.",
  });
}

function sendAllCapEmail(record, records) {
  const ctx = getContext();
  const email = buildCapEmailMulti(ctx, record, records, currentCapEmail(ctx));
  if (!email.to) { toast(`Store ${record.store_num} has no email address — add one with Edit`, "err"); return; }
  openAndMarkAll(email);
}

/** Email about one store (asks first when it is past No Action Yet). */
function sendOneCapEmail(record) {
  const ctx = getContext();
  const email = buildCapEmail(ctx, record, currentCapEmail(ctx));
  if (!email.to) { toast(`Store ${record.store_num} has no email address — add one with Edit`, "err"); return; }
  const status = normalizeCapStatus(record.status);
  if (status === CAP_STATES[0]) { openAndMark(record, email); return; }
  confirmAction({
    title: "Email again?",
    icon: "mail",
    okClass: "btn",
    okLabel: "Open in Outlook",
    text: status === CAP_EMAIL_STATUS
      ? `Store ${record.store_num} was already emailed. Open another email in Outlook?`
      : `Store ${record.store_num} is ${status}. Open an email in Outlook? Its status changes from ${status} to ${CAP_EMAIL_STATUS}.`,
    onConfirm: () => { openAndMark(record, email); return true; },
  });
}
