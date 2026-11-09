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
import { wmPlatformStatus } from "../../domain/walmart.js";
import { formatNumber, formatTimestamp, timeOf } from "../../lib/format.js";
import { useDataContext } from "../../state/dataStore.js";
import { openStore, openWalmartImport } from "../../state/dialogs.js";
import { clearWmFilters, setWmSort, toggleWmFranchisee, toggleWmOnlyStage, toggleWmStage, useUiStore } from "../../state/uiStore.js";
import { filterWalmart, lastWalmartImport, walmartFranchisees, walmartProgress } from "./walmartSelectors.js";

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

function WalmartTable({ rows }) {
  const { items, pagerProps } = usePaged("wm", rows);
  return <div className="card" style={{ overflowX: "auto" }}><table className="is-table wm-list"><thead><tr>
    <th className="c-snum">Store #</th><th>Franchisee</th><th>Stage</th><th className="hide-sm">Next step</th><th className="hide-sm">Last updated</th>
  </tr></thead><tbody>
    {items.map(({ record, store, franchisee, stage }) => {
      const expected = wmPlatformStatus(stage);
      const actual = store ? platformStatus(store, "wm") : expected;
      return <tr key={record.id}>
        <td className="c-snum">{store
          ? <button type="button" className="ob-snum" data-tip="Open store information" onClick={() => openStore(store.id)}>{record.store_num}</button>
          : <span className="cap-nostore" data-tip="Not in the store list">{record.store_num}</span>}
          {store && storeStatus(store) !== "Open" && <div style={{ marginTop: 3 }}><StoreStatusIfClosed status={storeStatus(store)} /></div>}</td>
        <td>{franchisee || <span className="muted">—</span>}</td>
        <td><div className="wm-stagecell"><WmStageBadge stage={stage} />
          {actual !== expected && <span className="wm-mismatch" data-tip={`The store's Walmart status is ${actual}; this stage means ${expected}. The next import sets it to match.`}>
            <Icon name="triangle-alert" /></span>}</div></td>
        <td className="hide-sm wm-next">{WM_NEXT_STEP[stage]}</td>
        <td className="hide-sm muted">{formatTimestamp(record.updated_at || record.created_at)}</td>
      </tr>;
    })}
  </tbody></table>
    <Pagination {...pagerProps} />
  </div>;
}

export default function WalmartView() {
  const ctx = useDataContext();
  const filter = useUiStore((state) => state.wmFilter);
  const search = useUiStore((state) => state.search);
  const rows = useMemo(() => filterWalmart(ctx, filter, searchQuery(search)), [ctx, filter, search]);
  const summary = useMemo(() => walmartProgress(ctx), [ctx]);
  useToolbarCount(ctx.walmartReady && ctx.walmart.length ? `${formatNumber(rows.length)} store${rows.length !== 1 ? "s" : ""} · ${formatNumber(summary.open)} still to onboard` : "");

  if (!ctx.walmartReady) return <EmptyState icon="database" title="The Walmart tab needs a quick database update">Run migrate-walmart.sql in the Supabase SQL Editor, then click Refresh. Other tabs are not affected.</EmptyState>;
  if (!ctx.walmart.length) {
    return <EmptyState icon="shopping-cart" title="No stores on the Walmart tab yet"
      actions={<button type="button" className="btn round" onClick={openWalmartImport}><Icon name="upload" />Import Walmart report</button>}>
      Import Walmart's report to start. Only Marwaha rows are read, and each store's Walmart status follows its stage.</EmptyState>;
  }
  const anyFilter = !!(filter.stages.length || filter.franchisees.length || search.trim());
  return <>
    <WalmartProgress summary={summary} stages={filter.stages} />
    <WalmartMeta ctx={ctx} />
    <WalmartFilters filter={filter} anyFilter={anyFilter} />
    {rows.length ? <WalmartTable rows={rows} /> : <EmptyState icon="search-x" title="No stores match">Try a different search or filter.</EmptyState>}
  </>;
}
