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
  bulkUpdate: "bulkUpdate",
  staffUpdate: "staffUpdate",
  staffDetail: "staffDetail",
  staffForm: "staffForm",
  callLog: "callLog",
  callDetails: "callDetails",
  callFollowUp: "callFollowUp",
  addOnboarding: "addOnboarding",
  newOnboarding: "newOnboarding",
  onboardingImport: "onboardingImport",
  onboardingEmail: "onboardingEmail",
  updateOnboarding: "updateOnboarding",
  storeOnboarding: "storeOnboarding",
  capForm: "capForm",
  capsImport: "capsImport",
  capEmail: "capEmail",
  walmartImport: "walmartImport",
  walmartAdd: "walmartAdd",
  walmartUpdate: "walmartUpdate",
  walmartEmail: "walmartEmail",
  scheduleConfirm: "scheduleConfirm",
  scheduleEdit: "scheduleEdit",
  emailScope: "emailScope",
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

/** Log an issue. storeId fixes the store; franchiseeId fixes the franchisee (pick one of their stores or General). */
export const openLogIssue = (storeId = null, franchiseeId = null) => openDialog(DIALOG.logIssue, { storeId, franchiseeId });

/** Issues of the issue's store, or of its franchisee when it is a General issue (no store). */
export const openIssueScope = (issue) => (issue.store_num ? openStoreIssues(issue.store_num) : openFranchiseeIssues(issue.franchisee_id || 0));
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
export const openBulkUpdate = () => openDialog(DIALOG.bulkUpdate);
/** Update the FBC / OM list and store assignments from a spreadsheet. */
export const openStaffUpdate = () => openDialog(DIALOG.staffUpdate);

export const openStaffDetail = (staffId) => openDialog(DIALOG.staffDetail, { staffId });
export const openStaffForm = (staffId = null) => openDialog(DIALOG.staffForm, { staffId });

/** Log a call (franchiseeId fixes the franchisee, storeId preselects the store) or edit one (callId). */
export const openCallLog = (franchiseeId = null, callId = null, storeId = null) => openDialog(DIALOG.callLog, { franchiseeId, callId, storeId });
export const openCallDetails = (callId) => openDialog(DIALOG.callDetails, { callId });
export const openCallFollowUp = (callId) => openDialog(DIALOG.callFollowUp, { callId });

/** Onboarding tab "Add store": choose one store or many from a spreadsheet. */
export const openAddOnboarding = () => openDialog(DIALOG.addOnboarding);
export const openOnboardingImport = () => openDialog(DIALOG.onboardingImport);
/** Onboarding email message editor; previewId picks the record whose store is shown in the preview. */
export const openOnboardingEmail = (previewId = null, scope = "ob") => openDialog(DIALOG.onboardingEmail, { previewId, scope });

/** Add a store to onboarding. storeNums preselects stores; franchiseeId opens that franchisee's store list. */
export const openNewOnboarding = ({ storeNums = [], franchiseeId = null, platforms = null } = {}) => openDialog(DIALOG.newOnboarding, { storeNums, franchiseeId, platforms });
export const openUpdateOnboarding = (onboardingId) => openDialog(DIALOG.updateOnboarding, { onboardingId });
/** Update all of one store's onboarding platforms at once. */
export const openStoreOnboarding = (storeNum) => openDialog(DIALOG.storeOnboarding, { storeNum: String(storeNum) });

/** Add a store to the CAP list (capId null) or edit one. storeNum / franchiseeId preselect the store for a new one. */
export const openCapForm = (capId = null, { storeNum = "", franchiseeId = null } = {}) => openDialog(DIALOG.capForm, { capId, storeNum, franchiseeId });
export const openCapsImport = () => openDialog(DIALOG.capsImport);
/** Import Walmart's report into the Walmart tab. */
export const openWalmartImport = () => openDialog(DIALOG.walmartImport);
/** Add stores to the Walmart tab; storeNums preselects stores, franchiseeId opens that franchisee's store list. */
export const openWalmartAdd = ({ storeNums = [], franchiseeId = null } = {}) => openDialog(DIALOG.walmartAdd, { storeNums, franchiseeId });
/** Change a store's Walmart stage, add a note, see its change log. */
export const openWalmartUpdate = (recordId) => openDialog(DIALOG.walmartUpdate, { recordId });
/** Walmart email message editor; previewId picks the store shown in the preview. */
export const openWalmartEmail = (previewId = null) => openDialog(DIALOG.walmartEmail, { previewId });

/** "Just this store" or "All of the franchisee's stores" before an email: { heading, one, all, note } (see EmailScopeDialog). */
export const openEmailScope = (props) => openDialog(DIALOG.emailScope, props);

/** CAP email message editor; previewCapId picks the store shown in the preview. */
export const openCapEmail = (previewCapId = null) => openDialog(DIALOG.capEmail, { previewCapId });


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

/** Asks the user to confirm a scheduled task (e.g. the CAP list update) was done. occKey is the occurrence key. */
export const openScheduleConfirm = (scheduleId, occKey) => openDialog(DIALOG.scheduleConfirm, { scheduleId, occKey });
/** Edit a scheduled reminder (Settings). */
export const openScheduleEdit = (scheduleId) => openDialog(DIALOG.scheduleEdit, { scheduleId });
