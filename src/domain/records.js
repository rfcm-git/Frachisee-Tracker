/* Reading fields from database rows (some columns are JSON stored as text). */
import { CORE3, PLATFORMS, STORE_STATES } from "../config/constants.js";

function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "null") ?? fallback; } catch { return fallback; }
}

/** [{type: "email"|"cell"|"other", value}] */
export const contactsOf = (row) => { const list = parseJson(row?.contacts, []); return Array.isArray(list) ? list : []; };

/** {ue: "Active", dd: "Pending", ...} */
export const platformsOf = (store) => { const value = parseJson(store?.platforms, {}); return value && typeof value === "object" ? value : {}; };

/** [{ts, text}] */
export const notesOf = (store) => { const list = parseJson(store?.notes, []); return Array.isArray(list) ? list : []; };

/** ["Uber Eats", ...] */
export const issuePlatforms = (issue) => { const list = parseJson(issue?.platforms, []); return Array.isArray(list) ? list : []; };

/** "540, 584" -> Set {"540", "584"} */
export const territorySet = (value) => new Set(String(value || "").split(",").map((part) => part.trim()).filter(Boolean));

/** First territory of a store, or an em dash. */
export const primaryTerritory = (store) => String(store?.territory || "").split(",")[0].trim() || "—";

export const normalizePlatformStatus = (value) => (["Active", "Pending", "Not enrolled", "Exempted"].includes(value) ? value : "Not enrolled");

export const platformStatus = (store, key) => normalizePlatformStatus(platformsOf(store)[key] || "Not enrolled");

export const platformColor = (status) => {
  const value = normalizePlatformStatus(status);
  return value === "Active" ? "var(--ok)" : value === "Pending" ? "var(--warn)" : value === "Exempted" ? "var(--idle)" : "var(--danger)";
};

/** Chip class: on / pend / off / exempt. */
export const platformChipClass = (status) => (status === "Active" ? "on" : status === "Pending" ? "pend" : status === "Exempted" ? "exempt" : "off");

/** A full platforms object with every platform set to Not enrolled. */
export const emptyPlatforms = () => Object.fromEntries(PLATFORMS.map(([key]) => [key, "Not enrolled"]));

/** Normalizes every platform value before saving. */
export const normalizedPlatforms = (platforms) => Object.fromEntries(PLATFORMS.map(([key]) => [key, normalizePlatformStatus(platforms[key] || "Not enrolled")]));

/** Number of core delivery apps (UE, DD, GH) that are Active. */
export const coreActive = (store) => CORE3.filter(([key]) => platformStatus(store, key) === "Active").length;

export const hasGbp = (store) => !!String(store?.gbp || "").trim();

export function storeStatus(store) {
  if (!store) return "Open";
  if (STORE_STATES.includes(store.store_status)) return store.store_status;
  return store.closed ? "Closed" : "Open";
}

export const storeStatusClass = (status) => (status === "Open" ? "sst-open" : status === "Closed" ? "sst-closed" : "sst-temp");

export const isStoreOpen = (store) => storeStatus(store) === "Open";

export const hasRole = (person, role) => String(person?.role || "").split("&").map((part) => part.trim()).includes(role);

export const rolesOf = (person) => String(person?.role || "").split("&").map((part) => part.trim()).filter(Boolean);

export function emailOf(row) {
  if (row?.email) return row.email;
  const contact = contactsOf(row).find((item) => item.type === "email");
  return contact ? contact.value : "";
}

export function googleSearchUrl(store) {
  const query = ["Subway", store.num ? `#${store.num}` : "", store.address, store.city, store.state].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/** "123 Main St · Fresno, CA" */
export const storeAddressLine = (store) => [store.address, [store.city, store.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");

export const cityState = (store) => [store?.city, store?.state].filter(Boolean).join(", ");
