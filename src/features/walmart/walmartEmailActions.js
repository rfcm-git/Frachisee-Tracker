/* Walmart email: saving the template and opening a filled-in email in Outlook. */
import { STORAGE_KEYS } from "../../config/constants.js";
import { isEmailExempt } from "../../domain/emailExempt.js";
import { MAILTO_SAFE_LENGTH } from "../../domain/capEmail.js";
import { normalizeWmStage, wmHistory } from "../../domain/walmart.js";
import { buildWalmartEmail, buildWalmartEmailMulti, wmCanEmail, wmEmailTemplate, wmFranchiseeRecords } from "../../domain/walmartEmail.js";
import { TABLES, WALMART_EMAIL_KEY, mergeRowSave, writeSetting } from "../../services/api.js";
import { formatTimestamp, nowIso } from "../../lib/format.js";
import { openMailto } from "../../lib/mailto.js";
import { local } from "../../lib/storage.js";
import { getContext, replaceRow, updateData } from "../../state/dataStore.js";
import { confirmAction, openEmailScope, openWalmartEmail } from "../../state/dialogs.js";
import { toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";

/** Saved template: shared with the team in app_settings, or on this computer when that table is not set up. null = never saved. */
export function savedWmEmail(ctx = getContext()) {
  return ctx.walmartEmail === undefined ? local.getJson(STORAGE_KEYS.wmEmail, null) : ctx.walmartEmail;
}

/** Template in use (the defaults until one is saved). */
export const currentWmEmail = (ctx = getContext()) => wmEmailTemplate(savedWmEmail(ctx));

/** Saves the template. Returns true when saved. */
export async function saveWmEmail(template) {
  const value = { ...template, updatedAt: new Date().toISOString() };
  local.setJson(STORAGE_KEYS.wmEmail, value);
  if (getContext().walmartEmail === undefined) {
    toast("Email messages saved on this computer (the shared settings table is not set up)", "ok");
    return true;
  }
  const error = await writeSetting(WALMART_EMAIL_KEY, value);
  if (error) { toastError(error); return false; }
  updateData(() => ({ walmartEmail: value }));
  toast("Walmart email messages saved for the whole team", "ok");
  return true;
}

/** Within this time after sending, the email button reopens Outlook without asking (e.g. Outlook was closed by mistake). */
const REOPEN_MS = 30 * 60 * 1000;

/** Stamps "emailed" (and Last Updated) on each record and logs it. Returns how many were saved. */
async function markEmailed(records) {
  let marked = 0;
  for (const record of records) {
    const result = await mergeRowSave(TABLES.walmart, record.id, (fresh) => {
      const ts = nowIso();
      return { last_email_at: ts, updated_at: ts, history: [...wmHistory(fresh), { ts, kind: "email", stage: normalizeWmStage(fresh.stage) }] };
    });
    if (result.row) { replaceRow("walmart", result.row); marked += 1; }
  }
  return marked;
}

/** Opens Outlook, then stamps the date emailed on every store the email is about. reopened: the quick "open it again" case. */
async function openAndMark(email, reopened = false) {
  openMailto(email.href);
  const label = email.records.length > 1 ? `${email.records.length} stores` : `store ${email.records[0].store_num}`;
  const long = email.href.length > MAILTO_SAFE_LENGTH ? " · the email is long, check Outlook kept all of it" : "";
  const marked = await markEmailed(email.records);
  if (marked === email.records.length) toast(`${reopened ? "Outlook reopened" : "Outlook opened"} for ${label} — press Send there${long}`, long ? "err" : "ok");
  else toast(`Outlook opened for ${label}, but the email date was only saved on ${marked} of ${email.records.length} stores`, "err");
}

const noEmail = (record) => toast(`Store ${record.store_num}'s franchisee has no email address — add one on the franchisee`, "err");

/** Email about one store (asks first when it was already emailed). */
function sendOne(record) {
  const ctx = getContext();
  const email = buildWalmartEmail(ctx, record, currentWmEmail(ctx));
  if (!email.to) { noEmail(record); return; }
  if (!record.last_email_at) { openAndMark(email); return; }
  // Emailed a moment ago: most likely Outlook was closed by mistake, so open it again straight away.
  if (Date.now() - new Date(record.last_email_at).getTime() < REOPEN_MS) { openAndMark(email, true); return; }
  confirmAction({
    title: "Email again?", icon: "mail", okClass: "btn", okLabel: "Open in Outlook",
    text: `Store ${record.store_num} was already emailed on ${formatTimestamp(record.last_email_at)}. Open another ${normalizeWmStage(record.stage)} email in Outlook?`,
    onConfirm: () => { openAndMark(email); return true; },
  });
}

function sendAll(record, records) {
  const ctx = getContext();
  const email = buildWalmartEmailMulti(ctx, record, records, currentWmEmail(ctx));
  if (!email.to) { noEmail(record); return; }
  openAndMark(email);
}

/**
 * The row's email button (Awaiting App and Payment Setup only). Opens the editor first when no message was ever saved.
 * When the franchisee has other stores at the same stage, asks: just this store, or all of them in one email.
 */
export function sendWalmartEmail(recordId) {
  const ctx = getContext();
  const record = ctx.walmart.find((item) => item.id === recordId);
  if (!record) return;
  const stage = normalizeWmStage(record.stage);
  if (!wmCanEmail(record)) { toast(`Only stores at Awaiting App or Payment Setup are emailed — store ${record.store_num} is ${stage}`, "err"); return; }
  if (isEmailExempt(ctx, record.store_num, "wm")) { toast(`Store ${record.store_num} is exempt from Walmart emails — change it in the store window`, "err"); return; }
  if (savedWmEmail(ctx) === null) {
    toast("Set up the email messages first, then click the email button again");
    openWalmartEmail(record.id);
    return;
  }
  const records = wmFranchiseeRecords(ctx, record);
  if (records.length < 2) { sendOne(record); return; }
  const line = (item) => `Store #${item.store_num}${item.last_email_at ? ` · emailed ${formatTimestamp(item.last_email_at)}` : " · not emailed yet"}`;
  openEmailScope({
    heading: `${stage} email · store ${record.store_num}`,
    one: { title: `Just store #${record.store_num}`, text: `Uses the ${stage} one-store message.`, run: () => sendOne(record) },
    all: { title: `All ${records.length} of this franchisee's stores at ${stage}`, text: `One email using the ${stage} several-stores message.`,
      lines: records.map(line), run: () => sendAll(record, records) },
    note: `Only the franchisee's stores at ${stage} are included — stores at other stages get their own message.`,
  });
}
