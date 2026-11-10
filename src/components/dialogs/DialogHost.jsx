import { useMemo } from "react";
import { DialogContext } from "./dialogContext.js";
import { ConfirmDialog, ConflictDialog, PasswordDialog } from "./CommonDialogs.jsx";
import { closeDialog, setDialogBusy, useDialogStore } from "../../state/dialogStore.js";
import { DIALOG } from "../../state/dialogs.js";
import CapFormDialog from "../../features/caps/CapFormDialog.jsx";
import CapsImportDialog from "../../features/caps/CapsImportDialog.jsx";
import WalmartImportDialog from "../../features/walmart/WalmartImportDialog.jsx";
import WalmartAddDialog from "../../features/walmart/WalmartAddDialog.jsx";
import WalmartUpdateDialog from "../../features/walmart/WalmartUpdateDialog.jsx";
import WalmartEmailDialog from "../../features/walmart/WalmartEmailDialog.jsx";
import EmailScopeDialog from "../email/EmailScopeDialog.jsx";
import CapEmailDialog from "../../features/caps/CapEmailDialog.jsx";
import CallDetailsDialog from "../../features/calls/CallDetailsDialog.jsx";
import CallLogDialog from "../../features/calls/CallLogDialog.jsx";
import CallFollowUpDialog from "../../features/calls/CallFollowUpDialog.jsx";
import BulkUpdateDialog from "../../features/franchisees/BulkUpdateDialog.jsx";
import FranchiseeFormDialog from "../../features/franchisees/FranchiseeFormDialog.jsx";
import FranchiseeInfoDialog from "../../features/franchisees/FranchiseeInfoDialog.jsx";
import GroupUpdateDialog from "../../features/issues/GroupUpdateDialog.jsx";
import HistoryDialog from "../../features/issues/HistoryDialog.jsx";
import IssueDetailsDialog from "../../features/issues/IssueDetailsDialog.jsx";
import LogIssueDialog from "../../features/issues/LogIssueDialog.jsx";
import MultiStoreIssueDialog from "../../features/issues/MultiStoreIssueDialog.jsx";
import StoreIssuesDialog from "../../features/issues/StoreIssuesDialog.jsx";
import UpdateIssueDialog from "../../features/issues/UpdateIssueDialog.jsx";
import AddOnboardingDialog from "../../features/onboarding/AddOnboardingDialog.jsx";
import NewOnboardingDialog from "../../features/onboarding/NewOnboardingDialog.jsx";
import OnboardingImportDialog from "../../features/onboarding/OnboardingImportDialog.jsx";
import OnboardingEmailDialog from "../../features/onboarding/OnboardingEmailDialog.jsx";
import UpdateOnboardingDialog from "../../features/onboarding/UpdateOnboardingDialog.jsx";
import StoreOnboardingDialog from "../../features/onboarding/StoreOnboardingDialog.jsx";
import ReportBuilderDialog from "../../features/reports/ReportBuilderDialog.jsx";
import LinksDialog from "../../features/settings/LinksDialog.jsx";
import SettingsDialog from "../../features/settings/SettingsDialog.jsx";
import ScheduleConfirmDialog from "../../features/schedules/ScheduleConfirmDialog.jsx";
import ScheduleEditDialog from "../../features/schedules/ScheduleEditDialog.jsx";
import StaffDetailDialog from "../../features/staff/StaffDetailDialog.jsx";
import StaffFormDialog from "../../features/staff/StaffFormDialog.jsx";
import StaffUpdateDialog from "../../features/staff/StaffUpdateDialog.jsx";
import AddNoteDialog from "../../features/stores/AddNoteDialog.jsx";
import AddStoreDialog from "../../features/stores/AddStoreDialog.jsx";
import StoreWindow from "../../features/stores/StoreWindow.jsx";

/** Dialog type -> component. */
const COMPONENTS = {
  [DIALOG.settings]: SettingsDialog,
  [DIALOG.links]: LinksDialog,
  [DIALOG.store]: StoreWindow,
  [DIALOG.storeIssues]: StoreIssuesDialog,
  [DIALOG.logIssue]: LogIssueDialog,
  [DIALOG.updateIssue]: UpdateIssueDialog,
  [DIALOG.groupUpdate]: GroupUpdateDialog,
  [DIALOG.multiIssue]: MultiStoreIssueDialog,
  [DIALOG.history]: HistoryDialog,
  [DIALOG.issueDetails]: IssueDetailsDialog,
  [DIALOG.addNote]: AddNoteDialog,
  [DIALOG.franchiseeForm]: FranchiseeFormDialog,
  [DIALOG.franchiseeInfo]: FranchiseeInfoDialog,
  [DIALOG.addStore]: AddStoreDialog,
  [DIALOG.bulkUpdate]: BulkUpdateDialog,
  [DIALOG.staffUpdate]: StaffUpdateDialog,
  [DIALOG.staffDetail]: StaffDetailDialog,
  [DIALOG.staffForm]: StaffFormDialog,
  [DIALOG.callLog]: CallLogDialog,
  [DIALOG.callDetails]: CallDetailsDialog,
  [DIALOG.callFollowUp]: CallFollowUpDialog,
  [DIALOG.addOnboarding]: AddOnboardingDialog,
  [DIALOG.newOnboarding]: NewOnboardingDialog,
  [DIALOG.onboardingImport]: OnboardingImportDialog,
  [DIALOG.onboardingEmail]: OnboardingEmailDialog,
  [DIALOG.updateOnboarding]: UpdateOnboardingDialog,
  [DIALOG.storeOnboarding]: StoreOnboardingDialog,
  [DIALOG.capForm]: CapFormDialog,
  [DIALOG.capsImport]: CapsImportDialog,
  [DIALOG.walmartImport]: WalmartImportDialog,
  [DIALOG.walmartAdd]: WalmartAddDialog,
  [DIALOG.walmartUpdate]: WalmartUpdateDialog,
  [DIALOG.walmartEmail]: WalmartEmailDialog,
  [DIALOG.emailScope]: EmailScopeDialog,
  [DIALOG.capEmail]: CapEmailDialog,
  [DIALOG.scheduleConfirm]: ScheduleConfirmDialog,
  [DIALOG.scheduleEdit]: ScheduleEditDialog,
  [DIALOG.report]: ReportBuilderDialog,
  [DIALOG.confirm]: ConfirmDialog,
  [DIALOG.password]: PasswordDialog,
  [DIALOG.conflict]: ConflictDialog,
};

const BASE_Z = 60;

function DialogFrame({ dialog, index, isTop }) {
  const value = useMemo(() => ({
    id: dialog.id,
    isTop,
    zIndex: BASE_Z + index * 2,
    close: () => closeDialog(dialog.id),
    setBusy: (busy) => setDialogBusy(dialog.id, busy),
  }), [dialog.id, index, isTop]);
  const Component = COMPONENTS[dialog.type];
  if (!Component) return null;
  return <DialogContext.Provider value={value}><Component {...dialog.props} /></DialogContext.Provider>;
}

/** Renders every open dialog; the last one opened is on top. */
export default function DialogHost() {
  const dialogs = useDialogStore((state) => state.dialogs);
  return dialogs.map((dialog, index) => <DialogFrame key={dialog.id} dialog={dialog} index={index} isTop={index === dialogs.length - 1} />);
}
