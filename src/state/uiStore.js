/*
 * What the user is looking at: tab, search, filters, pages and layout preferences.
 * Preferences are kept in localStorage; the current screen survives a browser refresh (sessionStorage).
 */
import { create } from "zustand";
import { ISSUE_STATES, OB_PLATFORMS, OB_STATES, PAGE_DEFAULTS, PAGE_OPTIONS, STORAGE_KEYS, TABS } from "../config/constants.js";
import { DEFAULT_CALL_FILTERS } from "../domain/calls.js";
import { localDateInput } from "../lib/format.js";
import { defaultPeriod, withPeriod } from "../lib/periods.js";
import { local, session } from "../lib/storage.js";

const FIRST_PAGES = { fr: 1, st: 1, frst: 1, is: 1, ob: 1, cl: 1 };

function savedPageSizes() {
  const sizes = {};
  Object.keys(PAGE_DEFAULTS).forEach((which) => {
    const saved = +local.get(STORAGE_KEYS.pageSize(which));
    sizes[which] = PAGE_OPTIONS[which].includes(saved) ? saved : PAGE_DEFAULTS[which];
  });
  return sizes;
}

function savedIssueView() {
  const value = local.get(STORAGE_KEYS.issueView);
  return value === "issue" || value === "fr" ? value : "store";
}

const defaultIssueFilter = () => ({ statuses: [], ...defaultPeriod(7), sort: "new" });
const defaultObFilter = () => ({ platforms: [], threePd: [], ezCater: [], sort: "new" });

function baseState() {
  return {
    tab: "dashboard",
    issueSub: "concerns",
    search: "",
    terrFilter: "",
    issuesOnly: false,
    closedOnly: false,
    selectedFr: null,
    pages: { ...FIRST_PAGES },
    pageSizes: savedPageSizes(),
    issueView: savedIssueView(),
    issueFilter: defaultIssueFilter(),
    obFilter: defaultObFilter(),
    callFilters: { ...DEFAULT_CALL_FILTERS },
    callSort: "desc",
    callInsights: local.get(STORAGE_KEYS.callInsights) !== "0",
    staffRole: "all",
    dashTerritory: "",
    dashSort: { key: "stores", dir: -1 },
    sidebarCollapsed: local.get(STORAGE_KEYS.sidebar) === "1",
    sidebarExpandedSm: false,
    frCardOpen: local.get(STORAGE_KEYS.frCard) === "1",
    idleMinutes: savedIdleMinutes(),
    countText: "",
  };
}

/** Minutes of no activity before a background refresh (0 = off). */
function savedIdleMinutes() {
  const saved = local.get(STORAGE_KEYS.idle);
  const value = saved !== null && saved !== "" ? +saved : 3;
  return Number.isNaN(value) ? 3 : clampIdle(value);
}

const clampIdle = (value) => Math.max(0, Math.min(120, Math.round(+value || 0)));

/* ---------- restore after a browser refresh ---------- */

const onlyValid = (list, allowed) => (Array.isArray(list) ? list.filter((item) => allowed.includes(item)) : []);

function restoredState() {
  const saved = session.getJson(STORAGE_KEYS.uiSession, null);
  if (!saved || typeof saved !== "object") return { state: {}, pending: null };
  const state = {};
  if (TABS.includes(saved.tab)) state.tab = saved.tab;
  if (saved.issueSub === "onboarding" || saved.issueSub === "concerns") state.issueSub = saved.issueSub;
  state.search = typeof saved.search === "string" ? saved.search : "";
  state.terrFilter = saved.terrFilter || "";
  state.selectedFr = saved.selectedFr ?? null;
  state.issuesOnly = !!saved.issuesOnly;
  state.closedOnly = !!saved.closedOnly;
  if (saved.pages && typeof saved.pages === "object") state.pages = { ...FIRST_PAGES, ...saved.pages };
  if (saved.issueFilter && typeof saved.issueFilter === "object") {
    state.issueFilter = { ...defaultIssueFilter(), ...saved.issueFilter, statuses: onlyValid(saved.issueFilter.statuses, ISSUE_STATES) };
  }
  if (saved.obFilter && typeof saved.obFilter === "object") {
    state.obFilter = {
      platforms: onlyValid(saved.obFilter.platforms, OB_PLATFORMS.map(([key]) => key)),
      threePd: onlyValid(saved.obFilter.threePd, OB_STATES),
      ezCater: onlyValid(saved.obFilter.ezCater, OB_STATES),
      sort: saved.obFilter.sort === "old" ? "old" : "new",
    };
  }
  if (saved.callFilters && typeof saved.callFilters === "object") state.callFilters = { ...DEFAULT_CALL_FILTERS, ...saved.callFilters };
  state.callSort = saved.callSort === "asc" ? "asc" : "desc";
  return { state, pending: saved };
}

