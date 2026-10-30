/*
 * Named openers for every dialog, so features never deal with dialog type strings directly.
 * The matching components are registered in components/dialogs/DialogHost.jsx.
 */
import { closeAllDialogs, closeDialogType, findDialog, openDialog } from "./dialogStore.js";

export { findDialog };

export const DIALOG = {
  settings: "settings",
  links: "links",
  store: "store",
  storeIssues: "storeIssues",
  logIssue: "logIssue",
  updateIssue: "updateIssue",
  groupUpdate: "groupUpdate",
  multiIssue: "multiIssue",
  history: "history",
  issueDetails: "issueDetails",
  addNote: "addNote",
  franchiseeForm: "franchiseeForm",
  franchiseeInfo: "franchiseeInfo",
  addStore: "addStore",
  bulkImport: "bulkImport",
  bulkUpdate: "bulkUpdate",
  staffDetail: "staffDetail",
  staffForm: "staffForm",
  callLog: "callLog",
  callDetails: "callDetails",
  callFollowUp: "callFollowUp",
  newOnboarding: "newOnboarding",
  updateOnboarding: "updateOnboarding",
  capForm: "capForm",
  capsImport: "capsImport",
  dashList: "dashList",
  report: "report",
  confirm: "confirm",
  password: "password",
  conflict: "conflict",
};

export const openSettings = () => openDialog(DIALOG.settings);
export const openLinks = () => openDialog(DIALOG.links);

/** Store window. focusIssues also opens the store's issue list on top. */
export function openStore(storeId, { focusIssues = false, storeNum = null } = {}) {
  openDialog(DIALOG.store, { storeId });
  if (focusIssues && storeNum != null) setTimeout(() => openStoreIssues(storeNum), 60);
}

export const openStoreIssues = (storeNum) => openDialog(DIALOG.storeIssues, { mode: "store", storeNum: String(storeNum ?? "") });
export const openFranchiseeIssues = (franchiseeId) => openDialog(DIALOG.storeIssues, { mode: "fr", franchiseeId: franchiseeId || 0 });

export const openLogIssue = (storeId = null) => openDialog(DIALOG.logIssue, { storeId });
export const openUpdateIssue = (issueId) => openDialog(DIALOG.updateIssue, { issueId });
export const openGroupUpdate = (groupId, preselectId = null) => openDialog(DIALOG.groupUpdate, { groupId, preselectId });
export const openMultiIssue = () => openDialog(DIALOG.multiIssue);

/** Full description and facts of an issue (kind "issue") or onboarding record (kind "ob"). */
export const openIssueDetails = (issueId) => openDialog(DIALOG.issueDetails, { kind: "issue", id: issueId });
export const openOnboardingDetails = (onboardingId) => openDialog(DIALOG.issueDetails, { kind: "ob", id: onboardingId });

export const openIssueHistory = (issueId) => openDialog(DIALOG.history, { kind: "issue", issueId });
export const openGroupHistory = (groupId, fromId = null) => openDialog(DIALOG.history, { kind: "group", groupId, fromId });
export const openOnboardingHistory = (onboardingId) => openDialog(DIALOG.history, { kind: "onboarding", onboardingId });

export const openAddNote = (storeId) => openDialog(DIALOG.addNote, { storeId });

export const openFranchiseeForm = (franchiseeId = null) => openDialog(DIALOG.franchiseeForm, { franchiseeId });
export const openFranchiseeInfo = (franchiseeId, groupId = "") => openDialog(DIALOG.franchiseeInfo, { franchiseeId, groupId });
export const openAddStore = (franchiseeId) => openDialog(DIALOG.addStore, { franchiseeId });
export const openBulkImport = () => openDialog(DIALOG.bulkImport);
export const openBulkUpdate = () => openDialog(DIALOG.bulkUpdate);

export const openStaffDetail = (staffId) => openDialog(DIALOG.staffDetail, { staffId });
export const openStaffForm = (staffId = null) => openDialog(DIALOG.staffForm, { staffId });

/** Log a call (franchiseeId fixes the franchisee) or edit one (callId). */
export const openCallLog = (franchiseeId = null, callId = null) => openDialog(DIALOG.callLog, { franchiseeId, callId });
export const openCallDetails = (callId) => openDialog(DIALOG.callDetails, { callId });
export const openCallFollowUp = (callId) => openDialog(DIALOG.callFollowUp, { callId });

export const openNewOnboarding = () => openDialog(DIALOG.newOnboarding);
export const openUpdateOnboarding = (onboardingId) => openDialog(DIALOG.updateOnboarding, { onboardingId });

/** Add a store to CAPs Monitoring (capId null) or edit one. */
export const openCapForm = (capId = null) => openDialog(DIALOG.capForm, { capId });
export const openCapsImport = () => openDialog(DIALOG.capsImport);

/** key: "core:0", "plat:ue:Active", "gbp:no", "gap:nofbc", "status:Closed", … */
export const openDashboardList = (key) => openDialog(DIALOG.dashList, { storeKey: key });

/** Report builder. download = "xlsx" | "pdf" downloads right away with the preset, then closes. */
export const openReport = (kind, preset = null, download = null) => openDialog(DIALOG.report, { kind, preset, download });

/**
 * Asks for confirmation. onConfirm may be async; the dialog shows progress and closes when it resolves
 * (return false to keep it open).
 */
export const confirmAction = ({ text, okLabel = "Delete", title = "Confirm delete", onConfirm, busyLabel, icon, okClass }) =>
  openDialog(DIALOG.confirm, { text, okLabel, title, onConfirm, busyLabel, icon, okClass });

/** Asks for the admin password, then runs onUnlock. */
export const askPassword = (label, onUnlock, onCancel) => openDialog(DIALOG.password, { label, onUnlock, onCancel });

/** Tells the user a teammate changed the record first. */
export const showConflict = (what) => openDialog(DIALOG.conflict, { what });

export const closeDialogs = closeDialogType;

/** Closes every form, used before jumping to another screen. */
export const closeAll = closeAllDialogs;
