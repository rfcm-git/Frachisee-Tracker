import { useMemo, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import FilterDropdown, { FilterOption } from "../../components/ui/FilterMenu.jsx";
import { EmptyState, InfoTip, StoreStatusIfClosed, WmStageBadge } from "../../components/ui/common.jsx";
import { usePaged } from "../../hooks/usePaged.js";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { WM_NEXT_STEP, WM_STAGES, WM_STAGE_COLOR, WM_STAGE_INFO } from "../../config/constants.js";
import { emailOf, platformStatus, storeStatus } from "../../domain/records.js";
import { searchQuery } from "../../domain/search.js";
import { wmPlatformStatus, wmStageClass } from "../../domain/walmart.js";
import { wmCanEmail } from "../../domain/walmartEmail.js";
import { formatNumber, formatTimestamp, timeOf } from "../../lib/format.js";
import { useDataContext } from "../../state/dataStore.js";
import { openStore, openWalmartAdd, openWalmartImport, openWalmartUpdate } from "../../state/dialogs.js";
import {
  clearWmFilters, setWmEmailFilter, setWmSort, setWmView, toggleWmFranchisee, toggleWmOnlyStage, toggleWmStage, useUiStore,
} from "../../state/uiStore.js";
import StagePicker from "./StagePicker.jsx";
import { askDeleteWalmart } from "./walmartActions.js";
import { sendWalmartEmail } from "./walmartEmailActions.js";
import { filterWalmart, lastWalmartImport, walmartFollowUp, walmartFranchisees, walmartOwnerGroups, walmartProgress } from "./walmartSelectors.js";

const SORT_LABELS = { stage: "Stage · Payment Setup first", num: "Store # · low to high", updated: "Last updated · newest first" };
const EMAIL_LABELS = { none: "Not emailed yet", sent: "Emailed" };
/** The main path, in order; Exempted is shown apart. */
const PATH = ["Awaiting App", "Payment Setup", "Account Created"];

const shortDay = (ts) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
const shortTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
/** "Today, 3:39 PM" or "Nov 9". */
const whenText = (ts) => (shortDay(ts) === shortDay(Date.now()) ? `Today, ${shortTime(ts)}` : shortDay(ts));

/** One stage of the pipeline: count, share, what it means. Click to show only that stage. */
function StageCard({ stage, step, summary, stages }) {
  const count = summary.counts[stage];
  const share = summary.share(count);
  const on = stages.length === 1 && stages[0] === stage;
  return <button type="button" className={`wm-card ${wmStageClass(stage)}${on ? " on" : ""}${count ? "" : " zero"}`} aria-pressed={on}
    data-tip={`${WM_NEXT_STEP[stage]}${on ? " — click again to show all" : " — click to show only these"}`} onClick={() => toggleWmOnlyStage(stage)}>
    <span className="wm-card-h">{step ? <span className="wm-step">{step}</span> : <Icon name="circle-off" />}<span>{stage}</span></span>
    <span className="wm-card-n"><b>{formatNumber(count)}</b><span>{share}%</span></span>
    <span className="wm-card-bar"><i style={{ width: `${share}%` }} /></span>
    <span className="wm-card-d">{WM_STAGE_INFO[stage]}</span>
  </button>;
}

/** The pipeline: overall progress, then each stage in order, with Exempted apart. All records, not affected by filters. */
function Pipeline({ ctx, summary, stages }) {
  const imported = lastWalmartImport(ctx);
  const all = !stages.length;
  return <section className="wm-pipe" aria-label="Walmart Marketplace progress">
    <button type="button" className={`wm-total${all ? " on" : ""}`} aria-pressed={all} data-tip="All stores on the Walmart tab — click to show all" onClick={() => toggleWmStage("")}>
      <span className="wm-total-h">Walmart Marketplace</span>
      <span className="wm-total-n"><b>{summary.percent}%</b><span>onboarded</span></span>
      <span className="wm-total-bar" aria-hidden="true">{PATH.concat("Exempted").filter((stage) => summary.counts[stage]).map((stage) => <i key={stage}
        style={{ width: `${(summary.counts[stage] / summary.total) * 100}%`, background: WM_STAGE_COLOR[stage] }} />)}</span>
      <span className="wm-total-d">{formatNumber(summary.done)} of {formatNumber(summary.total)} stores · {imported ? `imported ${whenText(imported)}` : "never imported"}</span>
    </button>
    <div className="wm-path" role="group" aria-label="Stages">
      {PATH.map((stage, index) => <div className="wm-path-item" key={stage}>
        {index > 0 && <Icon name="chevron-right" className="wm-arrow" />}
        <StageCard stage={stage} step={index + 1} summary={summary} stages={stages} />
      </div>)}
    </div>
    <StageCard stage="Exempted" summary={summary} stages={stages} />
  </section>;
}

/** What needs doing: stores waiting on the owner and how many were never emailed, with a one-click filter. */
function FollowUpBar({ followUp, email }) {
  if (!followUp.open) {
    return <div className="wm-follow done" role="status"><Icon name="circle-check" /><span><b>Nothing to follow up.</b> Every store is onboarded or exempted.</span></div>;
  }
  const showing = email === "none";
  return <div className="wm-follow" role="status">
    <Icon name="alarm-clock" />
    <span><b>{formatNumber(followUp.open)} store{followUp.open !== 1 ? "s" : ""} need follow-up</b>
      {followUp.notEmailed ? <> · {formatNumber(followUp.notEmailed)} not emailed yet</> : <> · all emailed</>}</span>
    {followUp.notEmailed > 0 && <button type="button" className={`btn sm round ${showing ? "" : "outline"}`} aria-pressed={showing}
      onClick={() => setWmEmailFilter(showing ? "" : "none")}><Icon name={showing ? "x" : "send"} />{showing ? "Show all stores" : "Show stores not emailed"}</button>}
  </div>;
}

/** Franchisees with stores on the Walmart tab, with a search box. Pick one or more. */
function FranchiseeFilter({ values }) {
  const ctx = useDataContext();
  const [query, setQuery] = useState("");
  const all = useMemo(() => walmartFranchisees(ctx), [ctx]);
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((item) => item.name.toLowerCase().includes(q)) : all;
  const names = values.map((id) => all.find((item) => item.id === id)?.name || ctx.frById.get(id)?.name || `#${id}`);
  return <FilterDropdown icon="users" label="Franchisee" value={names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0] || ""} active={values.length > 0}>
    <div className="fdd-search"><Icon name="search" /><input type="search" value={query} placeholder="Search franchisees…" aria-label="Search franchisees"
      autoFocus onChange={(event) => setQuery(event.target.value)} /></div>
    <FilterOption selected={!values.length} onClick={() => toggleWmFranchisee("")}>All franchisees</FilterOption><div className="fdd-div" />
    <div className="fdd-scroll">
      {shown.map((item) => <FilterOption key={item.id} selected={values.includes(item.id)} checkable onClick={() => toggleWmFranchisee(item.id)}>
        <span className="fdd-name">{item.name}</span><span className="fdd-cnt">{item.count}</span></FilterOption>)}
      {!shown.length && <div className="fdd-note">No franchisee matches “{query}”</div>}
    </div>
    <div className="fdd-note">Only franchisees with stores on the Walmart tab · pick one or more</div>
  </FilterDropdown>;
}

