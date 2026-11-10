/*
 * What the user is looking at: tab, search, filters, pages and layout preferences.
 * Preferences are kept in localStorage; the current screen survives a browser refresh (sessionStorage).
 */
import { create } from "zustand";
import { CAP_STATES, ISSUE_STATES, OB_PLATFORMS, OB_STATES, PAGE_DEFAULTS, PAGE_OPTIONS, STORAGE_KEYS, TABS, WM_STAGES } from "../config/constants.js";
import { CALL_VIEWS, DEFAULT_CALL_FILTERS } from "../domain/calls.js";
import { localDateInput } from "../lib/format.js";
import { defaultPeriod, withPeriod } from "../lib/periods.js";
import { local, session } from "../lib/storage.js";

const FIRST_PAGES = { fr: 1, st: 1, frst: 1, is: 1, ob: 1, ez: 1, cl: 1, cap: 1, wm: 1 };

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
const defaultObFilter = () => ({ platforms: [], threePd: [], franchisees: [], sort: "new" });

/** CAPs sort keys: store number, status, date added, last updated. */
export const CAP_SORT_KEYS = ["num", "status", "added", "updated", "due"];
const CAP_EMAIL_FILTERS = ["", "has", "none"];
const CAP_DUE_FILTERS = ["", "overdue", "today", "week", "none"];
const defaultCapsFilter = () => ({ statuses: [], email: "", due: "", sort: { key: "added", dir: -1 } });

/** ezCater sort keys and email filter ("" all, "none" not emailed yet, "sent" emailed — open stores only). */
export const EZ_SORTS = ["num", "status", "emailed", "added", "updated"];
export const EZ_EMAIL_FILTERS = ["", "none", "sent"];
const defaultEzFilter = () => ({ statuses: [], franchisees: [], email: "", sort: { key: "status", dir: 1 } });

/** Walmart sort keys: store number, stage (along the path), date emailed, date added, last updated. */
export const WM_SORTS = ["num", "stage", "emailed", "added", "updated"];
/** Walmart email filter: "" all, "none" not emailed yet, "sent" emailed (both only Awaiting App / Payment Setup). */
export const WM_EMAIL_FILTERS = ["", "none", "sent"];
const defaultWmFilter = () => ({ stages: [], franchisees: [], email: "", sort: { key: "stage", dir: 1 } });

