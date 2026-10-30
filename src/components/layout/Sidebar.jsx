import Icon from "../ui/Icon.jsx";
import { hasOpenFollowUp } from "../../domain/calls.js";
import { isIssueOpen } from "../../domain/issues.js";
import { openCapsCount } from "../../features/caps/capsSelectors.js";
import { openOnboardingCount } from "../../features/onboarding/onboardingSelectors.js";
import { useDataContext } from "../../state/dataStore.js";
import { openLinks, openSettings } from "../../state/dialogs.js";
import { setIssueSub, setTab, toggleSidebar, useUiStore } from "../../state/uiStore.js";

function TabButton({ tab, active, icon, label, count, countId, countTip }) {
  return <button type="button" className={`tab${active ? " active" : ""}`} title={label} aria-current={active ? "page" : undefined} onClick={() => setTab(tab)}>
    <span className="t-ic"><Icon name={icon} /></span><span className="t-lb">{label}</span>
    {count !== undefined && (count !== "" || !countId) && <span className="badge-num" id={countId} data-tip={countTip}>{count}</span>}
  </button>;
}

export default function Sidebar() {
  const ctx = useDataContext();
  const tab = useUiStore((state) => state.tab);
  const issueSub = useUiStore((state) => state.issueSub);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const openConcerns = ctx.issues.filter(isIssueOpen).length;
  const openOnboarding = openOnboardingCount(ctx);
  const openFollowUps = ctx.callLogs.filter(hasOpenFollowUp).length;
  const openCaps = openCapsCount(ctx);
  const onIssues = tab === "issues";
  const toggleLabel = collapsed ? "Expand menu" : "Collapse menu";

  return (
    <aside className="sidebar" id="sidebar" aria-label="Main navigation">
      <div className="sb-brand">
        <div className="mark">3PD</div>
        <div className="sb-name"><b>Franchisee Tracker</b><span>3PD Helpdesk</span></div>
      </div>
      <nav className="sb-nav">
        <div className="sb-label">Menu</div>
        <TabButton tab="dashboard" active={tab === "dashboard"} icon="layout-dashboard" label="Dashboard" />
        <TabButton tab="franchisees" active={tab === "franchisees"} icon="users" label="Franchisees" count={ctx.franchisees.length} />
        <TabButton tab="stores" active={tab === "stores"} icon="store" label="All Stores" count={ctx.stores.length} />
        <TabButton tab="staff" active={tab === "staff"} icon="contact" label="FBC / OM" count={ctx.staff.length} />
        <TabButton tab="issues" active={onIssues} icon="triangle-alert" label="Issues" count={openConcerns + openOnboarding} />
        <div className={`sb-subs${onIssues ? " show" : ""}`}>
          {[["concerns", "message-square-warning", "Concerns", openConcerns], ["onboarding", "rocket", "Onboarding", openOnboarding]].map(([sub, icon, label, count]) => {
            const on = onIssues && issueSub === sub;
            return <button type="button" key={sub} className={`sb-sub${on ? " on" : ""}`} title={label} aria-selected={on} onClick={() => setIssueSub(sub)}>
              <Icon name={icon} /><span className="t-lb">{label}</span><span className="sb-cnt">{count}</span></button>;
          })}
        </div>
        <TabButton tab="caps" active={tab === "caps"} icon="list-checks" label="CAPs Monitoring" count={openCaps || ""} countId="cnt-cap" countTip="Stores whose CAP is not completed yet" />
        <TabButton tab="calls" active={tab === "calls"} icon="phone-call" label="Call Logs" count={openFollowUps || ""} countId="cnt-cl" countTip="Follow-ups still open" />
        <TabButton tab="reports" active={tab === "reports"} icon="file-bar-chart" label="Reports" />
      </nav>
      <div className="sb-foot">
        <button type="button" className="sb-item" title="Links" aria-label="Links" onClick={openLinks}><span className="t-ic"><Icon name="link" /></span><span className="t-lb">Links</span></button>
        <button type="button" className="sb-item" title="Settings" aria-label="Settings" onClick={openSettings}><span className="t-ic"><Icon name="settings" /></span><span className="t-lb">Settings</span></button>
        <button type="button" className="sb-item sb-collapse" title={toggleLabel} aria-label={toggleLabel} aria-expanded={!collapsed} onClick={toggleSidebar}>
          <span className="t-ic"><Icon name={collapsed ? "panel-left-open" : "panel-left-close"} /></span><span className="t-lb">{collapsed ? "Expand" : "Collapse"}</span></button>
      </div>
    </aside>
  );
}
