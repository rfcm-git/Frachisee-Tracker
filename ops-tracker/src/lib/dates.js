// Dates are handled as local "YYYY-MM-DD" strings (store-local business days).
export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, n) {
  const d = fromISODate(dateStr);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Inclusive list of ISO dates ending on `end`, `count` days long. */
export function dateRange(end, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

export function daysBetween(a, b) {
  return Math.round((fromISODate(b) - fromISODate(a)) / 86400000);
}
