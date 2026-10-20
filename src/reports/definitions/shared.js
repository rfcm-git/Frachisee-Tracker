/* Helpers shared by the report definitions. */
import { contactsOf } from "../../domain/records.js";
import { parseQuery } from "../../domain/search.js";
import { normalizeName } from "../../lib/text.js";

/** "Name, Name" */
export const names = (people) => people.map((person) => person.name).join(", ");

/** All saved contact values of a franchisee. */
export const franchiseeContactsText = (franchisee) => (franchisee ? contactsOf(franchisee).filter((contact) => contact.value).map((contact) => contact.value).join(", ") : "");

/** Average with one decimal, or the fallback when there are no values. */
export function average(values, fallback = "") {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : fallback;
}

export const percentText = (part, total, empty = "—") => (total ? `${Math.round((part / total) * 1000) / 10}%` : empty);

/** Store / franchisee from the toolbar search ("#123" or "@name"), for "Use tab filters". */
export function searchToReportFilters(ctx, search) {
  const { mode, q } = parseQuery(search);
  const patch = {};
  if (mode === "store" && q && ctx.storeByNum.has(q)) patch.store = q;
  if (mode === "fr" && q) {
    const franchisee = ctx.franchisees.find((item) => normalizeName(item.name) === normalizeName(q)) || ctx.franchisees.find((item) => String(item.name || "").toLowerCase().includes(q));
    if (franchisee) patch.fr = franchisee.name;
  }
  return patch;
}

/** Number of distinct values. */
export const distinct = (records, key) => new Set(records.map(key)).size;
