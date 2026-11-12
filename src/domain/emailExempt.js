/*
 * Email exemptions: a store can be left out of some of the tracker's emails (stores.email_exempt).
 * Exempt stores can't be emailed from that tab and are left out of several-stores emails.
 */

/** Email types a store can be exempt from: [key, label, short label]. Keys match the email scopes. */
export const EMAIL_KINDS = [
  ["wm", "Walmart", "Walmart"],
  ["cap", "CAP", "CAP"],
  ["ob", "3PDs (Uber Eats, DoorDash, Grubhub)", "3PDs"],
  ["ez", "ezCater", "ezCater"],
];
const KEYS = EMAIL_KINDS.map(([key]) => key);
export const emailKindLabel = (kind) => EMAIL_KINDS.find(([key]) => key === kind)?.[2] || kind;

/** The email types a store is exempt from ([] when none, or when the column doesn't exist yet). */
export function storeEmailExempt(store) {
  let list = store?.email_exempt;
  if (typeof list === "string") {
    try { list = JSON.parse(list); } catch { list = []; }
  }
  return Array.isArray(list) ? list.filter((key) => KEYS.includes(key)) : [];
}

/** True when the store with this number is exempt from this email type. */
export const isEmailExempt = (ctx, storeNum, kind) => storeEmailExempt(ctx.storeByNum.get(String(storeNum ?? ""))).includes(kind);
