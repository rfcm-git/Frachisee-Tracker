import { useMemo } from "react";
import MenuButton, { MenuItem } from "../ui/MenuButton.jsx";
import Icon from "../ui/Icon.jsx";
import { territorySet } from "../../domain/records.js";
import { reportKindForTab } from "../../reports/catalog.js";
import { loadAll } from "../../state/appActions.js";
import { getContext, useDataContext } from "../../state/dataStore.js";
import { openCallLog, openCapEmail, openCapForm, openCapsImport, openWalmartAdd, openWalmartEmail, openWalmartImport, openLogIssue, openMultiIssue, openAddOnboarding, openNewOnboarding, openOnboardingEmail, openReport, openStaffForm } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { openFind, setSearch, setTerrFilter, toggleClosedOnly, toggleIssuesOnly, useUiStore } from "../../state/uiStore.js";

const SEARCH_TABS = ["franchisees", "stores", "issues", "onboarding", "ezcater", "walmart", "staff", "caps", "calls"];

function searchPlaceholder(tab) {
  if (tab === "ezcater") return "Search ezCater: store #, franchisee, status or updates…";
  if (tab === "walmart") return "Search Walmart: store #, franchisee, stage or notes…";
  if (tab === "caps") return "Search store #, Assessment ID, franchisee…";
  if (tab === "calls") return "Search calls: franchisee, store #, reason or result…";
  if (tab === "staff") return "Search name, email, or #store";
  if (tab === "onboarding") return "Search onboarding: store #, platform, notes, city…";
  if (tab === "issues") return "Search issues, store #, phone, address, city, ZIP…";
  if (tab === "franchisees") return "Search franchisee name, territory, email, phone or notes…";
  return "Search store #, address, city, ZIP, phone or territory…";
}

