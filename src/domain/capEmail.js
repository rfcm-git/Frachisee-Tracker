/*
 * CAP email: the shared template, its {{placeholders}}, who is CC'd and the Outlook (mailto:) link.
 * Houston stores (territory 540, or a Houston, TX address) CC Christophe; every other store CCs Aziza.
 * The store's FBC and OM are always CC'd too. Each address is listed once (e.g. when Aziza is also the OM).
 */
import { franchiseeName } from "./context.js";
import { capContact, formatDueDate, normalizeCapStatus } from "./caps.js";
import { emailOf, territorySet } from "./records.js";
import { staffForStore } from "./staff.js";
import { isEmail } from "../lib/text.js";

export const CAP_EMAIL_STATUS = "Email Sent";

/** Outlook can cut off longer mailto: links, so the editor warns past this. */
export const MAILTO_SAFE_LENGTH = 2000;

export const DEFAULT_CAP_EMAIL = Object.freeze({
  subject: "Corrective Action Plan · Store #{{Store #}}",
  body: [
    "Hi {{Franchisee}},",
    "",
    "We need a Corrective Action Plan (CAP) for store #{{Store #}} ({{Address}}, {{City}}).",
    "Please send it by {{Due Date}}.",
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
export const CAP_EMAIL_FIELDS = [
  ["Franchisee", "Franchisee name"],
  ["Store #", "Store number"],
  ["Due Date", "Submission due date"],
  ["Address", "Store street address"],
  ["City", "Store city"],
  ["State", "Store state"],
  ["Territory", "Store territory"],
  ["Email", "Franchisee email"],
  ["Phone", "Store phone"],
  ["Status", "Current CAP status"],
  ["Notes", "CAP notes"],
];

/** Saved template merged over the defaults (older saves may miss fields). */
export const capEmailTemplate = (saved) => ({ ...DEFAULT_CAP_EMAIL, ...(saved && typeof saved === "object" ? saved : {}) });

/** "a@x.com; b@y.com, c@z.com" -> ["a@x.com", "b@y.com", "c@z.com"] (valid, unique). */
export function emailList(text) {
  const seen = new Set();
  return String(text || "").split(/[;,\s]+/).map((part) => part.trim()).filter((part) => {
    const key = part.toLowerCase();
    if (!part || !isEmail(part) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Parts of a CC box that are not valid email addresses. */
export const badEmails = (text) => String(text || "").split(/[;,\s]+/).map((part) => part.trim()).filter((part) => part && !isEmail(part));

/** Store territory, or its franchisee's when the store has none. */
function territoryOf(ctx, store) {
  if (!store) return "";
  if (String(store.territory || "").trim()) return String(store.territory).trim();
  return String(ctx.frById.get(store.franchisee_id)?.territory || "").trim();
}

/** True for territory 540 or a Houston, Texas address. */
export function isHoustonStore(ctx, store) {
  if (!store) return false;
  if (territorySet(territoryOf(ctx, store)).has("540")) return true;
  const city = String(store.city || "").trim().toLowerCase();
  const state = String(store.state || "").trim().toLowerCase();
  return city === "houston" && (state === "tx" || state === "texas");
}

/** Placeholder values for one CAP record. */
export function capEmailValues(ctx, record) {
  const store = ctx.storeByNum.get(String(record.store_num));
  const contact = capContact(ctx, record);
  return {
    "Franchisee": contact.name || (store ? franchiseeName(ctx, store.franchisee_id) : ""),
    "Store #": String(record.store_num || ""),
    "Due Date": formatDueDate(record.due_date),
    "Address": store?.address || "",
    "City": store?.city || "",
    "State": store?.state || "",
    "Territory": territoryOf(ctx, store),
    "Email": contact.email,
    "Phone": contact.phone,
    "Status": normalizeCapStatus(record.status),
    "Notes": record.notes || "",
  };
}

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Fills {{placeholders}}; unknown names are left as typed. missing collects known names with no value. */
export function fillTemplate(text, values, missing = new Set()) {
  const byKey = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), [key, value]]));
  return String(text || "").replace(PLACEHOLDER, (match, name) => {
    const hit = byKey.get(name.toLowerCase());
    if (!hit) return match;
    if (!String(hit[1] || "").trim()) missing.add(hit[0]);
    return hit[1] || "";
  });
}

/** Placeholders in the text that are not known fields. */
export function unknownPlaceholders(text) {
  const known = new Set(CAP_EMAIL_FIELDS.map(([name]) => name.toLowerCase()));
  return [...new Set([...String(text || "").matchAll(PLACEHOLDER)].map((match) => match[1]).filter((name) => !known.has(name.toLowerCase())))];
}

/** Classic Outlook mailto: link. Line breaks become CRLF so Outlook keeps them. */
export function mailtoHref({ to, cc = [], subject = "", body = "" }) {
  const params = [];
  if (cc.length) params.push(`cc=${encodeURIComponent(cc.join(";"))}`);
  params.push(`subject=${encodeURIComponent(subject)}`);
  params.push(`body=${encodeURIComponent(String(body).replace(/\r?\n/g, "\r\n"))}`);
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?${params.join("&")}`;
}

/**
 * CC of one store, each address once: [{ email, why: ["FBC", "OM", "Houston", "Other territory", "Always"], name }].
 * The franchisee (to) is never CC'd on their own email.
 */
function ccFor(ctx, store, template, houston, to) {
  const byEmail = new Map();
  const add = (email, why, name = "") => {
    const key = email.toLowerCase();
    if (key === String(to || "").toLowerCase()) return;
    const entry = byEmail.get(key) || { email, why: [], name: "" };
    if (!entry.why.includes(why)) entry.why.push(why);
    if (name && !entry.name) entry.name = name;
    byEmail.set(key, entry);
  };
  const team = staffForStore(ctx, store);
  [["FBC", team.fbc[0]], ["OM", team.om[0]]].forEach(([role, person]) => emailList(emailOf(person)).forEach((email) => add(email, role, person.name || "")));
  emailList(houston ? template.ccHouston : template.ccOther).forEach((email) => add(email, houston ? "Houston" : "Other territory"));
  emailList(template.ccAlways).forEach((email) => add(email, "Always"));
  return [...byEmail.values()];
}

/**
 * The email for one CAP record: { to, cc, ccInfo, subject, body, href, houston, missing: [field names with no value] }.
 */
export function buildCapEmail(ctx, record, template) {
  const values = capEmailValues(ctx, record);
  const store = ctx.storeByNum.get(String(record.store_num));
  const houston = isHoustonStore(ctx, store);
  const to = values.Email;
  const ccInfo = ccFor(ctx, store, template, houston, to);
  const cc = ccInfo.map((entry) => entry.email);
  const missing = new Set();
  const subject = fillTemplate(template.subject, values, missing).replace(/\s*\r?\n\s*/g, " ").trim();
  const body = fillTemplate(template.body, values, missing);
  const team = { fbc: ccInfo.some((entry) => entry.why.includes("FBC")), om: ccInfo.some((entry) => entry.why.includes("OM")) };
  return { to, cc, ccInfo, team, store: !!store, subject, body, houston, missing: [...missing], href: to ? mailtoHref({ to, cc, subject, body }) : "" };
}
