/* Report dates in the chosen time zone ("local", "America/Los_Angeles" or "Asia/Manila"). */
import { pad2 } from "../lib/format.js";

/** A Date whose local fields show the time in the chosen zone (Excel stores dates without a zone). */
export function reportDate(ts, timeZone) {
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  if (timeZone === "local") return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return new Date(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
}

/** "2026-10-17 14:05" in the chosen zone. */
export function reportDateText(ts, timeZone) {
  const date = reportDate(ts, timeZone);
  if (!date) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "yyyy-mm" month key in the chosen zone. */
export function reportMonth(ts, timeZone) {
  const date = reportDate(ts, timeZone);
  return date ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}` : "Unknown";
}

export function timeZoneName(timeZone) {
  if (timeZone === "local") return Intl.DateTimeFormat().resolvedOptions().timeZone || "computer time";
  return timeZone === "America/Los_Angeles" ? "Pacific Time" : "Philippine Time";
}
