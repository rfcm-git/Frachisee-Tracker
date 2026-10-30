import { useMemo } from "react";
import Icon from "../ui/Icon.jsx";
import { isIssueOpen } from "../../domain/issues.js";
import { territorySet } from "../../domain/records.js";
import { openOnboardingCount } from "../../features/onboarding/onboardingSelectors.js";
import { reportKindForTab } from "../../reports/catalog.js";
import { loadAll } from "../../state/appActions.js";
import { getContext, useDataContext } from "../../state/dataStore.js";
import { openCallLog, openCapForm, openCapsImport, openLogIssue, openMultiIssue, openNewOnboarding, openReport, openStaffForm } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { setIssueSub, setSearch, setTerrFilter, toggleClosedOnly, toggleIssuesOnly, useUiStore } from "../../state/uiStore.js";

const SEARCH_TABS = ["franchisees", "stores", "issues", "staff", "caps", "calls"];

function searchPlaceholder(tab, issueSub) {
  if (tab === "caps") return "Search CAPs: store #, franchisee, email, phone or notes…";
  if (tab === "calls") return "Search calls: franchisee, store #, reason or result…";
  if (tab === "staff") return "Search name, email, or #store";
  if (tab === "issues") return issueSub === "onboarding" ? "Search onboarding: store #, platform, notes, city…" : "Search issues, store #, phone, address, city, ZIP…";
  return "Search store #, name, phone, address, city, ZIP, territory, email…";
}

/** "Log issue", "New onboarding", "Add FBC / OM" or "Log call", depending on the tab. */
function primaryAction(tab, issueSub) {
  if (tab === "staff") return ["Add FBC / OM", () => openStaffForm(null)];
  if (tab === "caps") return ["Add store", () => {
    if (!getContext().capsReady) { toast("Run migrate-caps.sql first", "err"); return; }
    openCapForm();
  }];
  if (tab === "calls") return ["Log call", () => {
    if (!getContext().callLogsReady) { toast("Run migrate-call-logs.sql first", "err"); return; }
    openCallLog(null);
  }];
  if (tab === "issues" && issueSub === "onboarding") return ["New onboarding", () => {
    if (!getContext().onboardingReady) { toast("Run migrate-onboarding.sql first", "err"); return; }
    openNewOnboarding();
  }];
  if (tab === "issues") return ["Log issue", () => openLogIssue(null)];
  return null;
}

function TerritoryFilter() {
  const ctx = useDataContext();
  const terrFilter = useUiStore((state) => state.terrFilter);
  const territories = useMemo(() => {
    const all = new Set();
    ctx.franchisees.forEach((franchisee) => territorySet(franchisee.territory).forEach((value) => all.add(value)));
    ctx.stores.forEach((store) => territorySet(store.territory).forEach((value) => all.add(value)));
    return [...all].sort((a, b) => (+a || 0) - (+b || 0) || String(a).localeCompare(b));
  }, [ctx.franchisees, ctx.stores]);
  return <select className="terr-filter" value={terrFilter} aria-label="Territory" onChange={(event) => setTerrFilter(event.target.value)}>
    <option value="">All territories</option>
    {territories.map((value) => <option key={value} value={value}>Territory {value}</option>)}
  </select>;
}

export default function Toolbar() {
  const ctx = useDataContext();
  const tab = useUiStore((state) => state.tab);
  const issueSub = useUiStore((state) => state.issueSub);
  const search = useUiStore((state) => state.search);
  const countText = useUiStore((state) => state.countText);
  const issuesOnly = useUiStore((state) => state.issuesOnly);
  const closedOnly = useUiStore((state) => state.closedOnly);

  const showSearch = SEARCH_TABS.includes(tab);
  const primary = primaryAction(tab, issueSub);
  const concerns = tab === "issues" && issueSub === "concerns";
  const openConcerns = ctx.issues.filter(isIssueOpen).length;
  const openOnboarding = openOnboardingCount(ctx);

  return (
    <>
      {tab === "issues" && <div className="subtabs" role="tablist" aria-label="Issue categories" style={{ display: "flex" }}>
        {[["concerns", "message-square-warning", "Concerns", openConcerns], ["onboarding", "rocket", "Onboarding", openOnboarding]].map(([sub, icon, label, count]) => (
          <button type="button" key={sub} className={`subtab${issueSub === sub ? " on" : ""}`} role="tab" aria-selected={issueSub === sub} onClick={() => setIssueSub(sub)}>
            <Icon name={icon} />{label}<span className="st-n">{count || ""}</span></button>
        ))}
      </div>}
      {tab !== "dashboard" && tab !== "reports" && <div className="toolbar">
        {showSearch && <div className="search-wrap">
          <span className="lead"><Icon name="search" /></span>
          <input type="search" aria-label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder(tab, issueSub)} />
        </div>}
        {(tab === "franchisees" || tab === "stores") && <TerritoryFilter />}
        {tab === "stores" && <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <button type="button" className={`iconbtn${issuesOnly ? " on" : ""}`} title="Only stores with an issue" aria-pressed={issuesOnly} onClick={toggleIssuesOnly}><Icon name="triangle-alert" /></button>
          <button type="button" className={`iconbtn${closedOnly ? " on-alt" : ""}`} title="Only closed or temporarily closed stores" aria-pressed={closedOnly} onClick={toggleClosedOnly}><Icon name="door-closed" /></button>
        </span>}
        <span className="count">{countText}</span>
        {primary && <button type="button" className="btn round" onClick={primary[1]}><Icon name="plus" /><span>{primary[0]}</span></button>}
        {tab === "caps" && <button type="button" className="btn outline round" title="Add many stores from an Excel spreadsheet" onClick={() => {
          if (!ctx.capsReady) { toast("Run migrate-caps.sql first", "err"); return; }
          openCapsImport();
        }}><Icon name="upload" />Import spreadsheet</button>}
        {concerns && <button type="button" className="btn outline round" onClick={openMultiIssue}><Icon name="layers" />Multi-store issue</button>}
        {(tab === "issues" || tab === "calls") && <button type="button" className="btn outline round" title="Download an Excel report" onClick={() => openReport(reportKindForTab(tab, issueSub))}><Icon name="file-bar-chart" />Report</button>}
        <button type="button" className="btn ghost" onClick={() => loadAll()}><Icon name="refresh-cw" />Refresh</button>
      </div>}
      {showSearch && tab !== "staff" && <div className="hintbar">
        <span><kbd>#</kbd> store number only {"—"} e.g. #123</span>
        <span><kbd>@</kbd> franchisee name only {"—"} e.g. @Aggarwal</span>
        <span className="muted">{tab === "caps" ? "Or type anything: store #, franchisee, email, phone or notes" : "Or type anything: store #, name, phone, address, city, ZIP, territory or email"}</span>
      </div>}
    </>
  );
}
