import Toolbar from "./Toolbar.jsx";
import TopBar from "./TopBar.jsx";
import { EmptyState, LoadingState } from "../ui/common.jsx";
import { friendlyError } from "../../lib/errors.js";
import { loadAll } from "../../state/appActions.js";
import { useDataStore } from "../../state/dataStore.js";
import { openSettings } from "../../state/dialogs.js";
import { useUiStore } from "../../state/uiStore.js";
import CallLogsView from "../../features/calls/CallLogsView.jsx";
import DashboardView from "../../features/dashboard/DashboardView.jsx";
import FranchiseesView from "../../features/franchisees/FranchiseesView.jsx";
import ConcernsView from "../../features/issues/ConcernsView.jsx";
import OnboardingView from "../../features/onboarding/OnboardingView.jsx";
import ReportsTab from "../../features/reports/ReportsTab.jsx";
import StaffDirectory from "../../features/staff/StaffDirectory.jsx";
import StoresDirectory from "../../features/stores/StoresDirectory.jsx";

function CurrentView() {
  const tab = useUiStore((state) => state.tab);
  const issueSub = useUiStore((state) => state.issueSub);
  switch (tab) {
    case "franchisees": return <FranchiseesView />;
    case "stores": return <StoresDirectory />;
    case "staff": return <StaffDirectory />;
    case "issues": return issueSub === "onboarding" ? <OnboardingView /> : <ConcernsView />;
    case "calls": return <CallLogsView />;
    case "reports": return <ReportsTab />;
    default: return <DashboardView />;
  }
}

/** Connection states, or the current tab once the data is loaded. */
function ViewArea() {
  const phase = useDataStore((state) => state.phase);
  const loadingText = useDataStore((state) => state.loadingText);
  const error = useDataStore((state) => state.error);

  if (phase === "loading") return <LoadingState text={loadingText} />;
  if (phase === "disconnected") {
    return <EmptyState icon="unplug" title="Not connected" actions={<button type="button" className="btn" onClick={openSettings}>Open Settings</button>}>
      Open Settings and connect to your database.</EmptyState>;
  }
  if (phase === "error") {
    const info = friendlyError(error);
    const actions = info.action === "settings"
      ? <><button type="button" className="btn" onClick={openSettings}>Open Settings</button><button type="button" className="btn ghost" onClick={() => loadAll()}>Refresh</button></>
      : <button type="button" className="btn" onClick={() => loadAll()}>Try again</button>;
    return <EmptyState error icon="circle-alert" title={info.title} actions={actions}>{info.body}</EmptyState>;
  }
  return <CurrentView />;
}

export default function Workspace() {
  return (
    <main className="main">
      <TopBar />
      <div className="wrap">
        <Toolbar />
        <div id="view"><ViewArea /></div>
      </div>
    </main>
  );
}
