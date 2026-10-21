/* Onboarding records: one row per store + platform. */
import { OB_PLATFORMS } from "../config/constants.js";

export const obPlatformName = (key) => (OB_PLATFORMS.find(([value]) => value === key) || [key, key])[1];

export const obStatusClass = (status) => (status === "Onboarded" ? "ob-done" : status === "Exempted" ? "ob-exempt" : status === "Email Sent/Text Message" ? "ob-sent" : status === "Work in Progress" ? "ob-wip" : "ob-pend");

/** Label used on badges. */
export const obStatusLabel = (status) => (status === "Email Sent/Text Message" ? "Email / Text sent" : status);

/** Shorter label used in filters and the progress table. */
export const obShortLabel = (status) => (status === "Email Sent/Text Message" ? "Email/Text" : status === "Work in Progress" ? "WIP" : status);

export const obIsOpen = (record) => record.status !== "Onboarded" && record.status !== "Exempted";

/** Foodja records are kept but not shown. */
export const obVisible = (record) => record.platform !== "fj";

export function obHistory(record) {
  try {
    const list = Array.isArray(record.history) ? record.history : JSON.parse(record.history || "[]");
    return (Array.isArray(list) ? list : []).slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
  } catch {
    return [];
  }
}

/** Franchisee of the record: from its store, or the saved id. */
export function obFranchiseeId(ctx, record) {
  const store = ctx.storeByNum.get(String(record.store_num || ""));
  return store ? store.franchisee_id : (record.franchisee_id || 0);
}

/** Days in progress (still open) or days to onboard. */
export function obDays(record) {
  const start = new Date(record.created_at);
  if (Number.isNaN(start.getTime())) return "";
  let end = new Date();
  if (record.status === "Onboarded") {
    const steps = obHistory(record).filter((entry) => entry.status === "Onboarded");
    end = new Date((steps.length ? steps[steps.length - 1].ts : null) || record.updated_at || record.created_at);
  }
  return Math.max(0, Math.round(((end - start) / 864e5) * 10) / 10);
}

/** Text for the "keep Delivery Platforms in step" checkbox. */
export const obSyncLabel = (platform, status) => (status === "Onboarded"
  ? `Also set ${obPlatformName(platform)} to Active in this store's Delivery Platforms`
  : status === "Exempted"
    ? `Also set ${obPlatformName(platform)} to Exempted in this store's Delivery Platforms`
    : `Also set ${obPlatformName(platform)} to Pending in this store's Delivery Platforms (only if Not enrolled)`);