/** Stores or franchisees view. */
function ViewSwitch({ view, owners }) {
  return <div className="cl-count-mode cl-view wm-view" role="group" aria-label="Walmart view">
    <button type="button" aria-pressed={view === "stores"} onClick={() => setWmView("stores")}><Icon name="store" />Stores</button>
    <button type="button" aria-pressed={view === "owners"} onClick={() => setWmView("owners")} data-tip="Franchisees with more than one store on the Walmart tab">
      <Icon name="users" />Franchisees 2+ <em>{owners}</em></button>
  </div>;
}

function WalmartFilters({ filter, anyFilter, view, owners }) {
  return <div className="ifbar wm-bar"><div className="grp fdd-grp">
    <FilterDropdown icon="filter" label="Stage" value={filter.stages.join(", ")} active={filter.stages.length > 0}>
      <FilterOption selected={!filter.stages.length} onClick={() => toggleWmStage("")}>All stages</FilterOption>
      <div className="fdd-div" />
      {WM_STAGES.map((stage) => <FilterOption key={stage} selected={filter.stages.includes(stage)} checkable onClick={() => toggleWmStage(stage)}>
        <span className="d" style={{ background: WM_STAGE_COLOR[stage] }} />{stage}</FilterOption>)}
      <div className="fdd-note">Pick one or more</div>
    </FilterDropdown>
    <FranchiseeFilter values={filter.franchisees} />
    <FilterDropdown icon="mail" label="Email" value={EMAIL_LABELS[filter.email] || ""} active={!!filter.email}>
      {({ close }) => <>
        <FilterOption selected={!filter.email} onClick={() => { setWmEmailFilter(""); close(); }}>All stores</FilterOption>
        <div className="fdd-div" />
        {Object.entries(EMAIL_LABELS).map(([key, label]) => <FilterOption key={key} selected={filter.email === key} onClick={() => { setWmEmailFilter(key); close(); }}>{label}</FilterOption>)}
        <div className="fdd-note">Only stores at Awaiting App or Payment Setup are emailed</div>
      </>}
    </FilterDropdown>
    <FilterDropdown icon="arrow-down-up" label="Sort" value={SORT_LABELS[filter.sort]}>
      {({ close }) => Object.entries(SORT_LABELS).map(([key, label]) => <FilterOption key={key} selected={filter.sort === key}
        onClick={() => { setWmSort(key); close(); }}>{label}</FilterOption>)}
    </FilterDropdown>
    <InfoTip text="Filters work together with the search box. Search by store # (#123), franchisee (@name), stage or notes." />
    {anyFilter && <button type="button" className="btn link" onClick={clearWmFilters}><Icon name="x" />Clear filters</button>}
  </div>
    <ViewSwitch view={view} owners={owners} />
  </div>;
}