function baseState() {
  return {
    tab: "dashboard",
    search: "",
    findQuery: "",
    findScope: "all",
    findFocus: 0,
    terrFilter: "",
    issuesOnly: false,
    closedOnly: false,
    selectedFr: null,
    pages: { ...FIRST_PAGES },
    pageSizes: savedPageSizes(),
    issueView: savedIssueView(),
    issueFilter: defaultIssueFilter(),
    obFilter: defaultObFilter(),
    capsFilter: defaultCapsFilter(),
    wmFilter: defaultWmFilter(),
    ezFilter: defaultEzFilter(),
    wmView: "stores",
    callFilters: { ...DEFAULT_CALL_FILTERS },
    callSort: "desc",
    callView: "calls",
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
  // Sessions saved before Onboarding became its own tab stored it as an Issues sub-tab.
  if (saved.tab === "issues" && saved.issueSub === "onboarding") state.tab = "onboarding";
  state.search = typeof saved.search === "string" ? saved.search : "";
  state.findQuery = typeof saved.findQuery === "string" ? saved.findQuery : "";
  state.findScope = typeof saved.findScope === "string" ? saved.findScope : "all";
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
      franchisees: Array.isArray(saved.obFilter.franchisees) ? saved.obFilter.franchisees.filter((id) => id != null && id !== "") : [],
      sort: saved.obFilter.sort === "old" ? "old" : "new",
    };
  }
  if (saved.ezFilter && typeof saved.ezFilter === "object") {
    state.ezFilter = {
      statuses: onlyValid(saved.ezFilter.statuses, OB_STATES),
      franchisees: Array.isArray(saved.ezFilter.franchisees) ? saved.ezFilter.franchisees.filter((id) => id != null && id !== "") : [],
      email: EZ_EMAIL_FILTERS.includes(saved.ezFilter.email) ? saved.ezFilter.email : "",
      sort: EZ_SORTS.includes(saved.ezFilter.sort?.key) ? { key: saved.ezFilter.sort.key, dir: saved.ezFilter.sort.dir === -1 ? -1 : 1 } : defaultEzFilter().sort,
    };
  }
  if (saved.wmView === "owners") state.wmView = "owners";
  if (saved.wmFilter && typeof saved.wmFilter === "object") {
    state.wmFilter = {
      stages: onlyValid(saved.wmFilter.stages, WM_STAGES),
      franchisees: Array.isArray(saved.wmFilter.franchisees) ? saved.wmFilter.franchisees.filter((id) => id != null && id !== "") : [],
      email: WM_EMAIL_FILTERS.includes(saved.wmFilter.email) ? saved.wmFilter.email : "",
      sort: WM_SORTS.includes(saved.wmFilter.sort?.key) ? { key: saved.wmFilter.sort.key, dir: saved.wmFilter.sort.dir === -1 ? -1 : 1 } : defaultWmFilter().sort,
    };
  }
  if (saved.capsFilter && typeof saved.capsFilter === "object") {
    const sort = saved.capsFilter.sort || {};
    state.capsFilter = {
      statuses: onlyValid(saved.capsFilter.statuses, CAP_STATES),
      email: CAP_EMAIL_FILTERS.includes(saved.capsFilter.email) ? saved.capsFilter.email : "",
      due: CAP_DUE_FILTERS.includes(saved.capsFilter.due) ? saved.capsFilter.due : "",
      sort: CAP_SORT_KEYS.includes(sort.key) ? { key: sort.key, dir: sort.dir === 1 ? 1 : -1 } : defaultCapsFilter().sort,
    };
  }
  if (saved.callFilters && typeof saved.callFilters === "object") state.callFilters = { ...DEFAULT_CALL_FILTERS, ...saved.callFilters };
  state.callSort = saved.callSort === "asc" ? "asc" : "desc";
  if (CALL_VIEWS.includes(saved.callView)) state.callView = saved.callView;
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

/* ---------- Search tab ---------- */

export const setFindQuery = (findQuery) => set({ findQuery });
export const setFindScope = (findScope) => set({ findScope });

/** Opens the Search tab and focuses its box; query (optional) replaces what is typed. */
export function openFind(query) {
  set({ tab: "search", findFocus: get().findFocus + 1, ...(typeof query === "string" ? { findQuery: query, findScope: "all" } : {}) });
  window.scrollTo(0, 0);
}

export function setSearch(search) {
  set({ search, ...resetPages("fr", "st", "frst", "is", "ob", "cl", "cap", "wm", "ez") });
}

export function setTerrFilter(terrFilter) {
  set({ terrFilter, ...resetPages("fr", "st") });
}

export const toggleIssuesOnly = () => set({ issuesOnly: !get().issuesOnly, ...resetPages("fr", "st") });
export const toggleClosedOnly = () => set({ closedOnly: !get().closedOnly, ...resetPages("st") });

export const selectFranchisee = (id) => set({ selectedFr: id, ...resetPages("frst") });

