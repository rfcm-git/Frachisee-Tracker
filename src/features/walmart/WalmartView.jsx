import { useMemo, useState } from "react";
import ContactCell from "../../components/ui/ContactCell.jsx";
import Icon from "../../components/ui/Icon.jsx";
import ChangeLogCell from "../../components/ui/ChangeLogCell.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import FilterDropdown, { FilterOption } from "../../components/ui/FilterMenu.jsx";
import { EmptyState, InfoTip, StoreStatusIfClosed, WmStageBadge } from "../../components/ui/common.jsx";
import { usePaged } from "../../hooks/usePaged.js";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { WM_NEXT_STEP, WM_STAGES, WM_STAGE_COLOR } from "../../config/constants.js";
import { storeContactDefaults } from "../../domain/caps.js";
import { platformStatus, storeStatus } from "../../domain/records.js";
import { searchQuery } from "../../domain/search.js";
import { normalizeWmStage, wmHistory, wmPlatformStatus, wmStageClass } from "../../domain/walmart.js";
import { wmCanEmail } from "../../domain/walmartEmail.js";
import { formatNumber, formatTimestamp, timeOf } from "../../lib/format.js";
import { useDataContext } from "../../state/dataStore.js";
import { openStore, openWalmartAdd, openWalmartImport, openWalmartUpdate } from "../../state/dialogs.js";
import {
  clearWmFilters, setWmEmailFilter, setWmSort, setWmView, toggleWmFranchisee, toggleWmOnlyStage, toggleWmStage, useUiStore,
} from "../../state/uiStore.js";
import { askDeleteWalmart, updateWalmart } from "./walmartActions.js";
import { sendWalmartEmail } from "./walmartEmailActions.js";
import { filterWalmart, lastWalmartImport, walmartFollowUp, walmartFranchisees, walmartOwnerGroups, walmartProgress } from "./walmartSelectors.js";

const SORT_LABELS = { num: "Store Number", stage: "Stage", emailed: "Emailed", added: "Date Added", updated: "Last Updated" };
const EMAIL_LABELS = { none: "Not emailed yet", sent: "Emailed" };

const shortDay = (ts) => new Date(ts).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });

/** "Stage · Awaiting App first" etc. */
function sortText(sort) {
  if (sort.key === "added" || sort.key === "updated" || sort.key === "emailed") return `${SORT_LABELS[sort.key]} · ${sort.dir < 0 ? "newest" : "oldest"}`;
  if (sort.key === "stage") return `Stage · ${sort.dir > 0 ? "Awaiting App first" : "Exempted first"}`;
  return `Store Number · ${sort.dir > 0 ? "low to high" : "high to low"}`;
}

/** One-line progress strip: counts per stage (click to filter), stores not emailed yet, and the onboarded bar. All records, not affected by filters. */
function WalmartProgress({ summary, followUp, stages, email }) {
  return <div className="cap-prog" role="group" aria-label="Walmart progress">
    <button type="button" className={`cap-cnt total${!stages.length ? " on" : ""}`} data-tip="All stores on the Walmart tab — click to show all" onClick={() => toggleWmStage("")}>
      <b>{formatNumber(summary.total)}</b>Total stores</button>
    {WM_STAGES.map((stage) => {
      const on = stages.length === 1 && stages[0] === stage;
      const count = summary.counts[stage];
      return <button type="button" key={stage} className={`cap-cnt${on ? " on" : ""}${count ? "" : " zero"}`} aria-pressed={on}
        data-tip={`${stage}: ${count} (${summary.share(count)}%) — ${WM_NEXT_STEP[stage]}${on ? " Click again to show all." : " Click to show only these."}`} onClick={() => toggleWmOnlyStage(stage)}>
        <span className="d" style={{ background: WM_STAGE_COLOR[stage] }} /><b>{formatNumber(count)}</b>{stage}</button>;
    })}
    <button type="button" className={`cap-cnt cap-alert${followUp.notEmailed ? " warm" : " zero"}${email === "none" ? " on" : ""}`} aria-pressed={email === "none"}
      data-tip={`Stores at Awaiting App or Payment Setup not emailed yet: ${followUp.notEmailed}${email === "none" ? " — click again to show all" : " — click to show only these"}`}
      onClick={() => setWmEmailFilter(email === "none" ? "" : "none")}>
      <Icon name="mail" /><b>{formatNumber(followUp.notEmailed)}</b>Not emailed</button>
    <div className="cap-bar-wrap" data-tip={`${summary.done} of ${summary.total} stores have their Walmart account created`}>
      <div className="cap-bar">{summary.total ? WM_STAGES.filter((stage) => summary.counts[stage]).map((stage) => <span key={stage}
        style={{ width: `${(summary.counts[stage] / summary.total) * 100}%`, background: WM_STAGE_COLOR[stage] }} />) : null}</div>
      <b>{summary.percent}%</b><span className="muted">onboarded</span>
    </div>
  </div>;
}

