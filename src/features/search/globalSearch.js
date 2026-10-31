/*
 * Search tab: one box for every franchisee, store, FBC / OM, concern, onboarding record, CAP and call.
 *
 * A query can start with a prefix to search one thing only:
 *   #10020        store number          @Aggarwal     franchisee name
 *   t:540         territory             city:Fresno   city
 *   zip:93722     ZIP code              phone:714863  phone (digits only, any part)
 *   email:gmail   email address
 * Without a prefix every field is searched. Records also match through their store and franchisee,
 * so "city:Fresno" finds the stores in Fresno and their issues, CAPs and calls.
 */
import { capContact, capDueText, capIsOpen, normalizeCapStatus } from "../../domain/caps.js";
import { callFranchiseeName } from "../../domain/calls.js";
import { franchiseeName, storeOpenIssues, storesOf } from "../../domain/context.js";
import { isIssueOpen, issueFranchiseeId, issueNumber, normalizeIssueStatus } from "../../domain/issues.js";
import { obFranchiseeId, obIsOpen, obPlatformName, obStatusLabel, obVisible } from "../../domain/onboarding.js";
import { contactsOf, emailOf, issuePlatforms, rolesOf, storeAddressLine, storeStatus, territorySet } from "../../domain/records.js";
import { numRank, textRank } from "../../domain/search.js";
import { storesHandled } from "../../domain/staff.js";
import { richToPlain } from "../../lib/richText.js";
import { compareNumbers, digitsOnly } from "../../lib/text.js";

/** [key, label, icon] — "all" plus one scope per kind of record. */
export const SEARCH_SCOPES = [
  ["all", "All", "search"],
  ["franchisees", "Franchisees", "users"],
  ["stores", "Stores", "store"],
  ["staff", "FBC / OM", "contact"],
  ["concerns", "Concerns", "message-square-warning"],
  ["onboarding", "Onboarding", "rocket"],
  ["caps", "CAPs", "list-checks"],
  ["calls", "Calls", "phone-call"],
];

/** Prefixes, longest token first when parsing. */
export const SEARCH_PREFIXES = [
  { key: "store", tokens: ["#"], label: "Store number", example: "#10020", help: "Exact number first, then numbers that start with or contain it. Shows the store and its owner, team, issues, CAP and calls." },
  { key: "fr", tokens: ["@"], label: "Franchisee name", example: "@Aggarwal", help: "The franchisee plus all their stores, issues, onboarding, CAPs and calls." },
  { key: "terr", tokens: ["territory:", "terr:", "t:"], label: "Territory", example: "t:540", help: "Everything in one territory." },
  { key: "city", tokens: ["city:"], label: "City", example: "city:Fresno", help: "Stores in the city and everything linked to them." },
  { key: "zip", tokens: ["zip:"], label: "ZIP code", example: "zip:937", help: "Full ZIP or its first digits." },
  { key: "phone", tokens: ["phone:", "tel:"], label: "Phone", example: "phone:8638900", help: "Any part of a store, franchisee or CAP phone. Spaces, dashes and brackets are ignored." },
  { key: "email", tokens: ["email:"], label: "Email", example: "email:gmail.com", help: "Franchisee, FBC / OM and CAP email addresses." },
];

const TOKENS = SEARCH_PREFIXES.flatMap((prefix) => prefix.tokens.map((token) => [token, prefix])).sort((a, b) => b[0].length - a[0].length);

/** { mode: "any" | prefix key, prefix, q, d, phoneLike, raw } */
export function parseFind(raw) {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();
  const hit = TOKENS.find(([token]) => lower.startsWith(token));
  const q = (hit ? text.slice(hit[0].length) : text).trim().toLowerCase().replace(/\s+/g, " ");
  const d = digitsOnly(q);
  return { mode: hit ? hit[1].key : "any", prefix: hit ? hit[1] : null, q, d, phoneLike: d.length >= 3 && /^[\d\s()+.-]+$/.test(q), raw: text };
}

/* ---------- index: one entry per record ---------- */

const ago = (ts) => (ts ? new Date(ts).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "");

/**
 * Returns { entries, storeByNum, frById }.
 * Entry: { cat, key, id, title, sub, status: {text, tone}, storeNum, frId, frName, fields: [[kind, label, value]], sortKey, open: {type, id} }
 * kind: name | num | terr | city | zip | phone | email | text (anything else)
 */