const restored = restoredState();

/** Saved dialogs and scroll positions, applied once after the first data load. */
let pendingRestore = restored.pending;
export function takePendingRestore() {
  const value = pendingRestore;
  pendingRestore = null;
  return value;
}

export const useUiStore = create(() => ({ ...baseState(), ...restored.state }));

const set = (partial) => useUiStore.setState(partial);
const get = () => useUiStore.getState();
const resetPages = (...which) => ({ pages: { ...get().pages, ...Object.fromEntries(which.map((key) => [key, 1])) } });

/* ---------- navigation ---------- */

export function setTab(tab) {
  set({ tab, search: "", ...resetPages("fr", "st") });
}

export function setIssueSub(issueSub) {
  set({ tab: "issues", issueSub, search: "" });
  window.scrollTo(0, 0);
}

export function setSearch(search) {
  set({ search, ...resetPages("fr", "st", "frst", "is", "ob", "cl") });
}

export function setTerrFilter(terrFilter) {
  set({ terrFilter, ...resetPages("fr", "st") });
}

export const toggleIssuesOnly = () => set({ issuesOnly: !get().issuesOnly, ...resetPages("fr", "st") });
export const toggleClosedOnly = () => set({ closedOnly: !get().closedOnly, ...resetPages("st") });

export const selectFranchisee = (id) => set({ selectedFr: id, ...resetPages("frst") });

/** Opens the Franchisees tab on one franchisee. */
export function showFranchisee(franchisee) {
  set({ tab: "franchisees", issuesOnly: false, search: `@${franchisee.name}`, selectedFr: franchisee.id, ...resetPages("fr", "frst") });
}

/** Opens the All Stores tab for one territory. */
export function showTerritoryStores(territory) {
  set({ tab: "stores", terrFilter: territory, search: "", ...resetPages("st") });
  window.scrollTo(0, 0);
}

/** Dashboard links to another tab, keeping the dashboard territory. */
export function openTabFromDashboard(tab) {
  const { dashTerritory } = get();
  const extra = dashTerritory && (tab === "stores" || tab === "franchisees") ? { terrFilter: dashTerritory } : {};
  set({ tab, search: "", ...extra, ...resetPages("fr", "st") });
  window.scrollTo(0, 0);
}

export function showOpenConcerns() {
  set({ tab: "issues", issueSub: "concerns", search: "", issueFilter: { ...get().issueFilter, statuses: ["Pending", "Work in Progress"] }, ...resetPages("is") });
  window.scrollTo(0, 0);
}

export function showFranchiseeCalls(name) {
  set({ tab: "calls", search: "", callFilters: { ...get().callFilters, fr: name }, ...resetPages("cl") });
  window.scrollTo(0, 0);
}

/* ---------- paging ---------- */

export function setPage(which, value) {
  const page = parseInt(value, 10);
  set({ pages: { ...get().pages, [which]: Number.isNaN(page) || page < 1 ? 1 : page } });
}

export function setPageSize(which, value) {
  const size = +value;
  if (!PAGE_OPTIONS[which].includes(size)) return;
  local.set(STORAGE_KEYS.pageSize(which), size);
  set({ pageSizes: { ...get().pageSizes, [which]: size }, ...resetPages(which) });
}

/* ---------- concerns ---------- */

export function setIssueView(issueView) {
  local.set(STORAGE_KEYS.issueView, issueView);
  set({ issueView, ...resetPages("is") });
}

export const patchIssueFilter = (patch) => set({ issueFilter: { ...get().issueFilter, ...patch }, ...resetPages("is") });

export const setIssuePeriod = (period) => set({ issueFilter: withPeriod(get().issueFilter, period), ...resetPages("is") });

export function toggleIssueStatus(status) {
  const { statuses } = get().issueFilter;
  patchIssueFilter({ statuses: !status ? [] : statuses.includes(status) ? statuses.filter((item) => item !== status) : [...statuses, status] });
}

export const clearIssueFilters = () => set({ issueFilter: { ...defaultIssueFilter(), sort: get().issueFilter.sort }, search: "", ...resetPages("is") });

/* ---------- onboarding ---------- */

