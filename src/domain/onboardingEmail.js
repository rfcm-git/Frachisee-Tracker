/*
 * Onboarding email: the shared template, its {{placeholders}} and who it goes to.
 * One email covers a store's open onboarding (Not enrolled / Work in Progress) platforms. Recipients follow the same rules
 * as the CAP email (see capEmail.recipientsFor): FBC and OM, Houston or other-territory CC, always-CC, and Rohit / Raghu Marwaha stores to Rajeev.
 * Sending adds an "Email Sent" update to each of those records; the status becomes (or stays) Work in Progress.
 */
import { franchiseeName } from "./context.js";
import { composeEmail, recipientsFor } from "./capEmail.js";
import { obIsOpen, obPlatformName, obStatusLabel, obVisible } from "./onboarding.js";
import { emailOf, territorySet } from "./records.js";
import { OB_PLATFORMS } from "../config/constants.js";

/** Text of the update added when the email is opened in Outlook. */
export const OB_EMAIL_NOTE = "Email Sent";

export const DEFAULT_OB_EMAIL = Object.freeze({
  subject: "Delivery app onboarding · Store #{{Store #}}",
  body: [
    "Hi {{Franchisee}},",
    "",
    "We'd like to get store #{{Store #}} ({{Address}}, {{City}}) set up on {{Platforms}}.",
    "",
    "Please reply with a good time to go over the next steps, or let us know if you have any questions.",
    "",
    "Thank you,",
  ].join("\n"),
  multiSubject: "Delivery app onboarding · {{Store count}} stores",
  multiBody: [
    "Hi {{Franchisee}},",
    "",
    "We'd like to get these stores set up on their delivery apps:",
    "{{Stores}}",
    "",
    "Please reply with a good time to go over the next steps, or let us know if you have any questions.",
    "",
    "Thank you,",
  ].join("\n"),
  ccHouston: "christophe@marwahagroup.com",
  ccOther: "aziza@marwahagroup.com",
  ccAlways: "richard@subsource.com, karl@subsource.com",
});

/** Placeholders of the several-stores message. */
export const OB_EMAIL_MULTI_FIELDS = [
  ["Franchisee", "Franchisee name"],
  ["Stores", "One line per store: number, address and the platforms still being onboarded"],
  ["Store count", "Number of stores in the email"],
  ["Email", "Franchisee email"],
];

/** Placeholder name -> description, in the order shown in the editor. */
export const OB_EMAIL_FIELDS = [
  ["Franchisee", "Franchisee name"],
  ["Store #", "Store number"],
  ["Platforms", "The store's platforms still being onboarded, e.g. Uber Eats and DoorDash"],
  ["Address", "Store street address"],
  ["City", "Store city"],
  ["State", "Store state"],
  ["Territory", "Store territory"],
  ["Email", "Franchisee email"],
  ["Phone", "Store phone"],
];

/** Saved template merged over the defaults (older saves may miss fields). */
export const obEmailTemplate = (saved) => ({ ...DEFAULT_OB_EMAIL, ...(saved && typeof saved === "object" ? saved : {}) });

/** ["Uber Eats", "DoorDash", "Grubhub"] -> "Uber Eats, DoorDash and Grubhub" */
const joinNames = (names) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join(""));

/**
 * Records the email is about: the store's open records (latest per platform, in platform order),
 * or just this record when none of the store's records are open.
 */
export function obEmailTargets(ctx, record) {
  const latest = new Map();
  ctx.onboarding
    .filter((item) => obVisible(item) && String(item.store_num) === String(record.store_num))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .forEach((item) => { if (!latest.has(item.platform)) latest.set(item.platform, item); });
  const order = (item) => OB_PLATFORMS.findIndex(([key]) => key === item.platform);
  const open = [...latest.values()].filter(obIsOpen).sort((a, b) => order(a) - order(b));
  return open.length ? open : [record];
}

/** True when the record already has an Email Sent update. */
export const obEmailSent = (record, history) => history.some((entry) => String(entry.action || "").trim() === OB_EMAIL_NOTE);