/**
 * Last Updated of a record: its last change or its last email, whichever is later.
 * Emails now also stamp updated_at; this covers stores emailed before that.
 */
const wmLastUpdated = (record) => (timeOf(record.last_email_at) > timeOf(record.updated_at || record.created_at) ? record.last_email_at : record.updated_at || record.created_at);

/** When the list was last imported and last changed by anyone. */
function WalmartMeta({ ctx }) {
  const imported = lastWalmartImport(ctx);
  const lastChange = ctx.walmart.reduce((latest, record) => Math.max(latest, timeOf(wmLastUpdated(record))), 0);
  return <div className="cap-meta">
    <span data-tip={imported ? `Imported ${formatTimestamp(imported)}` : "Walmart's report has not been imported yet"}>
      <Icon name="upload" />Last import: <b>{imported ? formatTimestamp(imported) : "never"}</b></span>
    {lastChange > 0 && <span data-tip="Last time any store on the Walmart tab was added or changed (import, edit, stage change or email)">
      <Icon name="history" />List last updated: <b>{formatTimestamp(lastChange)}</b></span>}
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
  const sort = filter.sort;
  const sortOption = (key, dir, icon, label, close) => <FilterOption key={`${key}${dir}`} selected={sort.key === key && sort.dir === dir}
    onClick={() => { setWmSort(key, dir); close(); }}><Icon name={icon} />{label}</FilterOption>;
  return <div className="ifbar wm-bar"><div className="grp fdd-grp">
    <FilterDropdown icon="filter" label="Stage" value={filter.stages.join(", ")} active={filter.stages.length > 0}>
      <FilterOption selected={!filter.stages.length} onClick={() => toggleWmStage("")}><span className="d" style={{ background: "var(--line)" }} />All stages</FilterOption>
      <div className="fdd-div" />
      {WM_STAGES.map((stage) => <FilterOption key={stage} selected={filter.stages.includes(stage)} checkable onClick={() => toggleWmStage(stage)}>
        <span className="d" style={{ background: WM_STAGE_COLOR[stage] }} />{stage}</FilterOption>)}
      <div className="fdd-note">Pick one or more</div>
    </FilterDropdown>
    <FranchiseeFilter values={filter.franchisees} />
    <FilterDropdown icon="mail" label="Email" value={EMAIL_LABELS[filter.email] || ""} active={!!filter.email}>
      {({ close }) => <>
        <FilterOption selected={!filter.email} onClick={() => { setWmEmailFilter(""); close(); }}>All stores</FilterOption>
        <FilterOption selected={filter.email === "none"} onClick={() => { setWmEmailFilter("none"); close(); }}>Not emailed yet</FilterOption>
        <FilterOption selected={filter.email === "sent"} onClick={() => { setWmEmailFilter("sent"); close(); }}>Emailed</FilterOption>
        <div className="fdd-note">Only stores at Awaiting App or Payment Setup are emailed</div>
      </>}
    </FilterDropdown>
    <FilterDropdown icon="arrow-down-up" label="Sort" value={sortText(sort)}>
      {({ close }) => <>
        {sortOption("stage", 1, "arrow-up-narrow-wide", "Stage · Awaiting App first", close)}
        {sortOption("stage", -1, "arrow-down-wide-narrow", "Stage · Exempted first", close)}
        <div className="fdd-div" />
        {sortOption("added", -1, "arrow-down-wide-narrow", "Date added · newest first", close)}
        {sortOption("added", 1, "arrow-up-narrow-wide", "Date added · oldest first", close)}
        {sortOption("updated", -1, "arrow-down-wide-narrow", "Last updated · newest first", close)}
        {sortOption("updated", 1, "arrow-up-narrow-wide", "Last updated · oldest first", close)}
        {sortOption("emailed", -1, "arrow-down-wide-narrow", "Emailed · newest first", close)}
        {sortOption("emailed", 1, "arrow-up-narrow-wide", "Emailed · not emailed first", close)}
        <div className="fdd-div" />
        {sortOption("num", 1, "arrow-up-narrow-wide", "Store number · low to high", close)}
        {sortOption("num", -1, "arrow-down-wide-narrow", "Store number · high to low", close)}
      </>}
    </FilterDropdown>
    <InfoTip text="Filters and sorting work together with the search box. Search by store # (#123), franchisee (@name), stage or notes. You can also click a column title to sort." />
    {anyFilter && <button type="button" className="btn link" onClick={clearWmFilters}><Icon name="x" />Clear filters</button>}
  </div>
    <ViewSwitch view={view} owners={owners} />
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

/** Opens the stage's email in Outlook (Awaiting App and Payment Setup only). Dimmed once the store was emailed (it asks first). */
function EmailButton({ record, stage, email }) {
  const sent = !!record.last_email_at;
  const tip = !email ? "The franchisee has no email address — add one on the franchisee"
    : sent ? `Emailed ${formatTimestamp(record.last_email_at)} — click to open the email in Outlook again` : `Open the ${stage} email to ${email} in Outlook`;
  return <button type="button" className={`iconbtn mini cap-mailbtn${!email ? " off" : sent ? " done" : " fresh"}`} aria-disabled={!email} data-tip={tip}
    aria-label={`Email store ${record.store_num}`} onClick={() => sendWalmartEmail(record.id)}><Icon name={sent ? "mail-check" : "send"} /></button>;
}

function SortButton({ sortKey, sort, children }) {
  const on = sort.key === sortKey;
  return <button type="button" className={on ? "on" : ""} data-tip={`Sort by ${SORT_LABELS[sortKey]}`} onClick={() => setWmSort(sortKey)}>{children}
    <Icon name={on ? (sort.dir < 0 ? "arrow-down" : "arrow-up") : "arrow-down-up"} /></button>;
}

function SortHeader({ sortKey, sort, className = "", children }) {
  const on = sort.key === sortKey;
  return <th className={`cap-sort${on ? " on" : ""}${className ? ` ${className}` : ""}`} aria-sort={on ? (sort.dir < 0 ? "descending" : "ascending") : undefined}>
    <SortButton sortKey={sortKey} sort={sort}>{children}</SortButton></th>;
}

/** "(714) 863-8900" never splits across lines. */

/** Change-log entries of a record, newest first, for the Date Added / Last Updated cell. */
function logEntries(record) {
  return wmHistory(record).slice().reverse().map((entry, index) => {
    const by = entry.source === "import" ? " by import" : "";
    const title = entry.kind === "created" ? `Added${by}` : entry.kind === "email" ? "Email opened in Outlook" : entry.to ? `Stage changed${by}` : "Note added";
    return {
      key: `${entry.ts}-${index}`, title, ts: entry.ts, created: entry.kind === "created",
      lines: [
        ...(entry.kind === "created" && entry.stage ? [`Stage: ${normalizeWmStage(entry.stage)}`] : []),
        ...(entry.kind === "email" && entry.stage ? [`${entry.stage} email`] : []),
        ...(entry.to ? [`Stage: ${entry.from || "—"} → ${entry.to}`] : []),
        ...(entry.note ? [entry.note] : []),
      ],
    };
  });
}

function WalmartTable({ ctx, rows, sort }) {
  const { items, pagerProps } = usePaged("wm", rows);
  return <div className="card" style={{ overflowX: "auto" }}><table className="is-table cap-table wm-table-list"><thead><tr>
    <SortHeader sortKey="num" sort={sort} className="c-snum">Store #</SortHeader>
    <th className="cap-fr">Franchisee</th><th className="hide-sm cap-contact">Contact</th>
    <SortHeader sortKey="stage" sort={sort} className="cap-statuscol">Stage</SortHeader>
    <SortHeader sortKey="emailed" sort={sort} className="cap-duecol">Emailed</SortHeader>
    <th className="cap-notescol">Notes</th>
    <th className="cap-sort cap-sort2 hide-sm cap-date"><SortButton sortKey="added" sort={sort}>Date Added</SortButton>
      <SortButton sortKey="updated" sort={sort}>Last Updated</SortButton></th>
    <th className="c-act">Actions</th>
  </tr></thead><tbody>
    {items.map(({ record, store, stage }) => {
      const contact = storeContactDefaults(ctx, record.store_num);
      const expected = wmPlatformStatus(stage);
      const actual = store ? platformStatus(store, "wm") : expected;
      return <tr key={record.id}>
        <td className="c-snum">{store
          ? <button type="button" className="ob-snum" data-tip="Open store information" onClick={() => openStore(store.id)}>{record.store_num}</button>
          : <span className="cap-nostore" data-tip="Not in the store list">{record.store_num}</span>}
          {store && storeStatus(store) !== "Open" && <div style={{ marginTop: 3 }}><StoreStatusIfClosed status={storeStatus(store)} /></div>}</td>
        <td className="cap-fr"><div className="cap-clamp" data-tip={contact.name || undefined}>{contact.name || <span className="muted">—</span>}</div></td>
        <ContactCell email={contact.email} phone={contact.phone} />
        <td className="cap-statuscol"><div className="cap-statuswrap"><StageSelect key={`${record.id}-${record.updated_at}`} record={record} stage={stage} />
          {wmCanEmail(record) && <EmailButton record={record} stage={stage} email={contact.email} />}
          {actual !== expected && <span className="wm-mismatch" role="img" aria-label={`Store's Walmart status is ${actual}`}
            data-tip={`The store's Walmart status is ${actual}; ${stage} means ${expected}. Changing the stage or the next import sets it to match.`}><Icon name="triangle-alert" /></span>}</div></td>
        <td className="cap-duecol">{!wmCanEmail(record) ? <span className="muted">—</span>
          : record.last_email_at ? <div className="cap-due-cell"><span>{shortDay(record.last_email_at)}</span><span className="badge wm-sent"><Icon name="mail-check" />Emailed</span></div>
            : <span className="badge wm-unsent"><Icon name="mail" />Not emailed</span>}</td>
        <td className="cap-notescol">{record.notes ? <span className="cap-note" data-tip={record.notes}>{record.notes}</span> : <span className="muted">—</span>}</td>
        <ChangeLogCell createdAt={record.created_at} updatedAt={wmLastUpdated(record)} heading={`Change log · Store ${record.store_num}`}
          label={`Store ${record.store_num}: change log`} entries={logEntries(record)} />
        <td className="c-act"><div className="row-acts">
          {record.notes && <button type="button" className="iconbtn mini cap-notebtn" data-tip={`Notes: ${record.notes}`} aria-label={`Notes for store ${record.store_num}: ${record.notes}`}
            onClick={() => openWalmartUpdate(record.id)}><Icon name="sticky-note" /></button>}
          <button type="button" className="iconbtn mini" data-tip="Change the stage, add a note, see the change log" aria-label={`Edit store ${record.store_num}`} onClick={() => openWalmartUpdate(record.id)}><Icon name="pencil" /></button>
          <button type="button" className="iconbtn mini del" data-tip="Remove from the Walmart tab" aria-label={`Remove store ${record.store_num}`} onClick={() => askDeleteWalmart(record.id)}><Icon name="trash-2" /></button>
        </div></td>
      </tr>;
    })}
  </tbody></table>
    <Pagination {...pagerProps} />
  </div>;
}

/** Franchisees with more than one store: their store count and each store under its stage. */
function OwnersTable({ groups }) {
  const { items, pagerProps } = usePaged("wm", groups);
  return <div className="card" style={{ overflowX: "auto" }}><table className="is-table wm-owners"><thead><tr>
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
  useToolbarCount(ctx.walmartReady && ctx.walmart.length ? `${formatNumber(rows.length)} store${rows.length !== 1 ? "s" : ""} · ${formatNumber(summary.done)} onboarded` : "");

  if (!ctx.walmartReady) return <EmptyState icon="database" title="The Walmart tab needs a quick database update">Run migrate-walmart.sql in the Supabase SQL Editor, then click Refresh. Other tabs are not affected.</EmptyState>;
  if (!ctx.walmart.length) {
    return <EmptyState icon="shopping-cart" title="No stores on the Walmart tab yet"
      actions={<><button type="button" className="btn round" onClick={() => openWalmartAdd()}><Icon name="plus" />Add store</button>
        <button type="button" className="btn outline round" onClick={openWalmartImport}><Icon name="upload" />Import Walmart report</button></>}>
      Add a single store, or import Walmart's report. Only Marwaha rows are read, and each store's Walmart status follows its stage.</EmptyState>;
  }
  const anyFilter = !!(filter.stages.length || filter.franchisees.length || filter.email || search.trim());
  return <>
    <WalmartProgress summary={summary} followUp={followUp} stages={filter.stages} email={filter.email} />
    <WalmartMeta ctx={ctx} />
    <WalmartFilters filter={filter} anyFilter={anyFilter} view={view} owners={groups.length} />
    {view === "owners"
      ? (groups.length ? <OwnersTable groups={groups} /> : <EmptyState icon="users" title="No franchisee has more than one store here">{anyFilter ? "Try a different search or filter." : "Franchisees with two or more stores on the Walmart tab show up here."}</EmptyState>)
      : rows.length ? <WalmartTable ctx={ctx} rows={rows} sort={filter.sort} /> : <EmptyState icon="search-x" title="No stores match">Try a different search or filter.</EmptyState>}
  </>;
}
