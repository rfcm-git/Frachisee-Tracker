/*
 * The "data context": all loaded tables plus lookup indexes.
 * It is rebuilt whenever the data changes and passed to every domain function.
 */
import { byName, digitsOnly } from "../lib/text.js";
import { contactsOf } from "./records.js";
import { isIssueOpen } from "./issues.js";

export const EMPTY_DATA = Object.freeze({
  franchisees: [], stores: [], staff: [], issues: [], onboarding: [], callLogs: [], caps: [],
  onboardingReady: true, callLogsReady: true, capsReady: true, capsDueReady: true,
});

export function buildContext(data) {
  const franchisees = [...data.franchisees].sort(byName);
  const frById = new Map(franchisees.map((franchisee) => [franchisee.id, franchisee]));
  const staffById = new Map(data.staff.map((person) => [person.id, person]));
  const storesByFr = new Map();
  const storeByNum = new Map();
  data.stores.forEach((store) => {
    if (!storesByFr.has(store.franchisee_id)) storesByFr.set(store.franchisee_id, []);
    storesByFr.get(store.franchisee_id).push(store);
    if (store.num) storeByNum.set(String(store.num), store);
  });

  // Search text: franchisee name, territory and contacts; store number, address, phone and owner.
  const frSearch = new Map();
  franchisees.forEach((franchisee) => {
    const contacts = contactsOf(franchisee).map((contact) => contact.value).filter(Boolean);
    frSearch.set(franchisee.id, {
      text: [franchisee.name, franchisee.territory, ...contacts].join(" ").toLowerCase(),
      digits: contacts.map(digitsOnly).filter(Boolean).join(" "),
    });
  });
  const storeSearch = new Map();
  data.stores.forEach((store) => {
    const owner = frById.get(store.franchisee_id);
    storeSearch.set(store.id, {
      text: [store.num, store.address, store.city, store.state, store.zip, store.territory, store.phone, owner ? owner.name : ""].join(" ").toLowerCase(),
      digits: [digitsOnly(store.phone), digitsOnly(store.zip)].filter(Boolean).join(" "),
    });
  });

  const openIssuesByStore = new Map();
  const openIssuesByFr = new Map();
  data.issues.forEach((issue) => {
    if (!isIssueOpen(issue)) return;
    const num = String(issue.store_num);
    openIssuesByStore.set(num, (openIssuesByStore.get(num) || 0) + 1);
    if (issue.franchisee_id != null) openIssuesByFr.set(issue.franchisee_id, (openIssuesByFr.get(issue.franchisee_id) || 0) + 1);
  });

  return {
    ...data,
    franchisees,
    frById,
    staffById,
    storesByFr,
    storeByNum,
    frSearch,
    storeSearch,
    openIssuesByStore,
    openIssuesByFr,
  };
}

export const storesOf = (ctx, franchiseeId) => ctx.storesByFr.get(franchiseeId) || [];

export const franchiseeName = (ctx, id) => ctx.frById.get(id)?.name || "";

export const storeOpenIssues = (ctx, num) => ctx.openIssuesByStore.get(String(num)) || 0;

export const franchiseeOpenIssues = (ctx, id) => ctx.openIssuesByFr.get(id) || 0;

export const staffMember = (ctx, id) => (id == null ? null : ctx.staffById.get(id) || null);