/** Email state and button: only Awaiting App and Payment Setup are emailed. */
function EmailCell({ record, stage, email }) {
  if (!wmCanEmail(record)) return <span className="wm-mail-na" data-tip={`${stage} — no email needed`}>—</span>;
  const sent = !!record.last_email_at;
  return <div className="wm-mail">
    <button type="button" className={`wm-mail-btn${sent ? " again" : ""}`} disabled={!email}
      data-tip={!email ? "The franchisee has no email address — add one on the franchisee" : sent ? `Email ${email} again` : `Open the ${stage} email to ${email} in Outlook`}
      aria-label={`${sent ? "Email again" : "Email"} store ${record.store_num}`} onClick={() => sendWalmartEmail(record.id)}>
      <Icon name={sent ? "rotate-ccw" : "send"} />{sent ? "Again" : "Email"}</button>
    <span className={`wm-mail-st${sent ? " sent" : ""}`} data-tip={sent ? `Emailed ${formatTimestamp(record.last_email_at)}` : undefined}>
      {!email ? "No email on file" : sent ? <><Icon name="check" />{whenText(record.last_email_at)}</> : "Not emailed"}</span>
  </div>;
}

function WalmartTable({ ctx, rows }) {
  const { items, pagerProps } = usePaged("wm", rows);
  return <div className="card wm-tablecard"><table className="is-table wm-list"><thead><tr>
    <th className="c-snum">Store #</th><th>Franchisee</th><th>Stage</th><th>Email</th><th className="hide-sm">Updated</th><th className="c-act"><span className="sr-only">Actions</span></th>
  </tr></thead><tbody>
    {items.map(({ record, store, franchisee, franchiseeId, stage }) => {
      const expected = wmPlatformStatus(stage);
      const actual = store ? platformStatus(store, "wm") : expected;
      const updated = record.updated_at || record.created_at;
      return <tr key={record.id} className={`wm-row ${wmStageClass(stage)}`}>
        <td className="c-snum">{store
          ? <button type="button" className="ob-snum" data-tip="Open store information" onClick={() => openStore(store.id)}>{record.store_num}</button>
          : <span className="cap-nostore" data-tip="Not in the store list">{record.store_num}</span>}
          {store && storeStatus(store) !== "Open" && <div style={{ marginTop: 3 }}><StoreStatusIfClosed status={storeStatus(store)} /></div>}</td>
        <td className="wm-fr">{franchisee || <span className="muted">—</span>}
          {record.notes ? <span className="wm-note" data-tip={record.notes}><Icon name="sticky-note" />{record.notes}</span> : null}</td>
        <td className="wm-stagetd"><div className="wm-stagecell"><StagePicker record={record} stage={stage} />
          {actual !== expected && <span className="wm-mismatch" role="img" aria-label={`Store's Walmart status is ${actual}`}
            data-tip={`The store's Walmart status is ${actual}; ${stage} means ${expected}. Changing the stage or the next import sets it to match.`}><Icon name="triangle-alert" /></span>}</div></td>
        <td className="wm-mailtd"><EmailCell record={record} stage={stage} email={franchiseeId != null ? emailOf(ctx.frById.get(franchiseeId)) : ""} /></td>
        <td className="hide-sm wm-upd" data-tip={formatTimestamp(updated)}>{whenText(updated)}</td>
        <td className="c-act"><div className="row-acts">
          <button type="button" className="iconbtn mini" data-tip="Add a note, see the change log" aria-label={`Open store ${record.store_num}`} onClick={() => openWalmartUpdate(record.id)}><Icon name="pencil" /></button>
          <button type="button" className="iconbtn mini del" data-tip="Remove from the Walmart tab" aria-label={`Remove store ${record.store_num}`} onClick={() => askDeleteWalmart(record.id)}><Icon name="trash-2" /></button>
        </div></td>
      </tr>;
    })}
  </tbody></table>
    <Pagination {...pagerProps} />
  </div>;
}

