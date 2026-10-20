/* Number, date and phone formatting. */

export const nowIso = () => new Date().toISOString();

export const formatNumber = (value) => Number(value || 0).toLocaleString();

/** Percentage with one decimal; 0 when the total is 0. */
export const percent = (value, total) => (total ? Math.round((value / total) * 1000) / 10 : 0);

/** "1 store" / "3 stores". */
export const plural = (count, word, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`;

export const pad2 = (value) => String(value).padStart(2, "0");

export function formatTimestamp(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(ts);
  }
}

/** yyyy-mm-dd for the local day. */
export function localDateInput(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** yyyy-mm-ddThh:mm for datetime-local inputs. */
export function localDateTimeInput(date) {
  return `${localDateInput(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Parses a yyyy-mm-dd input as local midnight. */
export const parseLocalDate = (value) => (value ? new Date(`${value}T00:00:00`) : null);

export function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Start of the current week (Sunday). */
export function startOfWeek(value = new Date()) {
  const date = startOfDay(value);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

export const addDays = (value, days) => {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

export const timeOf = (value) => new Date(value).getTime() || 0;

/** Formats up to 10 digits as (555) 123-4567 while typing. */
export function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Returns a formatted 10-digit phone, or null when the value is not a US phone number. */
export function phone10(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") digits = digits.slice(1);
  return digits.length === 10 ? formatPhone(digits) : null;
}

export const telHref = (value) => `tel:${String(value).replace(/[^\d+]/g, "")}`;

/** Makes a value safe for a file name. */
export const fileSlug = (value) => String(value || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");

/** Short weekday date and time used in call logs. */
export function formatCallTime(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
  return {
    date: date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
    time: date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  };
}

export const shortDate = (date) => date.toLocaleDateString([], { month: "short", day: "numeric" });

export const shortTime = (date) => date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
