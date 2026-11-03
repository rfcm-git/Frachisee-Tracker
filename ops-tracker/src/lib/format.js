const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const fmtInt = (n) => (n == null || Number.isNaN(n) ? "–" : nf0.format(n));
export const fmtCompact = (n) => (n == null || Number.isNaN(n) ? "–" : n < 10000 ? nf0.format(n) : compact.format(n));
export const fmtMoney = (n) => (n == null || Number.isNaN(n) ? "–" : n >= 100000 ? "$" + compact.format(n) : usd0.format(n));
export const fmtMoney2 = (n) => (n == null || Number.isNaN(n) ? "–" : usd2.format(n));
export const fmtPct = (n, digits = 1) => (n == null || Number.isNaN(n) ? "–" : (n * 100).toFixed(digits) + "%");
export const fmtRating = (n) => (n == null || Number.isNaN(n) ? "–" : n.toFixed(2));
export const fmtDec = (n) => (n == null || Number.isNaN(n) ? "–" : nf1.format(n));
export function fmtHours(minutes) {
  if (minutes == null) return "–";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = minutes / 60;
  return h < 10 ? `${h.toFixed(1)}h` : `${Math.round(h)}h`;
}

const dateShort = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const dateLong = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeShort = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function fmtDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return dateShort.format(new Date(y, m - 1, d));
}
export const fmtDateTime = (ts) => `${dateShort.format(new Date(ts))}, ${timeShort.format(new Date(ts))}`;
export const fmtDate = (ts) => dateLong.format(new Date(ts));
export const fmtTime = (ts) => timeShort.format(new Date(ts));

export function fmtRelative(ts, now = Date.now()) {
  const diff = Math.max(0, now - new Date(ts).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(ts);
}

/** Signed change between two values, as a fraction of the previous value. */
export function pctChange(curr, prev) {
  if (!prev) return null;
  return (curr - prev) / prev;
}

export function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}