/** Franchisees with more than one store: their store count, stages, and each store with its stage. */
function OwnersTable({ groups }) {
  const { items, pagerProps } = usePaged("wm", groups);
  return <div className="card wm-tablecard"><table className="is-table wm-owners"><thead><tr>
    <th>Franchisee</th><th className="wm-oc">Stores</th><th>Stage of each store</th>
  </tr></thead><tbody>
    {items.map((group) => <tr key={group.id}>
      <td><b>{group.name}</b></td>
      <td className="wm-oc"><b>{group.rows.length}</b></td>
      <td>{WM_STAGES.filter((stage) => group.counts[stage]).map((stage) => <div className={`wm-ogroup ${wmStageClass(stage)}`} key={stage}>
        <span className="wm-ogroup-h"><WmStageBadge stage={stage} /><span>{group.counts[stage]}</span></span>
        <div className="wm-ostores">{group.rows.filter((row) => row.stage === stage).map(({ record }) => <button type="button" key={record.id} className={`wm-ostore ${wmStageClass(stage)}`}
          data-tip={`Store ${record.store_num} · ${stage} — click to open`} aria-label={`Store ${record.store_num}, ${stage}`} onClick={() => openWalmartUpdate(record.id)}>
          {record.store_num}</button>)}</div>
      </div>)}</td>
    </tr>)}
  </tbody></table>
    <Pagination {...pagerProps} />
  </div>;
}

export default function WalmartView() {
  const ctx = useDataContext();
  const filter = useUiStore((state) => state.wmFilter);
  const view = useUiStore((state) => state.wmView);
  const search = useUiStore((state) => state.search);
  const rows = useMemo(() => filterWalmart(ctx, filter, searchQuery(search)), [ctx, filter, search]);
  const summary = useMemo(() => walmartProgress(ctx), [ctx]);
  const followUp = useMemo(() => walmartFollowUp(ctx), [ctx]);
  const groups = useMemo(() => walmartOwnerGroups(ctx, rows), [ctx, rows]);
  useToolbarCount(ctx.walmartReady && ctx.walmart.length ? `${formatNumber(rows.length)} of ${formatNumber(ctx.walmart.length)} stores` : "");

  if (!ctx.walmartReady) return <EmptyState icon="database" title="The Walmart tab needs a quick database update">Run migrate-walmart.sql in the Supabase SQL Editor, then click Refresh. Other tabs are not affected.</EmptyState>;
  if (!ctx.walmart.length) {
    return <EmptyState icon="shopping-cart" title="No stores on the Walmart tab yet"
      actions={<><button type="button" className="btn round" onClick={openWalmartImport}><Icon name="upload" />Import Walmart report</button>
        <button type="button" className="btn outline round" onClick={() => openWalmartAdd()}><Icon name="plus" />Add store</button></>}>
      Import Walmart's report to start, or add stores one at a time. Only Marwaha rows are read, and each store's Walmart status follows its stage.</EmptyState>;
  }
  const anyFilter = !!(filter.stages.length || filter.franchisees.length || filter.email || search.trim());
  const lastChange = ctx.walmart.reduce((latest, record) => Math.max(latest, timeOf(record.updated_at || record.created_at)), 0);
  return <>
    <Pipeline ctx={ctx} summary={summary} stages={filter.stages} />
    <FollowUpBar followUp={followUp} email={filter.email} />
    <WalmartFilters filter={filter} anyFilter={anyFilter} view={view} owners={groups.length} />
    {view === "owners"
      ? (groups.length ? <OwnersTable groups={groups} /> : <EmptyState icon="users" title="No franchisee has more than one store here">{anyFilter ? "Try a different search or filter." : "Franchisees with two or more stores on the Walmart tab show up here."}</EmptyState>)
      : rows.length ? <WalmartTable ctx={ctx} rows={rows} />
        : <EmptyState icon="search-x" title="No stores match" actions={anyFilter ? <button type="button" className="btn outline round" onClick={clearWmFilters}><Icon name="x" />Clear filters</button> : null}>Try a different search or filter.</EmptyState>}
    {lastChange > 0 && <p className="wm-foot muted">List last changed {formatTimestamp(lastChange)}</p>}
  </>;
}
