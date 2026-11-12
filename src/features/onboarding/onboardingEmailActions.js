/* Onboarding email: saving the template and opening a filled-in email in Outlook. */
import { STORAGE_KEYS } from "../../config/constants.js";
import { emailKindLabel, isEmailExempt } from "../../domain/emailExempt.js";
import { obHistory } from "../../domain/onboarding.js";
import { DEFAULT_EZ_EMAIL, DEFAULT_OB_EMAIL, OB_EMAIL_NOTE, buildOnboardingEmail, buildOnboardingEmailMulti, obEmailSent, obEmailTemplate, obFranchiseeStores, targetsText } from "../../domain/onboardingEmail.js";
import { MAILTO_SAFE_LENGTH } from "../../domain/capEmail.js";
import { obPlatformName } from "../../domain/onboarding.js";
import { EZCATER_EMAIL_KEY, ONBOARDING_EMAIL_KEY, writeSetting } from "../../services/api.js";
import { openMailto } from "../../lib/mailto.js";
import { local } from "../../lib/storage.js";
import { getContext, updateData } from "../../state/dataStore.js";
import { confirmAction, openEmailScope, openOnboardingEmail } from "../../state/dialogs.js";
import { toastError } from "../../state/feedback.js";
import { toast } from "../../state/toastStore.js";
import { updateOnboarding } from "./onboardingActions.js";

/** The two onboarding emails: "ob" (Onboarding tab) and "ez" (ezCater tab). */
const SCOPES = {
  ob: { key: ONBOARDING_EMAIL_KEY, data: "onboardingEmail", storage: STORAGE_KEYS.obEmail, defaults: DEFAULT_OB_EMAIL },
  ez: { key: EZCATER_EMAIL_KEY, data: "ezcaterEmail", storage: STORAGE_KEYS.ezEmail, defaults: DEFAULT_EZ_EMAIL },
};
/** Which email a record uses. */
export const emailScopeOf = (record) => (record?.platform === "ez" ? "ez" : "ob");

/** Saved template: shared with the team in app_settings, or on this computer when that table is not set up. null = never saved. */
export function savedObEmail(ctx = getContext(), scope = "ob") {
  const { data, storage } = SCOPES[scope];
  return ctx[data] === undefined ? local.getJson(storage, null) : ctx[data];
}

/** Template in use (the defaults until one is saved). */
export const currentObEmail = (ctx = getContext(), scope = "ob") => obEmailTemplate(savedObEmail(ctx, scope), SCOPES[scope].defaults);

/** Saves the template. Returns true when saved. */
export async function saveObEmail(template, scope = "ob") {
  const { key, data, storage } = SCOPES[scope];
  const value = { ...template, updatedAt: new Date().toISOString() };
  local.setJson(storage, value);
  if (getContext()[data] === undefined) {
    toast("Email template saved on this computer (the shared settings table is not set up)", "ok");
    return true;
  }
  const error = await writeSetting(key, value);
  if (error) { toastError(error); return false; }
  updateData(() => ({ [data]: value }));
  toast("Email template saved for the whole team", "ok");
  return true;
}

/**
 * Opens the email in Outlook, then adds an Email Sent update to each record it is about.
 * Not enrolled records move to Work in Progress; the others keep their status.
 */
async function openAndLog(email, storeNum) {
  openMailto(email.href);
  const label = email.stores ? `${email.stores.length} stores` : `store ${storeNum}`;
  const long = email.href.length > MAILTO_SAFE_LENGTH ? " · the email is long, check Outlook kept all of it" : "";
  let logged = 0;
  for (const target of email.targets) {
    const fresh = getContext().onboarding.find((item) => item.id === target.id) || target;
    const status = fresh.status === "Not enrolled" ? "Work in Progress" : fresh.status;
    if (await updateOnboarding(fresh, { status, text: OB_EMAIL_NOTE, quiet: true })) logged += 1;
  }
  if (logged === email.targets.length) toast(`Outlook opened for ${label} — press Send there · “${OB_EMAIL_NOTE}” added to ${logged} record${logged !== 1 ? "s" : ""}${long}`, long ? "err" : "ok");
  else toast(`Outlook opened for ${label}, but “${OB_EMAIL_NOTE}” was only added to ${logged} of ${email.targets.length} records`, "err");
}

/**
 * The row's email button. Opens the editor first when no template was ever saved.
 * When the franchisee has other stores still being onboarded, asks: just this store, or all of them in one email.
 */
export function sendOnboardingEmail(recordId) {
  const ctx = getContext();
  const record = ctx.onboarding.find((item) => item.id === recordId);
  if (!record) return;
  if (isEmailExempt(ctx, record.store_num, emailScopeOf(record))) {
    toast(`Store ${record.store_num} is exempt from ${emailKindLabel(emailScopeOf(record))} emails — change it in the store window`, "err");
    return;
  }
  if (savedObEmail(ctx, emailScopeOf(record)) === null) {
    toast("Set up the email message first, then click the email button again");
    openOnboardingEmail(record.id, emailScopeOf(record));
    return;
  }
  // Stores with these emails turned off are listed too, so the user sees they're left out.
  const kind = emailScopeOf(record);
  const stores = obFranchiseeStores(ctx, record, { includeExempt: true });
  if (stores.length < 2) { sendOneOnboardingEmail(record); return; }
  const platforms = (group) => group.targets.map((item) => obPlatformName(item.platform)).join(", ");
  openEmailScope({
    heading: `Email about store ${record.store_num}`,
    one: { title: `Just store #${record.store_num}`, text: `Uses the one-store message. “${OB_EMAIL_NOTE}” is added to its open platforms.`, run: () => sendOneOnboardingEmail(record) },
    all: { title: "Several stores of this franchisee", text: `One email using the several-stores message. “${OB_EMAIL_NOTE}” is added to every open platform.`,
      items: stores.map((group) => ({ key: group.num, label: `Store #${group.num} · ${platforms(group)}`, exempt: isEmailExempt(ctx, group.num, kind), clicked: group.num === String(record.store_num) })),
      run: (keys) => sendAllOnboardingEmail(record, stores.filter((group) => keys.includes(group.num))) },
    note: "Only stores with platforms still being onboarded (Not enrolled or Work in Progress) are included. Not enrolled becomes Work in Progress.",
  });
}

function sendAllOnboardingEmail(record, stores) {
  const ctx = getContext();
  const email = buildOnboardingEmailMulti(ctx, record, stores, currentObEmail(ctx, emailScopeOf(record)));
  if (!email.to) { toast(`Store ${record.store_num}'s franchisee has no email address — add one on the franchisee`, "err"); return; }
  openAndLog(email, record.store_num);
}

/** Email about one store (asks first when it was already emailed or nothing is still being onboarded). */
function sendOneOnboardingEmail(record) {
  const ctx = getContext();
  const email = buildOnboardingEmail(ctx, record, currentObEmail(ctx, emailScopeOf(record)));
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