/** Placeholder values for one store and the records the email is about. */
export function obEmailValues(ctx, record, targets) {
  const store = ctx.storeByNum.get(String(record.store_num));
  const owner = store ? ctx.frById.get(store.franchisee_id) : null;
  const territory = store ? (String(store.territory || "").trim() || String(owner?.territory || "").trim()) : "";
  return {
    "Franchisee": store ? franchiseeName(ctx, store.franchisee_id) : "",
    "Store #": String(record.store_num || ""),
    "Platforms": joinNames(targets.map((item) => obPlatformName(item.platform))),
    "Address": store?.address || "",
    "City": store?.city || "",
    "State": store?.state || "",
    "Territory": [...territorySet(territory)].join(", "),
    "Email": owner ? emailOf(owner) : "",
    "Phone": store?.phone || "",
  };
}

/**
 * The email for one onboarding row: { to, cc, ccInfo, team, store, houston, rajeev, subject, body, href, missing, targets }.
 * targets = the records that get the Email Sent update.
 */
export function buildOnboardingEmail(ctx, record, template) {
  const targets = obEmailTargets(ctx, record);
  const values = obEmailValues(ctx, record, targets);
  const store = ctx.storeByNum.get(String(record.store_num));
  const recipients = recipientsFor(ctx, store, template, { email: values.Email, name: values.Franchisee });
  return { ...recipients, store: !!store, targets, ...composeEmail(template, values, recipients) };
}

/**
 * The franchisee's stores with platforms still being onboarded, for one email to all of them:
 * [{ num, targets }] in store-number order. The clicked record's store is always included.
 */
export function obFranchiseeStores(ctx, record) {
  const store = ctx.storeByNum.get(String(record.store_num));
  if (!store || store.franchisee_id == null) return [{ num: String(record.store_num), targets: obEmailTargets(ctx, record) }];
  const nums = new Set(ctx.onboarding.filter((item) => obVisible(item) && obIsOpen(item)).map((item) => String(item.store_num))
    .filter((num) => ctx.storeByNum.get(num)?.franchisee_id === store.franchisee_id));
  nums.add(String(record.store_num));
  return [...nums].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((num) => {
    const sample = num === String(record.store_num) ? record : ctx.onboarding.find((item) => String(item.store_num) === num && obVisible(item));
    return { num, targets: obEmailTargets(ctx, sample) };
  });
}

/** "• Store #100 (1 Main St, Austin): Uber Eats and DoorDash" */
function obStoreLine(ctx, { num, targets }) {
  const store = ctx.storeByNum.get(num);
  const place = [store?.address, store?.city].filter(Boolean).join(", ");
  return `• Store #${num}${place ? ` (${place})` : ""}: ${joinNames(targets.map((item) => obPlatformName(item.platform)))}`;
}

/**
 * One email to the franchisee about several stores, using the several-stores message:
 * { to, cc, ccInfo, team, store, houston, mixed, rajeev, subject, body, href, missing, targets (every record that gets Email Sent), stores }.
 */
export function buildOnboardingEmailMulti(ctx, record, storeGroups, template) {
  const values = obEmailValues(ctx, record, obEmailTargets(ctx, record));
  const stores = storeGroups.map((group) => ctx.storeByNum.get(group.num)).filter(Boolean);
  const recipients = recipientsFor(ctx, stores, template, { email: values.Email, name: values.Franchisee });
  const multiValues = { "Franchisee": values.Franchisee, "Stores": storeGroups.map((group) => obStoreLine(ctx, group)).join("\n"), "Store count": String(storeGroups.length), "Email": values.Email };
  return { ...recipients, store: stores.length > 0, stores: storeGroups, targets: storeGroups.flatMap((group) => group.targets), ...composeEmail(template, multiValues, recipients, true) };
}

/** "Uber Eats (Not enrolled), DoorDash (Work in Progress)" — for confirmations. */
export const targetsText = (targets) => targets.map((item) => `${obPlatformName(item.platform)} (${obStatusLabel(item.status)})`).join(", ");