/** Opens the Franchisees tab on one franchisee. */
export function showFranchisee(franchisee) {
  set({ tab: "franchisees", issuesOnly: false, search: String(franchisee.name || ""), selectedFr: franchisee.id, ...resetPages("fr", "frst") });
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

/** Onboarding tab showing one store's records (platform and status filters cleared so none are hidden). */
export function showStoreOnboarding(storeNum) {
  set({ tab: "onboarding", search: `#${storeNum}`, obFilter: { ...get().obFilter, platforms: [], threePd: [], franchisees: [] }, ...resetPages("ob") });
  window.scrollTo(0, 0);
}

export function showOpenConcerns() {
  set({ tab: "issues", search: "", issueFilter: { ...get().issueFilter, statuses: ["Pending", "Work in Progress"] }, ...resetPages("is") });
  window.scrollTo(0, 0);
}

export function showFranchiseeCalls(name) {
  set({ tab: "calls", callView: "calls", search: "", callFilters: { ...get().callFilters, fr: name }, ...resetPages("cl") });
  window.scrollTo(0, 0);
}

export function showStoreCalls(storeNum) {
  set({ tab: "calls", callView: "calls", search: "", callFilters: { ...get().callFilters, store: String(storeNum) }, ...resetPages("cl") });
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
  return filter.threePd.length === 1 && filter.threePd[0] === status;
}

/** Click on a progress cell: filter to it, or clear when it is already the filter. */
export function toggleObCell(platform, status) {
  const { obFilter } = get();
  const next = isObCellActive(obFilter, platform, status)
    ? { ...obFilter, platforms: [], threePd: [] }
    : { ...obFilter, platforms: [platform], threePd: [status] };
  set({ obFilter: next, ...resetPages("ob") });
}

/* ---------- CAPs monitoring ---------- */

const patchCapsFilter = (patch) => set({ capsFilter: { ...get().capsFilter, ...patch }, ...resetPages("cap") });

/** Adds or removes a status; "" shows all statuses. */
export function toggleCapStatus(status) {
  const { statuses } = get().capsFilter;
  patchCapsFilter({ statuses: !status ? [] : statuses.includes(status) ? statuses.filter((item) => item !== status) : [...statuses, status] });
}

/** Shows only one status, or all again when it was the only one shown. */
export function toggleCapOnlyStatus(status) {
  const { statuses } = get().capsFilter;
  patchCapsFilter({ statuses: !status || (statuses.length === 1 && statuses[0] === status) ? [] : [status] });
}

export const setCapEmailFilter = (email) => patchCapsFilter({ email: CAP_EMAIL_FILTERS.includes(email) ? email : "" });

export const setCapDueFilter = (due) => patchCapsFilter({ due: CAP_DUE_FILTERS.includes(due) ? due : "" });

/** Progress-strip chips: the same due filter again shows all. */
export const toggleCapDueFilter = (due) => setCapDueFilter(get().capsFilter.due === due ? "" : due);

/** Sorts by a column; the same column again flips the direction. Added / updated start newest first, the rest ascending (due date: soonest first). */
export function sortCaps(key, dir) {
  if (!CAP_SORT_KEYS.includes(key)) return;
  const { sort } = get().capsFilter;
  const next = dir === 1 || dir === -1 ? dir : sort.key === key ? -sort.dir : key === "added" || key === "updated" ? -1 : 1;
  patchCapsFilter({ sort: { key, dir: next } });
}

export const clearCapsFilters = () => set({ capsFilter: { ...defaultCapsFilter(), sort: get().capsFilter.sort }, search: "", ...resetPages("cap") });

/** Opens the CAP tab, optionally on one status or due date filter (dashboard and reminders). */
export function showCaps(status = "", due = "") {
  set({ tab: "caps", search: "", capsFilter: { ...get().capsFilter, statuses: status ? [status] : [], email: "", due: CAP_DUE_FILTERS.includes(due) ? due : "" }, ...resetPages("cap") });
  window.scrollTo(0, 0);
}

/* ---------- ezCater ---------- */

const patchEzFilter = (patch) => set({ ezFilter: { ...get().ezFilter, ...patch }, ...resetPages("ez") });

/** Adds or removes a status ("" clears). */
export function toggleEzStatus(status) {
  const { statuses } = get().ezFilter;
  patchEzFilter({ statuses: !status ? [] : statuses.includes(status) ? statuses.filter((item) => item !== status) : [...statuses, status] });
}

/** Shows only this status; clicking the only shown status again shows all. */
export function toggleEzOnlyStatus(status) {
  const { statuses } = get().ezFilter;
  patchEzFilter({ statuses: !status || (statuses.length === 1 && statuses[0] === status) ? [] : [status] });
}

/** Adds or removes a franchisee id ("" clears). */
export function toggleEzFranchisee(id) {
  const { franchisees } = get().ezFilter;
  patchEzFilter({ franchisees: id === "" ? [] : franchisees.includes(id) ? franchisees.filter((item) => item !== id) : [...franchisees, id] });
}

export const setEzEmailFilter = (email) => patchEzFilter({ email: EZ_EMAIL_FILTERS.includes(email) ? email : "" });

/** Sorts by a column; the same column again flips the order. Dates start newest first. */
export function setEzSort(key, dir) {
  if (!EZ_SORTS.includes(key)) return;
  const { sort } = get().ezFilter;
  const next = dir === 1 || dir === -1 ? dir : sort.key === key ? -sort.dir : ["emailed", "added", "updated"].includes(key) ? -1 : 1;
  patchEzFilter({ sort: { key, dir: next } });
}

export const clearEzFilters = () => set({ ezFilter: { ...defaultEzFilter(), sort: get().ezFilter.sort }, search: "", ...resetPages("ez") });

/** Opens the ezCater tab, optionally on one store. */
export function showEzCater(storeNum = "") {
  set({ tab: "ezcater", search: storeNum ? `#${storeNum}` : "", ezFilter: { ...get().ezFilter, statuses: [], franchisees: [], email: "" }, ...resetPages("ez") });
  window.scrollTo(0, 0);
}

/* ---------- Walmart ---------- */

const patchWmFilter = (patch) => set({ wmFilter: { ...get().wmFilter, ...patch }, ...resetPages("wm") });

/** Adds or removes a stage ("" clears). */
export function toggleWmStage(stage) {
  const { stages } = get().wmFilter;
  patchWmFilter({ stages: !stage ? [] : stages.includes(stage) ? stages.filter((item) => item !== stage) : [...stages, stage] });
}

/** Shows only this stage; clicking the only shown stage again shows all. */
export function toggleWmOnlyStage(stage) {
  const { stages } = get().wmFilter;
  patchWmFilter({ stages: !stage || (stages.length === 1 && stages[0] === stage) ? [] : [stage] });
}

/** Adds or removes a franchisee id ("" clears). */
export function toggleWmFranchisee(id) {
  const { franchisees } = get().wmFilter;
  patchWmFilter({ franchisees: id === "" ? [] : franchisees.includes(id) ? franchisees.filter((item) => item !== id) : [...franchisees, id] });
}

/** "stores" (one row per store) or "owners" (franchisees with more than one store). */
export const setWmView = (wmView) => set({ wmView: wmView === "owners" ? "owners" : "stores", ...resetPages("wm") });

export const setWmEmailFilter = (email) => patchWmFilter({ email: WM_EMAIL_FILTERS.includes(email) ? email : "" });

/** Sorts by a column; the same column again flips the order. Dates start newest first. */
export function setWmSort(key, dir) {
  if (!WM_SORTS.includes(key)) return;
  const { sort } = get().wmFilter;
  const next = dir === 1 || dir === -1 ? dir : sort.key === key ? -sort.dir : ["emailed", "added", "updated"].includes(key) ? -1 : 1;
  patchWmFilter({ sort: { key, dir: next } });
}

export const clearWmFilters = () => set({ wmFilter: { ...defaultWmFilter(), sort: get().wmFilter.sort }, search: "", ...resetPages("wm") });

/** Opens the Walmart tab, optionally on one store. */
export function showWalmart(storeNum = "") {
  set({ tab: "walmart", search: storeNum ? `#${storeNum}` : "", wmFilter: { ...get().wmFilter, stages: [], franchisees: [], email: "" }, ...resetPages("wm") });
  window.scrollTo(0, 0);
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

export const setCallView = (callView) => set({ callView, ...resetPages("cl") });

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
    tab: state.tab, search: state.search, findQuery: state.findQuery, findScope: state.findScope, terrFilter: state.terrFilter, selectedFr: state.selectedFr,
    issuesOnly: state.issuesOnly, closedOnly: state.closedOnly, pages: state.pages,
    issueFilter: state.issueFilter, obFilter: state.obFilter, capsFilter: state.capsFilter, wmFilter: state.wmFilter, wmView: state.wmView, ezFilter: state.ezFilter, callFilters: state.callFilters, callSort: state.callSort, callView: state.callView,
    ...extra,
    at: Date.now(),
  });
}
