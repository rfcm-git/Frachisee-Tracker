/*
 * Toolbar search.
 *   "#123"   store number only
 *   "@name"  franchisee name only
 *   anything else: store #, name, phone, address, city, ZIP, territory or email
 * Plain digits also match phone and ZIP pieces.
 */
import { compareStores, digitsOnly } from "../lib/text.js";
import { contactsOf } from "./records.js";
import { storesOf } from "./context.js";

export function parseQuery(raw) {
  const text = String(raw || "").trim();
  if (text.startsWith("#")) return { mode: "store", q: text.slice(1).trim().toLowerCase() };
  if (text.startsWith("@")) return { mode: "fr", q: text.slice(1).trim().toLowerCase() };
  return { mode: "any", q: text.toLowerCase() };
}

/** Parsed query plus digit helpers. */
export function searchQuery(raw) {
  const { mode, q } = parseQuery(raw);
  const d = digitsOnly(q);
  return { mode, q, d, phoneLike: d.length >= 3 && /^[\d\s()+.-]+$/.test(q) };
}

/** Plain "any" query object for a free-text filter box. */
export function freeTextQuery(text) {
  const q = String(text || "").trim().toLowerCase();
  const d = digitsOnly(q);
  return { mode: "any", q, d, phoneLike: d.length >= 3 && /^[\d\s()+.-]+$/.test(q) };
}

/** 0 = exact store #, 1 = starts with, 2 = contains, 9 = no match. */
export function numRank(num, query) {
  const value = String(num || "").toLowerCase().replace(/^#/, "");
  const q = String(query || "").replace(/^#/, "");
  if (!q) return 9;
  if (value === q) return 0;
  if (value.startsWith(q)) return 1;
  if (value.includes(q)) return 2;
  return 9;
}

/** Sort rank for a store: exact store # first, then starts-with, contains, other fields. */
export function storeRank(store, sq) {
  const rank = numRank(store.num, sq.q);
  return rank < 9 ? rank : 3;
}

/** True when a franchisee's contacts match the query. */
export function franchiseeContactMatch(ctx, franchiseeId, sq) {
  const franchisee = ctx.frById.get(franchiseeId);
  if (!franchisee) return false;
  const values = contactsOf(franchisee).map((contact) => String(contact.value || "").toLowerCase());
  return values.some((value) => value.includes(sq.q)) || (sq.phoneLike && (ctx.frSearch.get(franchiseeId)?.digits || "").includes(sq.d));
}

export function storeMatches(ctx, store, sq) {
  if (!sq.q) return true;
  if (sq.mode === "store") return numRank(store.num, sq.q) < 9;
  if (sq.mode === "fr") {
    const franchisee = ctx.frById.get(store.franchisee_id);
    return !!franchisee && String(franchisee.name || "").toLowerCase().includes(sq.q);
  }
  const index = ctx.storeSearch.get(store.id) || { text: "", digits: "" };
  return index.text.includes(sq.q) || (sq.phoneLike && index.digits.includes(sq.d)) || franchiseeContactMatch(ctx, store.franchisee_id, sq);
}

/**
 * How a franchisee matches the query: {rank, hint} or null when it does not match.
 * The hint explains a match that is not on the name (e.g. "Store 123 · Phone ...").
 */
export function franchiseeMatch(ctx, franchisee, sq) {
  if (!sq.q) return { rank: 5, hint: "" };
  const name = String(franchisee.name || "").toLowerCase();
  const stores = storesOf(ctx, franchisee.id);
  let best = 9;
  let bestStore = null;
  if (sq.mode !== "fr") {
    stores.forEach((store) => {
      const rank = numRank(store.num, sq.q);
      if (rank < best || (rank === best && bestStore && compareStores(store, bestStore) < 0)) { best = rank; bestStore = store; }
    });
  }
  const storeHint = () => (best === 0 ? "" : `Store ${bestStore.num}`);
  if (sq.mode === "store") return best < 9 ? { rank: best, hint: storeHint() } : null;
  if (sq.mode === "fr") return name.includes(sq.q) ? { rank: name.startsWith(sq.q) ? 1 : 2, hint: "" } : null;
  if (best < 9) return { rank: best, hint: storeHint() };
  if (name.includes(sq.q)) return { rank: name.startsWith(sq.q) ? 1 : 2, hint: "" };
  if (String(franchisee.territory || "").toLowerCase().includes(sq.q)) return { rank: 3, hint: `Territory ${franchisee.territory}` };
  const contact = contactsOf(franchisee).find((item) => String(item.value || "").toLowerCase().includes(sq.q) || (sq.phoneLike && digitsOnly(item.value).includes(sq.d)));
  if (contact) return { rank: 3, hint: `${contact.type === "email" ? "Email " : contact.type === "cell" ? "Cell " : ""}${contact.value}` };
  const store = stores.find((item) => {
    const index = ctx.storeSearch.get(item.id) || { text: "", digits: "" };
    return index.text.includes(sq.q) || (sq.phoneLike && index.digits.includes(sq.d));
  });
  if (store) {
    const field = [["phone", "Phone"], ["zip", "ZIP"], ["city", "City"], ["address", "Address"]].find(([key]) =>
      String(store[key] || "").toLowerCase().includes(sq.q) || (sq.phoneLike && key !== "city" && key !== "address" && digitsOnly(store[key]).includes(sq.d)));
    return { rank: 4, hint: `Store ${store.num}${field ? ` · ${field[1]} ${store[field[0]]}` : ""}` };
  }
  return null;
}

/** Franchisees whose name matches typed text, starts-with first (used by store pickers). */
export function findFranchiseesByName(ctx, text, limit = 8) {
  const q = String(text || "").replace(/^@/, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!q) return [];
  const starts = [];
  const contains = [];
  ctx.franchisees.forEach((franchisee) => {
    if (!storesOf(ctx, franchisee.id).length) return;
    const name = String(franchisee.name || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (name.startsWith(q)) starts.push(franchisee);
    else if (name.includes(q)) contains.push(franchisee);
  });
  return starts.concat(contains).slice(0, limit);
}

/** Stores whose number starts with the typed digits (used by store pickers). */
export function findStoresByNumber(ctx, text, exclude = [], limit = 8) {
  const value = String(text || "").replace(/^#/, "");
  return ctx.stores.filter((store) => String(store.num || "").startsWith(value) && !exclude.includes(String(store.num)))
    .sort((a, b) => numRank(a.num, value) - numRank(b.num, value) || compareStores(a, b))
    .slice(0, limit);
}
