/* Search tab: opening results and remembering recent searches. */
import { STORAGE_KEYS } from "../../config/constants.js";
import { local } from "../../lib/storage.js";
import { getContext } from "../../state/dataStore.js";
import { openCallDetails, openCapForm, openIssueDetails, openOnboardingDetails, openStaffDetail, openStore } from "../../state/dialogs.js";
import { showFranchisee } from "../../state/uiStore.js";

const RECENT_LIMIT = 8;

/** Opens what a result points to: the franchisee in its tab, or the record's window. */
export function openResult(entry) {
  const { type, id } = entry.open;
  if (type === "franchisee") {
    const franchisee = getContext().frById.get(id);
    if (franchisee) showFranchisee(franchisee);
    return;
  }
  const openers = { store: openStore, staff: openStaffDetail, issue: openIssueDetails, onboarding: openOnboardingDetails, cap: openCapForm, call: openCallDetails };
  openers[type]?.(id);
}

export function recentSearches() {
  const list = local.getJson(STORAGE_KEYS.recentSearches, []);
  return Array.isArray(list) ? list.filter((item) => typeof item === "string").slice(0, RECENT_LIMIT) : [];
}

/** Moves the query to the top of the recent list. Returns the new list. */
export function rememberSearch(query) {
  const text = String(query || "").trim();
  if (text.length < 2) return recentSearches();
  const list = [text, ...recentSearches().filter((item) => item.toLowerCase() !== text.toLowerCase())].slice(0, RECENT_LIMIT);
  local.setJson(STORAGE_KEYS.recentSearches, list);
  return list;
}

export function clearRecentSearches() {
  local.setJson(STORAGE_KEYS.recentSearches, []);
  return [];
}