/** "Log issue", "Add store" (onboarding), "Add FBC / OM" or "Log call", depending on the tab. */
function primaryAction(tab) {
  if (tab === "staff") return ["Add FBC / OM", () => openStaffForm(null)];
  if (tab === "calls") return ["Log call", () => {
    if (!getContext().callLogsReady) { toast("Run migrate-call-logs.sql first", "err"); return; }
    openCallLog(null);
  }];
  if (tab === "onboarding") return ["Add store", () => {
    if (!getContext().onboardingReady) { toast("Run migrate-onboarding.sql first", "err"); return; }
    openAddOnboarding();
  }];
  if (tab === "issues") return ["Log issue", () => openLogIssue(null)];
  if (tab === "ezcater") return ["Add store", () => {
    if (!getContext().onboardingReady) { toast("Run migrate-onboarding.sql first", "err"); return; }
    openNewOnboarding({ platforms: ["ez"] });
  }];
  if (tab === "walmart") return ["Add store", () => {
    if (!getContext().walmartReady) { toast("Run migrate-walmart.sql first", "err"); return; }
    openWalmartAdd();
  }];
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

/** CAP tab: one "Add stores" button that opens a menu — add one store, or import a spreadsheet. */
function CapsAddMenu({ ready }) {
  const guard = (open) => () => {
    if (!ready) { toast("Run migrate-caps.sql first", "err"); return; }
    open();
  };
  return <MenuButton trigger={<><Icon name="plus" /><span>Add stores</span><Icon name="chevron-down" className="car" /></>}>
    <MenuItem onSelect={guard(() => openCapForm())}><Icon name="plus" />
      <span className="mnu-txt"><b>Add a store</b><small>Pick one store and fill in its details</small></span></MenuItem>
    <MenuItem onSelect={guard(openCapsImport)}><Icon name="file-spreadsheet" />
      <span className="mnu-txt"><b>Import spreadsheet</b><small>Add or update many stores from Excel</small></span></MenuItem>
  </MenuButton>;
}

export default function Toolbar() {
  const ctx = useDataContext();
  const tab = useUiStore((state) => state.tab);
  const search = useUiStore((state) => state.search);
  const countText = useUiStore((state) => state.countText);
  const issuesOnly = useUiStore((state) => state.issuesOnly);
  const closedOnly = useUiStore((state) => state.closedOnly);

  const showSearch = SEARCH_TABS.includes(tab);
  /** "#…" or "@…" typed on Franchisees / All Stores, where those prefixes no longer apply. */
  const prefixTyped = /^[#@]/.test(search.trim());
  const primary = primaryAction(tab);

  return (
    <>
      {tab !== "dashboard" && tab !== "reports" && tab !== "search" && <div className="toolbar">
        {showSearch && <div className="search-wrap">
          <span className="lead"><Icon name="search" /></span>
          <input type="search" aria-label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder(tab)} />
        </div>}
        {(tab === "franchisees" || tab === "stores") && <TerritoryFilter />}
        {tab === "stores" && <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <button type="button" className={`iconbtn${issuesOnly ? " on" : ""}`} title="Only stores with an issue" aria-pressed={issuesOnly} onClick={toggleIssuesOnly}><Icon name="triangle-alert" /></button>
          <button type="button" className={`iconbtn${closedOnly ? " on-alt" : ""}`} title="Only closed or temporarily closed stores" aria-pressed={closedOnly} onClick={toggleClosedOnly}><Icon name="door-closed" /></button>
        </span>}
        <span className="count">{countText}</span>
        {primary && <button type="button" className="btn round" onClick={primary[1]}><Icon name={primary[2] || "plus"} /><span>{primary[0]}</span></button>}
        {tab === "caps" && <CapsAddMenu ready={ctx.capsReady} />}
        {tab === "ezcater" && <button type="button" className="btn outline round" title="Edit the subject, message and CC used by the email button on each ezCater store" onClick={() => {
          if (!ctx.onboardingReady) { toast("Run migrate-onboarding.sql first", "err"); return; }
          openOnboardingEmail(null, "ez");
        }}><Icon name="mail" />Email message</button>}
        {tab === "walmart" && <button type="button" className="btn outline round" title="Import Walmart's report — only Marwaha rows are read" onClick={() => {
          if (!ctx.walmartReady) { toast("Run migrate-walmart.sql first", "err"); return; }
          openWalmartImport();
        }}><Icon name="upload" />Import Walmart report</button>}
        {tab === "walmart" && <button type="button" className="btn outline round" title="Edit the Awaiting App and Payment Setup emails sent by the email button on each store" onClick={() => {
          if (!ctx.walmartReady) { toast("Run migrate-walmart.sql first", "err"); return; }
          openWalmartEmail();
        }}><Icon name="mail" />Email message</button>}
        {tab === "caps" && <button type="button" className="btn outline round" title="Edit the subject, message and CC used by the email button on each store" onClick={() => {
          if (!ctx.capsReady) { toast("Run migrate-caps.sql first", "err"); return; }
          openCapEmail();
        }}><Icon name="mail" />Email message</button>}
        {tab === "onboarding" && <button type="button" className="btn outline round" title="Edit the subject, message and CC used by the email button on each onboarding row" onClick={() => {
          if (!ctx.onboardingReady) { toast("Run migrate-onboarding.sql first", "err"); return; }
          openOnboardingEmail();
        }}><Icon name="mail" />Email message</button>}
        {tab === "issues" && <button type="button" className="btn outline round" onClick={openMultiIssue}><Icon name="layers" />Multi-store issue</button>}
        {(tab === "issues" || tab === "onboarding" || tab === "calls" || tab === "caps") && <button type="button" className="btn outline round" title="Download an Excel report" onClick={() => openReport(reportKindForTab(tab))}><Icon name="file-bar-chart" />Report</button>}
        <button type="button" className="btn ghost tb-refresh" aria-label="Refresh" data-tip="Reload the latest data" onClick={() => loadAll()}><Icon name="refresh-cw" /><span className="tb-lbl">Refresh</span></button>
      </div>}
      {(tab === "franchisees" || tab === "stores") && <div className={`hintbar hintbar-scope${prefixTyped ? " moved" : ""}`}>
        <span><Icon name={prefixTyped ? "triangle-alert" : "info"} />{prefixTyped ? <>“{search.trim()[0]}” searches moved to the Search tab — here the box searches {tab === "franchisees" ? "franchisee" : "store"} details as plain text.</>
          : tab === "franchisees" ? "Searches franchisee details only — name, territory, email, phone and notes." : "Searches store details only — store #, address, city, ZIP, phone and territory."}</span>
        <button type="button" className="btn link" onClick={() => openFind(search.trim() || undefined)}>
          <Icon name="search" />Search everything{search.trim() ? ` for “${search.trim()}”` : ""} in the Search tab<kbd>/</kbd></button>
      </div>}
      {showSearch && !["staff", "franchisees", "stores"].includes(tab) && <div className="hintbar">
        <span><kbd>#</kbd> store number</span>
        <span><kbd>@</kbd> franchisee name</span>
        <button type="button" className="btn link" onClick={() => openFind()}>All search options and tips in the Search tab</button>
      </div>}
    </>
  );
}
