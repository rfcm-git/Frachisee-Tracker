/* Onboarding email: saving the template and opening a filled-in email in Outlook. */
import { STORAGE_KEYS } from "../../config/constants.js";
import { obHistory } from "../../domain/onboarding.js";
import { OB_EMAIL_NOTE, buildOnboardingEmail, obEmailSent, obEmailTemplate, targetsText } from "../../domain/onboardingEmail.js";
import { ONBOARDING_EMAIL_KEY, writeSetting } from "../../services/api.js";
import { openMailto } from "../../lib/mailto.js";
import { local } from "../../lib/storage.js";
import { getContext, updateData } from "../../state/dataStore.js";
import { confirmAction, openOnboardingEmail } from "../../state/dialogs.js";
import { toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";
import { updateOnboarding } from "./onboardingActions.js";

/** Saved template: shared with the team in app_settings, or on this computer when that table is not set up. null = never saved. */
export function savedObEmail(ctx = getContext()) {
  return ctx.onboardingEmail === undefined ? local.getJson(STORAGE_KEYS.obEmail, null) : ctx.onboardingEmail;
}

/** Template in use (the defaults until one is saved). */
export const currentObEmail = (ctx = getContext()) => obEmailTemplate(savedObEmail(ctx));

/** Saves the template. Returns true when saved. */
export async function saveObEmail(template) {
  const value = { ...template, updatedAt: new Date().toISOString() };
  local.setJson(STORAGE_KEYS.obEmail, value);
  if (getContext().onboardingEmail === undefined) {
    toast("Email template saved on this computer (the shared settings table is not set up)", "ok");
    return true;
  }
  const error = await writeSetting(ONBOARDING_EMAIL_KEY, value);
  if (error) { toastError(error); return false; }
  updateData(() => ({ onboardingEmail: value }));
  toast("Email template saved for the whole team", "ok");
  return true;
}

/**
 * Opens the email in Outlook, then adds an Email Sent update to each record it is about.
 * Not enrolled records move to Work in Progress; the others keep their status.
 */
async function openAndLog(email, storeNum) {
  openMailto(email.href);
  let logged = 0;
  for (const target of email.targets) {
    const fresh = getContext().onboarding.find((item) => item.id === target.id) || target;
    const status = fresh.status === "Not enrolled" ? "Work in Progress" : fresh.status;
    if (await updateOnboarding(fresh, { status, text: OB_EMAIL_NOTE, quiet: true })) logged += 1;
  }
  if (logged === email.targets.length) toast(`Outlook opened for store ${storeNum} — press Send there · “${OB_EMAIL_NOTE}” added to ${logged} record${logged !== 1 ? "s" : ""}`, "ok");
  else toast(`Outlook opened for store ${storeNum}, but “${OB_EMAIL_NOTE}” was only added to ${logged} of ${email.targets.length} records`, "err");
}

/**
 * The row's email button. Opens the editor first when no template was ever saved.
 * Asks first when the store was already emailed or nothing is still being onboarded.
 */
export function sendOnboardingEmail(recordId) {
  const ctx = getContext();
  const record = ctx.onboarding.find((item) => item.id === recordId);
  if (!record) return;
  if (savedObEmail(ctx) === null) {
    toast("Set up the email message first, then click the email button again");
    openOnboardingEmail(record.id);
    return;
  }
  const email = buildOnboardingEmail(ctx, record, currentObEmail(ctx));
  if (!email.to) { toast(`Store ${record.store_num}'s franchisee has no email address — add one on the franchisee`, "err"); return; }
  const alreadySent = email.targets.some((target) => obEmailSent(target, obHistory(target)));
  const nothingOpen = email.targets.length === 1 && email.targets[0].id === record.id && (record.status === "Onboarded" || record.status === "Exempted");
  if (!alreadySent && !nothingOpen) { openAndLog(email, record.store_num); return; }
  confirmAction({
    title: alreadySent ? "Email again?" : "Store is already done here",
    icon: "mail", okClass: "btn", okLabel: "Open in Outlook",
    text: `${alreadySent ? `Store ${record.store_num} was already emailed about onboarding.` : `Store ${record.store_num} is ${record.status} on this platform and has no other platforms being onboarded.`}`
      + ` Open another email in Outlook? It covers ${targetsText(email.targets)}, and “${OB_EMAIL_NOTE}” is added to ${email.targets.length === 1 ? "that record" : "each of them"}.`,
    onConfirm: () => { openAndLog(email, record.store_num); return true; },
  });
}
