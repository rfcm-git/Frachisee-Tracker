/*
 * Walmart email: one message for Awaiting App and one for Payment Setup, each with a one-store and a several-stores version.
 * Recipients follow the same rules as the CAP and onboarding emails (see capEmail.recipientsFor): the franchisee,
 * FBC and OM, Houston or other-territory CC, always-CC, and Rohit / Raghu Marwaha stores to Rajeev.
 * Only stores at Awaiting App or Payment Setup can be emailed.
 */
import { franchiseeName } from "./context.js";
import { composeEmail, recipientsFor } from "./capEmail.js";
import { emailOf, territorySet } from "./records.js";
import { WM_OPEN_STAGES, normalizeWmStage } from "./walmart.js";
import { compareNumbers } from "../lib/text.js";

/** Stage -> prefix of its template keys ("await" -> awaitSubject, awaitBody, awaitMultiSubject, awaitMultiBody). */
export const WM_EMAIL_PREFIX = { "Awaiting App": "await", "Payment Setup": "pay" };
const key = (stage, part) => `${WM_EMAIL_PREFIX[stage]}${part}`;

export const DEFAULT_WM_EMAIL = Object.freeze({
  awaitSubject: "Walmart Marketplace application · Store #{{Store #}}",
  awaitBody: [
    "Hi {{Franchisee}},",
    "",
    "Store #{{Store #}} ({{Address}}, {{City}}) hasn't submitted its Walmart Marketplace application yet.",
    "Please complete and submit the application so we can get the store live on Walmart.",
    "",
    "Let us know if you need the application link or have any questions.",
    "",
    "Thank you,",
  ].join("\n"),
  awaitMultiSubject: "Walmart Marketplace applications · {{Store count}} stores",
  awaitMultiBody: [
    "Hi {{Franchisee}},",
    "",
    "These stores haven't submitted their Walmart Marketplace application yet:",
    "{{Stores}}",
    "",
    "Please complete and submit the applications so we can get the stores live on Walmart.",
    "",
    "Let us know if you need the application links or have any questions.",
    "",
    "Thank you,",
  ].join("\n"),
  paySubject: "Walmart Marketplace payment setup · Store #{{Store #}}",
  payBody: [
    "Hi {{Franchisee}},",
    "",
    "The Walmart Marketplace payment setup for store #{{Store #}} ({{Address}}, {{City}}) is still pending.",
    "Please finish the payment setup so the store can go live on Walmart.",
    "",
    "Let us know if you have any questions.",
    "",
    "Thank you,",
  ].join("\n"),
  payMultiSubject: "Walmart Marketplace payment setup · {{Store count}} stores",
  payMultiBody: [
    "Hi {{Franchisee}},",
    "",
    "The Walmart Marketplace payment setup is still pending for these stores:",
    "{{Stores}}",
    "",
    "Please finish the payment setup so the stores can go live on Walmart.",
    "",
    "Let us know if you have any questions.",
    "",
    "Thank you,",
  ].join("\n"),
  ccHouston: "christophe@marwahagroup.com",
  ccOther: "aziza@marwahagroup.com",
  ccAlways: "richard@subsource.com, karl@subsource.com",
});

/** Placeholder name -> description, in the order shown in the editor. */
export const WM_EMAIL_FIELDS = [
  ["Franchisee", "Franchisee name"],
  ["Store #", "Store number"],
  ["Stage", "Walmart stage, e.g. Awaiting App"],
  ["Address", "Store street address"],
  ["City", "Store city"],
  ["State", "Store state"],
  ["Territory", "Store territory"],
  ["Email", "Franchisee email"],
  ["Phone", "Store phone"],
];

/** Placeholders of the several-stores messages. */
export const WM_EMAIL_MULTI_FIELDS = [
  ["Franchisee", "Franchisee name"],
  ["Stores", "One line per store: number and address"],
  ["Store count", "Number of stores in the email"],
  ["Email", "Franchisee email"],
];