export function buildSearchIndex(ctx) {
  const entries = [];
  const capByStore = new Map(ctx.caps.map((record) => [String(record.store_num), record]));

  ctx.franchisees.forEach((franchisee) => {
    const stores = storesOf(ctx, franchisee.id);
    const open = ctx.openIssuesByFr.get(franchisee.id) || 0;
    entries.push({
      cat: "franchisees", key: `fr-${franchisee.id}`, id: franchisee.id, title: franchisee.name || "(no name)",
      sub: [`${stores.length} store${stores.length === 1 ? "" : "s"}`, franchisee.territory ? `Territory ${franchisee.territory}` : "", open ? `${open} open issue${open === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · "),
      status: franchisee.closed ? { text: "Closed", tone: "idle" } : null,
      frId: franchisee.id, frName: franchisee.name || "", stores,
      fields: [["name", "Name", franchisee.name], ["terr", "Territory", franchisee.territory],
        ...contactsOf(franchisee).filter((contact) => contact.value).map((contact) => [contact.type === "email" ? "email" : "phone", contact.type === "email" ? "Email" : contact.type === "cell" ? "Cell" : "Phone", contact.value]),
        ["text", "Notes", franchisee.notes]],
      sortKey: String(franchisee.name || "").toLowerCase(), open: { type: "franchisee", id: franchisee.id },
    });
  });

  ctx.stores.forEach((store) => {
    const status = storeStatus(store);
    const open = storeOpenIssues(ctx, store.num);
    const cap = capByStore.get(String(store.num));
    entries.push({
      cat: "stores", key: `st-${store.id}`, id: store.id, title: `Store ${store.num || "—"}`,
      sub: [franchiseeName(ctx, store.franchisee_id), storeAddressLine(store), open ? `${open} open issue${open === 1 ? "" : "s"}` : "", cap && capIsOpen(cap) ? `CAP: ${normalizeCapStatus(cap.status)}` : ""].filter(Boolean).join(" · "),
      status: status !== "Open" ? { text: status, tone: status === "Closed" ? "bad" : "warn" } : null,
      storeNum: String(store.num || ""), frId: store.franchisee_id, store,
      fields: [["num", "Store #", store.num], ["text", "Address", store.address], ["city", "City", store.city], ["text", "State", store.state], ["zip", "ZIP", store.zip], ["terr", "Territory", store.territory], ["phone", "Phone", store.phone]],
      sortKey: store.num, open: { type: "store", id: store.id },
    });
  });

  ctx.staff.forEach((person) => {
    const stores = storesHandled(ctx, person);
    entries.push({
      cat: "staff", key: `sf-${person.id}`, id: person.id, title: person.name || "(no name)",
      sub: [rolesOf(person).join(" & "), `${stores.length} store${stores.length === 1 ? "" : "s"}`, emailOf(person)].filter(Boolean).join(" · "),
      status: null, stores,
      fields: [["name", "Name", person.name], ["email", "Email", emailOf(person)], ["text", "Role", person.role]],
      sortKey: String(person.name || "").toLowerCase(), open: { type: "staff", id: person.id },
    });
  });

  ctx.issues.forEach((issue) => {
    const title = richToPlain(issue.title || "").replace(/\s+/g, " ").trim();
    const status = normalizeIssueStatus(issue.status);
    const frId = issueFranchiseeId(ctx, issue);
    entries.push({
      cat: "concerns", key: `is-${issue.id}`, id: issue.id, title: `${issueNumber(issue) ? `#${issueNumber(issue)} ` : ""}${title || "Issue"}`,
      sub: [`Store ${issue.store_num || "—"}`, franchiseeName(ctx, frId), issuePlatforms(issue).join(", "), `logged ${ago(issue.created_at)}`].filter(Boolean).join(" · "),
      status: { text: status, tone: isIssueOpen(issue) ? (status === "Pending" ? "bad" : "warn") : "ok" },
      storeNum: String(issue.store_num || ""), frId,
      fields: [["text", "Issue", title], ["text", "Action taken", richToPlain(issue.action_taken || "")], ["text", "Platforms", issuePlatforms(issue).join(", ")], ["num", "Issue #", issueNumber(issue)]],
      sortKey: -new Date(issue.created_at || 0).getTime(), open: { type: "issue", id: issue.id },
    });
  });

  ctx.onboarding.filter(obVisible).forEach((record) => {
    const frId = obFranchiseeId(ctx, record);
    entries.push({
      cat: "onboarding", key: `ob-${record.id}`, id: record.id, title: `${obPlatformName(record.platform)} onboarding · Store ${record.store_num || "—"}`,
      sub: [franchiseeName(ctx, frId), `started ${ago(record.created_at)}`].filter(Boolean).join(" · "),
      status: { text: obStatusLabel(record.status), tone: obIsOpen(record) ? "warn" : "ok" },
      storeNum: String(record.store_num || ""), frId,
      fields: [["text", "Platform", obPlatformName(record.platform)], ["text", "Details", richToPlain(record.details || "")], ["text", "Latest update", richToPlain(record.last_update || "")]],
      sortKey: -new Date(record.created_at || 0).getTime(), open: { type: "onboarding", id: record.id },
    });
  });

  ctx.caps.forEach((record) => {
    const contact = capContact(ctx, record);
    const status = normalizeCapStatus(record.status);
    const store = ctx.storeByNum.get(String(record.store_num));
    entries.push({
      cat: "caps", key: `cap-${record.id}`, id: record.id, title: `CAP · Store ${record.store_num}`,
      sub: [contact.name, capIsOpen(record) ? capDueText(record) : "", record.notes].filter(Boolean).join(" · "),
      status: { text: status, tone: status === "Completed" ? "ok" : status === "No Action Yet" ? "bad" : "warn" },
      storeNum: String(record.store_num || ""), frId: store?.franchisee_id,
      fields: [["email", "Email", contact.email], ["phone", "Phone", contact.phone], ["text", "Notes", record.notes], ["text", "Status", status]],
      sortKey: record.store_num, open: { type: "cap", id: record.id },
    });
  });

  ctx.callLogs.forEach((call) => {
    const name = callFranchiseeName(ctx, call);
    entries.push({
      cat: "calls", key: `cl-${call.id}`, id: call.id, title: `Call · ${name}`,
      sub: [ago(call.call_at), call.store_num ? `Store ${call.store_num}` : "", richToPlain(call.reason || "")].filter(Boolean).join(" · "),
      status: call.outcome ? { text: call.outcome, tone: call.follow_up && !call.follow_up_done_at ? "warn" : "idle" } : null,
      storeNum: String(call.store_num || ""), frId: call.franchisee_id, frName: call.franchisee_name,
      fields: [["text", "Reason", richToPlain(call.reason || "")], ["text", "Result", richToPlain(call.result || "")], ["text", "Outcome", call.outcome]],
      sortKey: -new Date(call.call_at || 0).getTime(), open: { type: "call", id: call.id },
    });
  });

  return indexMaps(entries);
}

/* ---------- matching ---------- */

const LINKED = 4; // a match through the store or franchisee ranks after the record's own fields

/** "…text around the match…" (long notes and descriptions). */
function snippet(value, q) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 70 || !q) return text;
  const at = text.toLowerCase().indexOf(q);
  if (at < 0) return `${text.slice(0, 67)}…`;
  const start = Math.max(0, at - 25);
  return `${start ? "…" : ""}${text.slice(start, start + 70)}${start + 70 < text.length ? "…" : ""}`;
}

/** Best { rank, label, value } among fields of the given kinds (null kinds = all fields). */
function fieldMatch(fields, sq, kinds) {
  let best = null;
  fields.forEach(([kind, label, value]) => {
    if (!value || (kinds && !kinds.includes(kind))) return;
    let rank;
    if (kind === "terr") rank = territorySet(value).has(sq.q) ? 0 : textRank(value, sq.q);
    else if (kind === "num") rank = numRank(value, sq.q);
    else rank = textRank(value, sq.q);
    if (rank === 9 && (kind === "phone" || kind === "zip") && sq.d.length >= 3 && (sq.phoneLike || sq.mode === "phone" || sq.mode === "zip")) {
      const digits = digitsOnly(value);
      rank = digits === sq.d ? 0 : digits.startsWith(sq.d) ? 1 : digits.includes(sq.d) ? 3 : 9;
    }
    if (rank < 9 && (!best || rank < best.rank)) best = { rank, label, value: kind === "text" ? snippet(value, sq.q) : String(value) };
  });
  return best;
}

const STORE_KIND_FIELDS = { terr: ["terr"], city: ["city"], zip: ["zip"], phone: ["phone"] };

/** Fields of the store linked to an entry, as entries of the store index. */
const storeFieldsOf = (index, num) => index.storeByNum.get(String(num || ""))?.fields || [];
const franchiseeEntryOf = (index, id) => (id != null ? index.frById.get(id) : null);

/** How an entry matches: { rank, hint } or null. */
function matchEntry(entry, sq, index) {
  const { mode } = sq;
  const linkedStore = (kinds, label) => {
    if (!entry.storeNum || entry.cat === "stores") return null;
    const hit = fieldMatch(storeFieldsOf(index, entry.storeNum), sq, kinds);
    return hit ? { rank: hit.rank + LINKED, hint: `${label || `Store ${entry.storeNum}`} · ${hit.label} ${hit.value}` } : null;
  };
  const linkedStores = (kinds) => {
    let best = null;
    (entry.stores || []).forEach((store) => {
      const hit = fieldMatch(index.storeByNum.get(String(store.num))?.fields || [], sq, kinds);
      if (hit && (!best || hit.rank < best.rank)) best = { rank: hit.rank + LINKED - 1, hint: `Store ${store.num}${kinds[0] === "num" ? "" : ` · ${hit.label} ${hit.value}`}` };
    });
    return best;
  };
  const linkedFranchisee = (kinds) => {
    if (entry.cat === "franchisees") return null;
    const owner = franchiseeEntryOf(index, entry.frId);
    const fields = owner ? owner.fields : entry.frName ? [["name", "Name", entry.frName]] : [];
    const hit = fieldMatch(fields, sq, kinds);
    return hit ? { rank: hit.rank + LINKED, hint: kinds[0] === "name" ? `Franchisee ${owner?.title || entry.frName}` : `Franchisee ${hit.label.toLowerCase()} ${hit.value}` } : null;
  };
  const own = (kinds) => {
    const hit = fieldMatch(entry.fields, sq, kinds);
    if (!hit) return null;
    const onTitle = String(entry.title).toLowerCase().includes(sq.q);
    return { rank: hit.rank, hint: onTitle ? "" : `${hit.label}: ${hit.value}` };
  };
  const first = (...results) => results.filter(Boolean).sort((a, b) => a.rank - b.rank)[0] || null;

  if (mode === "store") {
    if (entry.cat === "stores") return own(["num"]);
    if (entry.cat === "franchisees" || entry.cat === "staff") return linkedStores(["num"]);
    const rank = numRank(entry.storeNum, sq.q);
    return rank < 9 ? { rank, hint: "" } : null;
  }
  if (mode === "fr") {
    if (entry.cat === "franchisees") return own(["name"]);
    if (entry.cat === "staff") return null;
    const hit = linkedFranchisee(["name"]);
    return hit ? { rank: hit.rank - LINKED, hint: entry.cat === "stores" ? "" : hit.hint } : null;
  }
  if (mode === "email") return first(own(["email"]), entry.cat !== "staff" && linkedFranchisee(["email"]));
  if (STORE_KIND_FIELDS[mode]) {
    const kinds = STORE_KIND_FIELDS[mode];
    if (entry.cat === "franchisees") return first(own(kinds), linkedStores(kinds));
    if (entry.cat === "staff") return mode === "terr" || mode === "city" || mode === "zip" ? linkedStores(kinds) : null;
    return first(own(kinds), linkedStore(kinds), mode === "phone" && linkedFranchisee(["phone"]));
  }
  // No prefix: the record's own fields, its store number, then its franchisee's name.
  const numHit = entry.storeNum && entry.cat !== "stores" ? numRank(entry.storeNum, sq.q) : 9;
  return first(own(null), numHit < 9 && { rank: numHit + 1, hint: "" },
    entry.cat === "stores" && linkedFranchisee(["name"]) && { rank: 3, hint: "" },
    entry.cat !== "stores" && entry.cat !== "franchisees" && entry.cat !== "staff" && linkedFranchisee(["name"]));
}

/** Entries plus lookup maps for linked matches. */
function indexMaps(entries) {
  const storeByNum = new Map();
  const frById = new Map();
  entries.forEach((entry) => {
    if (entry.cat === "stores") storeByNum.set(entry.storeNum, entry);
    if (entry.cat === "franchisees") frById.set(entry.id, entry);
  });
  return { entries, storeByNum, frById };
}

const tieBreak = (a, b) => (typeof a.entry.sortKey === "number" ? a.entry.sortKey - b.entry.sortKey : compareNumbers(String(a.entry.sortKey), String(b.entry.sortKey)));

/** Matches grouped by scope: { total, byCat: { cat: [{ entry, rank, hint }] } }, best first. */
export function runSearch(index, sq) {
  const byCat = Object.fromEntries(SEARCH_SCOPES.slice(1).map(([key]) => [key, []]));
  if (!sq.q) return { total: 0, byCat };
  let total = 0;
  index.entries.forEach((entry) => {
    const match = matchEntry(entry, sq, index);
    if (!match) return;
    // No "matched on" hint when the match is already visible in the title or the line below it.
    const visible = `${entry.title} ${entry.sub}`.toLowerCase().includes(sq.q);
    byCat[entry.cat].push({ entry, rank: match.rank, hint: visible ? "" : match.hint });
    total += 1;
  });
  Object.values(byCat).forEach((list) => list.sort((a, b) => a.rank - b.rank || tieBreak(a, b)));
  return { total, byCat };
}
