import { useMemo, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import FilterDropdown, { FilterOption } from "../../components/ui/FilterMenu.jsx";
import { EmptyState, InfoTip, StoreStatusIfClosed, WmStageBadge } from "../../components/ui/common.jsx";
import { usePaged } from "../../hooks/usePaged.js";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { WM_NEXT_STEP, WM_STAGES, WM_STAGE_COLOR } from "../../config/constants.js";
import { platformStatus, storeStatus } from "../../domain/records.js";
import { searchQuery } from "../../domain/search.js";
import { wmPlatformStatus, wmStageClass } from "../../domain/walmart.js";
import { formatNumber, formatTimestamp, timeOf } from "../../lib/format.js";
import { useDataContext } from "../../state/dataStore.js";
import { openStore, openWalmartAdd, openWalmartImport, openWalmartUpdate } from "../../state/dialogs.js";
import { clearWmFilters, setWmSort, setWmView, toggleWmFranchisee, toggleWmOnlyStage, toggleWmStage, useUiStore } from "../../state/uiStore.js";
import { askDeleteWalmart, updateWalmart } from "./walmartActions.js";
import { sendWalmartEmail } from "./walmartEmailActions.js";
import { wmCanEmail } from "../../domain/walmartEmail.js";
import { emailOf } from "../../domain/records.js";
import { filterWalmart, lastWalmartImport, walmartFranchisees, walmartOwnerGroups, walmartProgress } from "./walmartSelectors.js";

const SORT_LABELS = { stage: "Stage · Payment Setup first", num: "Store # · low to high", updated: "Last updated · newest first" };

/** Counts per stage (click to show only that stage) and the share at Account Created. All records, not affected by filters. */
function WalmartProgress({ summary, stages }) {
  return <div className="cap-prog" role="group" aria-label="Walmart progress">
    <button type="button" className={`cap-cnt total${!stages.length ? " on" : ""}`} data-tip="All stores on the Walmart tab — click to show all" onClick={() => toggleWmStage("")}>
      <b>{formatNumber(summary.total)}</b>Total stores</button>
    {WM_STAGES.map((stage) => {
      const on = stages.length === 1 && stages[0] === stage;
      const count = summary.counts[stage];
      return <button type="button" key={stage} className={`cap-cnt${on ? " on" : ""}${count ? "" : " zero"}`} aria-pressed={on}
        data-tip={`${stage}: ${count} (${summary.share(count)}%)${on ? " — click again to show all" : " — click to show only these"}`} onClick={() => toggleWmOnlyStage(stage)}>
        <span className="d" style={{ background: WM_STAGE_COLOR[stage] }} /><b>{formatNumber(count)}</b>{stage}<span className="wm-pct">{summary.share(count)}%</span></button>;
    })}
    <div className="cap-bar-wrap" data-tip={`${summary.done} of ${summary.total} stores have their Walmart account created`}>
      <div className="cap-bar">{summary.total ? WM_STAGES.filter((stage) => summary.counts[stage]).map((stage) => <span key={stage}
        style={{ width: `${(summary.counts[stage] / summary.total) * 100}%`, background: WM_STAGE_COLOR[stage] }} />) : null}</div>
      <b>{summary.percent}%</b><span className="muted">account created</span>
    </div>
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

function WalmartFilters({ filter, anyFilter }) {
  return <div className="ifbar"><div className="grp fdd-grp">
    <FilterDropdown icon="filter" label="Stage" value={filter.stages.join(", ")} active={filter.stages.length > 0}>
      <FilterOption selected={!filter.stages.length} onClick={() => toggleWmStage("")}><span className="d" style={{ background: "var(--line)" }} />All stages</FilterOption>
      <div className="fdd-div" />
      {WM_STAGES.map((stage) => <FilterOption key={stage} selected={filter.stages.includes(stage)} checkable onClick={() => toggleWmStage(stage)}>
        <span className="d" style={{ background: WM_STAGE_COLOR[stage] }} />{stage}</FilterOption>)}
      <div className="fdd-note">Pick one or more</div>
    </FilterDropdown>
    <FranchiseeFilter values={filter.franchisees} />
    <FilterDropdown icon="arrow-down-up" label="Sort" value={SORT_LABELS[filter.sort]}>
      {({ close }) => Object.entries(SORT_LABELS).map(([key, label]) => <FilterOption key={key} selected={filter.sort === key}
        onClick={() => { setWmSort(key); close(); }}>{label}</FilterOption>)}
    </FilterDropdown>
  </div>
    <InfoTip text="Filters work together with the search box. Search by store # (#123), franchisee (@name), stage or notes." />
    {anyFilter && <button type="button" className="btn link" onClick={clearWmFilters} style={{ marginLeft: "auto" }}><Icon name="x" />Clear filters</button>}
  </div>;
}

/** When the list was last imported and last changed. */
function WalmartMeta({ ctx }) {
  const imported = lastWalmartImport(ctx);
  const lastChange = ctx.walmart.reduce((latest, record) => Math.max(latest, timeOf(record.updated_at || record.created_at)), 0);
  return <div className="cap-meta">
    <span><Icon name="upload" />Last import: <b>{imported ? formatTimestamp(imported) : "never"}</b></span>
    {lastChange > 0 && <span data-tip="Last time any store on the Walmart tab was added or changed"><Icon name="history" />List last updated: <b>{formatTimestamp(lastChange)}</b></span>}
  </div>;
}

/** Stage picker inside the table row; saves right away, logs the change and sets the store's Walmart status. */
function StageSelect({ record, stage }) {
  const [saving, setSaving] = useState(false);
  return <select className={`cap-sel wm-sel ${wmStageClass(stage)}`} value={stage} disabled={saving} aria-label={`Stage of store ${record.store_num}`}
    onChange={async (event) => {
      setSaving(true);
      await updateWalmart(record, { stage: event.target.value });
      setSaving(false);
    }}>
    {WM_STAGES.map((value) => <option key={value} value={value}>{value}</option>)}
  </select>;
}

/** Opens the stage's email in Outlook. Only Awaiting App and Payment Setup; dimmed once the store was emailed (it asks first). */
function EmailButton({ record, stage, email }) {
  const sent = !!record.last_email_at;
  const tip = !email ? "The franchisee has no email address — add one on the franchisee"
    : sent ? `Emailed ${formatTimestamp(record.last_email_at)} — click to email again` : `Open the ${stage} email to ${email} in Outlook`;
  return <button type="button" className={`iconbtn mini cap-mailbtn${!email ? " off" : sent ? " done" : " fresh"}`} aria-disabled={!email} data-tip={tip}
    aria-label={`Email store ${record.store_num}`} onClick={() => sendWalmartEmail(record.id)}><Icon name={sent ? "mail-check" : "send"} /></button>;
}

/** Stores or franchisees view. */
function ViewSwitch({ view, owners }) {
  return <div className="cl-count-mode cl-view wm-view" role="group" aria-label="Walmart view">
    <button type="button" aria-pressed={view === "stores"} onClick={() => setWmView("stores")}><Icon name="store" />Stores</button>
    <button type="button" aria-pressed={view === "owners"} onClick={() => setWmView("owners")} data-tip="Franchisees with more than one store on the Walmart tab">
      <Icon name="users" />Franchisees with 2+ stores <em>{owners}</em></button>
  </div>;
}

/** Franchisees with more than one store: their store count, stages, and each store with its stage. */
function OwnersTable({ groups }) {
  const { items, pagerProps } = usePaged("wm", groups);
  return <div className="card" style={{ overflowX: "auto" }}><table className="is-table wm-owners"><thead><tr>
    <th>Franchisee</th><th className="wm-oc">Stores</th><th>Stage of each store</th>
  </tr></thead><tbody>
    {items.map((group) => <tr key={group.id}>
      <td><b>{group.name}</b><div className="wm-ocounts">{WM_STAGES.filter((stage) => group.counts[stage]).map((stage) => <span key={stage}>
        <span className="d" style={{ background: WM_STAGE_COLOR[stage] }} />{group.counts[stage]} {stage}</span>)}</div></td>
      <td className="wm-oc"><b>{group.rows.length}</b></td>
      <td><div className="wm-ostores">{group.rows.map(({ record, stage }) => <button type="button" key={record.id} className="wm-ostore"
        data-tip={`Store ${record.store_num} · ${stage} — click to update`} onClick={() => openWalmartUpdate(record.id)}>
        <b>{record.store_num}</b><WmStageBadge stage={stage} /></button>)}</div></td>
    </tr>)}
  </tbody></table>
    <Pagination {...pagerProps} />
  </div>;
}

const shortDay = (ts) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });

function WalmartTable({ ctx, rows }) {
  const { items, pagerProps } = usePaged("wm", rows);
  return <div className="card" style={{ overflowX: "auto" }}><table className="is-table wm-list"><thead><tr>
    <th className="c-snum">Store #</th><th>Franchisee</th><th>Stage</th><th className="hide-sm">Next step · latest note</th><th className="hide-sm">Last updated</th><th className="c-act">Actions</th>
  </tr></thead><tbody>
    {items.map(({ record, store, franchisee, franchiseeId, stage }) => {
      const expected = wmPlatformStatus(stage);
      const ownerEmail = franchiseeId != null ? emailOf(ctx.frById.get(franchiseeId)) : "";
      const actual = store ? platformStatus(store, "wm") : expected;
      return <tr key={record.id}>
        <td className="c-snum">{store
          ? <button type="button" className="ob-snum" data-tip="Open store information" onClick={() => openStore(store.id)}>{record.store_num}</button>
          : <span className="cap-nostore" data-tip="Not in the store list">{record.store_num}</span>}
          {store && storeStatus(store) !== "Open" && <div style={{ marginTop: 3 }}><StoreStatusIfClosed status={storeStatus(store)} /></div>}</td>
        <td>{franchisee || <span className="muted">—</span>}</td>
        <td><div className="wm-stagecell"><StageSelect key={`${record.id}-${record.updated_at}`} record={record} stage={stage} />
          {actual !== expected && <span className="wm-mismatch" data-tip={`The store's Walmart status is ${actual}; this stage means ${expected}. Changing the stage or the next import sets it to match.`}>
            <Icon name="triangle-alert" /></span>}
          {wmCanEmail(record) && <EmailButton record={record} stage={stage} email={ownerEmail} />}</div>
          {record.last_email_at && <div className="wm-emailed" data-tip={formatTimestamp(record.last_email_at)}><Icon name="mail-check" />Emailed {shortDay(record.last_email_at)}</div>}</td>
        <td className="hide-sm wm-next">{WM_NEXT_STEP[stage]}{record.notes ? <span className="wm-note" data-tip={record.notes}>{record.notes}</span> : null}</td>
        <td className="hide-sm muted">{formatTimestamp(record.updated_at || record.created_at)}</td>
        <td className="c-act"><div className="row-acts">
          <button type="button" className="iconbtn mini" data-tip="Update stage, add a note, see the change log" aria-label={`Update store ${record.store_num}`} onClick={() => openWalmartUpdate(record.id)}><Icon name="pencil" /></button>
          <button type="button" className="iconbtn mini del" data-tip="Remove from the Walmart tab" aria-label={`Remove store ${record.store_num}`} onClick={() => askDeleteWalmart(record.id)}><Icon name="trash-2" /></button>
        </div></td>
      </tr>;
    })}
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
  const groups = useMemo(() => walmartOwnerGroups(ctx, rows), [ctx, rows]);
  useToolbarCount(ctx.walmartReady && ctx.walmart.length ? `${formatNumber(rows.length)} store${rows.length !== 1 ? "s" : ""} · ${formatNumber(summary.open)} still to onboard` : "");

  if (!ctx.walmartReady) return <EmptyState icon="database" title="The Walmart tab needs a quick database update">Run migrate-walmart.sql in the Supabase SQL Editor, then click Refresh. Other tabs are not affected.</EmptyState>;
  if (!ctx.walmart.length) {
    return <EmptyState icon="shopping-cart" title="No stores on the Walmart tab yet"
      actions={<><button type="button" className="btn round" onClick={openWalmartImport}><Icon name="upload" />Import Walmart report</button>
        <button type="button" className="btn outline round" onClick={() => openWalmartAdd()}><Icon name="plus" />Add store</button></>}>
      Import Walmart's report to start, or add stores one at a time. Only Marwaha rows are read, and each store's Walmart status follows its stage.</EmptyState>;
  }
  const anyFilter = !!(filter.stages.length || filter.franchisees.length || search.trim());
  return <>
    <WalmartProgress summary={summary} stages={filter.stages} />
    <WalmartMeta ctx={ctx} />
    <WalmartFilters filter={filter} anyFilter={anyFilter} />
    <ViewSwitch view={view} owners={groups.length} />
    {view === "owners"
      ? (groups.length ? <OwnersTable groups={groups} /> : <EmptyState icon="users" title="No franchisee has more than one store here">{anyFilter ? "Try a different search or filter." : "Franchisees with two or more stores on the Walmart tab show up here."}</EmptyState>)
      : rows.length ? <WalmartTable ctx={ctx} rows={rows} /> : <EmptyState icon="search-x" title="No stores match">Try a different search or filter.</EmptyState>}
  </>;
}