/** Saved template merged over the defaults (older saves may miss fields). */
export const wmEmailTemplate = (saved) => ({ ...DEFAULT_WM_EMAIL, ...(saved && typeof saved === "object" ? saved : {}) });

/** The stage's messages in the shape composeEmail expects ({ subject, body, multiSubject, multiBody } + CC). */
export const stageTemplate = (template, stage) => ({
  ...template,
  subject: template[key(stage, "Subject")], body: template[key(stage, "Body")],
  multiSubject: template[key(stage, "MultiSubject")], multiBody: template[key(stage, "MultiBody")],
});

/** True when the store's stage can be emailed (Awaiting App or Payment Setup). */
export const wmCanEmail = (record) => WM_OPEN_STAGES.includes(normalizeWmStage(record?.stage));

/** Placeholder values for one Walmart record. */
export function wmEmailValues(ctx, record) {
  const store = ctx.storeByNum.get(String(record.store_num));
  const owner = store ? ctx.frById.get(store.franchisee_id) : null;
  const territory = store ? (String(store.territory || "").trim() || String(owner?.territory || "").trim()) : "";
  return {
    "Franchisee": store ? franchiseeName(ctx, store.franchisee_id) : "",
    "Store #": String(record.store_num || ""),
    "Stage": normalizeWmStage(record.stage),
    "Address": store?.address || "",
    "City": store?.city || "",
    "State": store?.state || "",
    "Territory": [...territorySet(territory)].join(", "),
    "Email": owner ? emailOf(owner) : "",
    "Phone": store?.phone || "",
  };
}

/** The email for one store: { to, cc, ccInfo, team, store, houston, mixed, rajeev, subject, body, href, missing, records }. */
export function buildWalmartEmail(ctx, record, template) {
  const values = wmEmailValues(ctx, record);
  const store = ctx.storeByNum.get(String(record.store_num));
  const recipients = recipientsFor(ctx, store, template, { email: values.Email, name: values.Franchisee });
  return { ...recipients, store: !!store, records: [record], ...composeEmail(stageTemplate(template, values.Stage), values, recipients) };
}

/**
 * The franchisee's stores at the same stage as this one (the message depends on the stage), in store-number order.
 * The clicked store is always included.
 */
export function wmFranchiseeRecords(ctx, record) {
  const store = ctx.storeByNum.get(String(record.store_num));
  const stage = normalizeWmStage(record.stage);
  if (!store || store.franchisee_id == null) return [record];
  return ctx.walmart.filter((item) => item.id === record.id || (normalizeWmStage(item.stage) === stage
    && ctx.storeByNum.get(String(item.store_num))?.franchisee_id === store.franchisee_id))
    .sort((a, b) => compareNumbers(a.store_num, b.store_num));
}

/** "• Store #100 · 1 Main St, Austin" */
function storeLine(ctx, record) {
  const store = ctx.storeByNum.get(String(record.store_num));
  const place = [store?.address, store?.city].filter(Boolean).join(", ");
  return `• Store #${record.store_num}${place ? ` · ${place}` : ""}`;
}

/** One email to the franchisee about several stores at the same stage, using that stage's several-stores message. */
export function buildWalmartEmailMulti(ctx, record, records, template) {
  const values = wmEmailValues(ctx, record);
  const stores = records.map((item) => ctx.storeByNum.get(String(item.store_num))).filter(Boolean);
  const recipients = recipientsFor(ctx, stores, template, { email: values.Email, name: values.Franchisee });
  const multiValues = { "Franchisee": values.Franchisee, "Stores": records.map((item) => storeLine(ctx, item)).join("\n"), "Store count": String(records.length), "Email": values.Email };
  return { ...recipients, store: stores.length > 0, records, ...composeEmail(stageTemplate(template, values.Stage), multiValues, recipients, true) };
}