export function toggleObFilter(name, value) {
  const current = get().obFilter[name];
  const next = !value ? [] : current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  set({ obFilter: { ...get().obFilter, [name]: next }, ...resetPages("ob") });
}

/** Shows only one platform, or all platforms again when it was the only one shown. */
export function toggleObOnlyPlatform(platform) {
  const { platforms } = get().obFilter;
  const only = platforms.length === 1 && platforms[0] === platform;
  set({ obFilter: { ...get().obFilter, platforms: only ? [] : [platform] }, ...resetPages("ob") });
}

export const setObSort =(sort) => set({ obFilter: { ...get().obFilter, sort: sort === "old" ? "old" : "new" }, ...resetPages("ob") });

export const clearObFilters = () => set({ obFilter: { ...defaultObFilter(), sort: get().obFilter.sort }, search: "", ...resetPages("ob") });

/** True when the progress table cell (platform + status) is the active filter. */
export function isObCellActive(filter, platform, status) {
  if (filter.platforms.length !== 1 || filter.platforms[0] !== platform) return false;
  return platform === "ez"
    ? filter.ezCater.length === 1 && filter.ezCater[0] === status && !filter.threePd.length
    : filter.threePd.length === 1 && filter.threePd[0] === status && !filter.ezCater.length;
}

/** Click on a progress cell: filter to it, or clear when it is already the filter. */
export function toggleObCell(platform, status) {
  const { obFilter } = get();
  const next = isObCellActive(obFilter, platform, status)
    ? { ...obFilter, platforms: [], threePd: [], ezCater: [] }
    : { ...obFilter, platforms: [platform], threePd: platform === "ez" ? [] : [status], ezCater: platform === "ez" ? [status] : [] };
  set({ obFilter: next, ...resetPages("ob") });
}

/* ---------- call logs ---------- */

export function setCallFilter(key, value) {
  const callFilters = { ...get().callFilters, [key]: value };
  if (key === "range" && value === "custom" && !callFilters.from && !callFilters.to) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    callFilters.from = localDateInput(weekAgo);
  }
  set({ callFilters, ...resetPages("cl") });
}

export const resetCallFilters = () => set({ callFilters: { ...DEFAULT_CALL_FILTERS }, search: "", ...resetPages("cl") });

export const toggleCallSort = () => set({ callSort: get().callSort === "desc" ? "asc" : "desc" });

export function toggleCallInsights() {
  const callInsights = !get().callInsights;
  local.set(STORAGE_KEYS.callInsights, callInsights ? "1" : "0");
  set({ callInsights });
}

/* ---------- other views ---------- */

export const setStaffRole = (staffRole) => set({ staffRole });

export const setDashTerritory = (dashTerritory) => set({ dashTerritory });

export function sortDashboard(key) {
  const { dashSort } = get();
  set({ dashSort: dashSort.key === key ? { key, dir: -dashSort.dir } : { key, dir: key === "t" ? 1 : -1 } });
}

export const setCountText = (countText) => { if (get().countText !== countText) set({ countText }); };

export function toggleFrCard() {
  const frCardOpen = !get().frCardOpen;
  local.set(STORAGE_KEYS.frCard, frCardOpen ? "1" : "0");
  set({ frCardOpen });
}

/** Saves the idle auto-refresh delay and returns the stored value. */
export function setIdleMinutes(value) {
  const idleMinutes = clampIdle(value);
  local.set(STORAGE_KEYS.idle, idleMinutes);
  set({ idleMinutes });
  return idleMinutes;
}

export function toggleSidebar() {
  if (window.innerWidth <= 900) { set({ sidebarExpandedSm: !get().sidebarExpandedSm }); return; }
  const sidebarCollapsed = !get().sidebarCollapsed;
  local.set(STORAGE_KEYS.sidebar, sidebarCollapsed ? "1" : "0");
  set({ sidebarCollapsed });
}

/* ---------- save the screen before the page unloads ---------- */

/** extra = { store, storeIssues, scrollY, frListScroll, storeScroll } */
export function saveUiSession(extra) {
  const state = get();
  session.setJson(STORAGE_KEYS.uiSession, {
    tab: state.tab, issueSub: state.issueSub, search: state.search, terrFilter: state.terrFilter, selectedFr: state.selectedFr,
    issuesOnly: state.issuesOnly, closedOnly: state.closedOnly, pages: state.pages,
    issueFilter: state.issueFilter, obFilter: state.obFilter, callFilters: state.callFilters, callSort: state.callSort,
    ...extra,
    at: Date.now(),
  });
}
