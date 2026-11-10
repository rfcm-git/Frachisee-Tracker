import { useEffect } from "react";
import Icon from "../ui/Icon.jsx";
import { hasOpenFollowUp } from "../../domain/calls.js";
import { isIssueOpen } from "../../domain/issues.js";
import { capsProgress, openCapsCount } from "../../features/caps/capsSelectors.js";
import { openWalmartCount } from "../../features/walmart/walmartSelectors.js";
import { openEzCount } from "../../features/ezcater/ezcaterSelectors.js";
import { openOnboardingCount } from "../../features/onboarding/onboardingSelectors.js";
import { useDataContext } from "../../state/dataStore.js";
import { openLinks, openSettings } from "../../state/dialogs.js";
import { setNavOnboardingOpen, setTab, toggleSidebar, useUiStore } from "../../state/uiStore.js";

function TabButton({ tab, active, icon, label, count, countId, countTip, kbd, sub = false }) {
  return <button type="button" className={`tab${sub ? " tab-sub" : ""}${active ? " active" : ""}`} title={kbd ? `${label} (${kbd} or Ctrl+K)` : label} aria-current={active ? "page" : undefined} onClick={() => setTab(tab)}>
    <span className="t-ic"><Icon name={icon} /></span><span className="t-lb">{label}</span>
    {count !== undefined && (count !== "" || !countId) && <span className="badge-num" id={countId} data-tip={countTip}>{count}</span>}
    {kbd && <kbd className="t-kbd" aria-hidden="true">{kbd}</kbd>}
  </button>;
}

/** Pages inside the menu's Onboarding group. */
const ONBOARDING_TABS = ["onboarding", "ezcater", "walmart"];

/**
 * Onboarding group: a header that opens or closes it, then 3PDs, ezCater and Walmart.
 * Closed, the header is highlighted when one of them is the current page (its hover text gives their combined count).
 */
function NavGroup({ tab, label, icon, total, children }) {
  const open = useUiStore((state) => state.navOnboardingOpen);
  const inside = ONBOARDING_TABS.includes(tab);
  // Landing on one of its pages (e.g. "Open in ezCater" from a store) opens the group.
  useEffect(() => { if (inside) setNavOnboardingOpen(true); }, [inside, tab]);
  return <div className={`nav-group${open ? " open" : ""}`}>
    <button type="button" className={`tab tab-group${!open && inside ? " active" : ""}`} aria-expanded={open} aria-controls="nav-onboarding"
      title={`${label} — ${open ? "hide" : "show"} 3PDs, ezCater and Walmart${total ? ` · ${total} still being onboarded` : ""}`} onClick={() => setNavOnboardingOpen(!open)}>
      <span className="t-ic"><Icon name={icon} /></span><span className="t-lb">{label}</span>
      <Icon name="chevron-down" className="tab-car" />
    </button>
    <div className="nav-sub" id="nav-onboarding" inert={!open}><div className="nav-sub-in" role="group" aria-label={label}>{children}</div></div>
  </div>;
}

/** Slow drifting light and a rolling wave behind the menu. Decorative only; still when the user prefers reduced motion. */
function SidebarBackdrop() {
  return <div className="sb-bg" aria-hidden="true">
    <span className="sb-glow g1" /><span className="sb-glow g2" /><span className="sb-glow g3" />
    <span className="sb-dots" />
    <svg className="sb-wave" viewBox="0 0 480 120" preserveAspectRatio="none">
      <path d="M0 60 C40 40 80 40 120 60 S200 80 240 60 S320 40 360 60 S440 80 480 60 V120 H0 Z" />
      <path className="w2" d="M0 78 C40 62 80 62 120 78 S200 94 240 78 S320 62 360 78 S440 94 480 78 V120 H0 Z" />
    </svg>
  </div>;
}

export default function Sidebar() {
  const ctx = useDataContext();
  const tab = useUiStore((state) => state.tab);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const openIssues = ctx.issues.filter(isIssueOpen).length;
  const openOnboarding = openOnboardingCount(ctx);
  const openFollowUps = ctx.callLogs.filter(hasOpenFollowUp).length;
  const openCaps = openCapsCount(ctx);
  const openWalmart = openWalmartCount(ctx);
  const openEz = openEzCount(ctx);
  const overdueCaps = ctx.capsDueReady ? capsProgress(ctx).overdue : 0;
  const toggleLabel = collapsed ? "Expand menu" : "Collapse menu";

  return (
    <aside className="sidebar" id="sidebar" aria-label="Main navigation">
      <SidebarBackdrop />
      <div className="sb-brand">
        <div className="mark">3PD</div>
        <div className="sb-name"><b>Franchisee Tracker</b><span>3PD Helpdesk</span></div>
      </div>
      <nav className="sb-nav">
        <div className="sb-label">Menu</div>
        <TabButton tab="dashboard" active={tab === "dashboard"} icon="layout-dashboard" label="Dashboard" />
        <TabButton tab="search" active={tab === "search"} icon="search" label="Search" kbd="/" />
        <TabButton tab="franchisees" active={tab === "franchisees"} icon="users" label="Franchisees" count={ctx.franchisees.length} />
        <TabButton tab="stores" active={tab === "stores"} icon="store" label="All Stores" count={ctx.stores.length} />
        <TabButton tab="staff" active={tab === "staff"} icon="contact" label="FBC / OM" count={ctx.staff.length} />
        <TabButton tab="issues" active={tab === "issues"} icon="triangle-alert" label="Issues" count={openIssues} />
        <NavGroup tab={tab} label="Onboarding" icon="rocket" total={openOnboarding + openEz + openWalmart}>
          <TabButton sub tab="onboarding" active={tab === "onboarding"} icon="bike" label="3PDs" count={openOnboarding || ""} countId="cnt-ob" countTip="Uber Eats, DoorDash and Grubhub records still being onboarded" />
          <TabButton sub tab="ezcater" active={tab === "ezcater"} icon="utensils" label="ezCater" count={openEz || ""} countId="cnt-ez" countTip="Stores still being onboarded on ezCater (Not enrolled or Work in Progress)" />
          <TabButton sub tab="walmart" active={tab === "walmart"} icon="shopping-cart" label="Walmart" count={openWalmart || ""} countId="cnt-wm" countTip="Stores still at Awaiting App or Payment Setup" />
        </NavGroup>
        <TabButton tab="caps" active={tab === "caps"} icon="list-checks" label="CAP" count={openCaps || ""} countId="cnt-cap" countTip={`Stores whose CAP is not completed yet${overdueCaps ? ` · ${overdueCaps} past the due date` : ""}`} />
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
