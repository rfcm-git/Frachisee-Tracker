/*
 * Shared email helpers used by the onboarding, ezCater and Walmart emails: {{placeholders}}, who is CC'd and the Outlook (mailto:) link.
 * Houston stores (territory 540, or a Houston, TX address) CC the Houston list; every other store CCs the other-territory list.
 * The store's FBC and OM are always CC'd too. Each address is listed once (e.g. when the OM is also on a CC list).
 * Stores owned by Rohit or Raghu Marwaha go to Rajeev instead, with the owner moved to CC.
 */
import { franchiseeName } from "./context.js";
import { emailOf, territorySet } from "./records.js";
import { staffForStore } from "./staff.js";
import { isEmail } from "../lib/text.js";

/** Outlook can cut off longer mailto: links, so the editor warns past this. */
export const MAILTO_SAFE_LENGTH = 2000;

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

/** Owners whose emails go to Rajeev; the owner is CC'd instead. Each entry is the words of the name. */
const RAJEEV_EMAIL = "rajeev@marwahagroup.com";
const ROUTED_TO_RAJEEV = [["rohit", "marwaha"], ["raghu", "marwaha"]];

/** True when a name has all the words of Rohit or Raghu Marwaha ("Rohit Marwaha", "Marwaha, Rohit"…). */
function isRoutedToRajeev(...names) {
  return names.some((name) => {
    const words = new Set(String(name || "").toLowerCase().split(/[^a-z]+/).filter(Boolean));
    return ROUTED_TO_RAJEEV.some((owner) => owner.every((word) => words.has(word)));
  });
}

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

/** Placeholders in the text that are not known fields (fields: [[name, description]]). */
export function unknownPlaceholders(text, fields) {
  const known = new Set(fields.map(([name]) => name.toLowerCase()));
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
 * CC of one store, each address once: [{ email, why: ["Owner", "FBC", "OM", "Houston", "Other territory", "Always"], name }].
 * The recipient (to) is never CC'd on their own email. owner = { email, name } when the owner is moved from To to CC.
 */
function ccFor(ctx, stores, template, to, owner) {
  const byEmail = new Map();
  const add = (email, why, name = "") => {
    const key = email.toLowerCase();
    if (key === String(to || "").toLowerCase()) return;
    const entry = byEmail.get(key) || { email, why: [], name: "" };
    if (!entry.why.includes(why)) entry.why.push(why);
    if (name && !entry.name) entry.name = name;
    byEmail.set(key, entry);
  };
  if (owner) emailList(owner.email).forEach((email) => add(email, "Owner", owner.name));
  stores.forEach((store) => {
    const team = staffForStore(ctx, store);
    [["FBC", team.fbc[0]], ["OM", team.om[0]]].forEach(([role, person]) => emailList(emailOf(person)).forEach((email) => add(email, role, person.name || "")));
  });
  // Houston stores CC the Houston list, the others CC the other-territory list (both when the email mixes them).
  const houston = stores.map((store) => isHoustonStore(ctx, store));
  if (houston.some(Boolean)) emailList(template.ccHouston).forEach((email) => add(email, "Houston"));
  if (!stores.length || houston.some((value) => !value)) emailList(template.ccOther).forEach((email) => add(email, "Other territory"));
  emailList(template.ccAlways).forEach((email) => add(email, "Always"));
  return [...byEmail.values()];
}

/**
 * Who gets an email about one store or several stores of one franchisee (shared by the onboarding, ezCater and Walmart emails), using the template's CC rules.
 * storeOrStores: a store row, or a list of them. owner = { email, name } of the franchisee.
 * Returns { to, cc, ccInfo, team: { fbc, om } (every store has one), houston (any store in Houston), mixed (Houston and other stores), rajeev }.
 * rajeev = true when the stores belong to Rohit or Raghu Marwaha, so it goes to Rajeev with the owner in CC.
 */
export function recipientsFor(ctx, storeOrStores, template, owner) {
  const stores = (Array.isArray(storeOrStores) ? storeOrStores : [storeOrStores]).filter(Boolean);
  const houstonFlags = stores.map((store) => isHoustonStore(ctx, store));
  const first = stores[0];
  const rajeev = isRoutedToRajeev(first && franchiseeName(ctx, first.franchisee_id), owner.name);
  const to = rajeev ? RAJEEV_EMAIL : owner.email;
  const ccInfo = ccFor(ctx, stores, template, to, rajeev ? owner : null);
  const has = (role) => stores.length > 0 && stores.every((store) => emailList(emailOf(staffForStore(ctx, store)[role][0])).length > 0);
  const team = { fbc: has("fbc"), om: has("om") };
  return { to, cc: ccInfo.map((entry) => entry.email), ccInfo, team, houston: houstonFlags.some(Boolean), mixed: houstonFlags.some(Boolean) && houstonFlags.some((value) => !value), rajeev };
}

/** Fills the template (its several-stores message when multi) for these values and recipients: { subject, body, href, missing }. */
export function composeEmail(template, values, recipients, multi = false) {
  const missing = new Set();
  const subject = fillTemplate(multi ? template.multiSubject : template.subject, values, missing).replace(/\s*\r?\n\s*/g, " ").trim();
  const body = fillTemplate(multi ? template.multiBody : template.body, values, missing);
  const { to, cc } = recipients;
  return { subject, body, missing: [...missing], href: to ? mailtoHref({ to, cc, subject, body }) : "" };
}
