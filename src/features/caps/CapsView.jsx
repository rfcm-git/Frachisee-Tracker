import { useMemo, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import FilterDropdown, { FilterOption } from "../../components/ui/FilterMenu.jsx";
import { CapDueBadge, EmptyState, InfoTip, StoreStatusIfClosed } from "../../components/ui/common.jsx";
import { usePaged } from "../../hooks/usePaged.js";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { CAP_DUE_SOON_DAYS, CAP_STATES, CAP_STATUS_COLOR } from "../../config/constants.js";
import { capStatusClass, formatDueDate, normalizeCapStatus } from "../../domain/caps.js";
import { storeStatus } from "../../domain/records.js";
import { searchQuery } from "../../domain/search.js";
import { formatNumber, formatTimestamp, telHref } from "../../lib/format.js";
import { useDataContext } from "../../state/dataStore.js";
import { openCapForm, openCapsImport, openStore } from "../../state/dialogs.js";
import { clearCapsFilters, setCapDueFilter, setCapEmailFilter, sortCaps, toggleCapDueFilter, toggleCapOnlyStatus, toggleCapStatus, useUiStore } from "../../state/uiStore.js";
import { askDeleteCap, updateCap } from "./capsActions.js";
import { capsProgress, filterCaps } from "./capsSelectors.js";

const SORT_LABELS = { num: "Store Number", status: "Status", added: "Date Added", updated: "Last Updated", due: "Due Date" };
const EMAIL_LABELS = { has: "Has email", none: "No email" };
const DUE_LABELS = { overdue: "Overdue", today: "Due today", week: "Due in 7 days", none: "No due date" };

const shortDay = (ts) => new Date(ts).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });

/** Date added, with the last update below it when different; full date and time on hover. */
function AddedUpdatedCell({ record }) {
  const updated = record.updated_at || record.created_at;
  return <td className="hide-sm muted cap-date">
    <span data-tip={`Added ${formatTimestamp(record.created_at)}`}>{record.created_at ? shortDay(record.created_at) : "—"}</span>
    {updated && shortDay(updated) !== shortDay(record.created_at) && <div className="cap-upd" data-tip={`Last updated ${formatTimestamp(updated)}`}>upd. {shortDay(updated)}</div>}
  </td>;
}

/** "Store Number ↑" etc. */
function sortText(sort) {
  if (sort.key === "added" || sort.key === "updated") return `${SORT_LABELS[sort.key]} · ${sort.dir < 0 ? "newest" : "oldest"}`;
  if (sort.key === "due") return `Due Date · ${sort.dir > 0 ? "soonest first" : "latest first"}`;
  if (sort.key === "status") return `Status · ${sort.dir > 0 ? "No Action Yet first" : "Completed first"}`;
  return `Store Number · ${sort.dir > 0 ? "low to high" : "high to low"}`;
}

/** One-line progress strip: counts per status (click to filter) and the completion bar. All records, not affected by filters. */
export function CapsProgress({ summary, statuses = [], due = "", showDue = true, onStatus = toggleCapOnlyStatus, onTotal = () => toggleCapStatus(""), onDue = toggleCapDueFilter }) {
  return <div className="cap-prog" role="group" aria-label="CAPs progress">
    <button type="button" className={`cap-cnt total${!statuses.length ? " on" : ""}`} data-tip="All stores in CAPs Monitoring — click to show all" onClick={onTotal}>
      <b>{formatNumber(summary.total)}</b>Total stores</button>
    {CAP_STATES.map((status) => {
      const on = statuses.length === 1 && statuses[0] === status;
      return <button type="button" key={status} className={`cap-cnt${on ? " on" : ""}${summary.counts[status] ? "" : " zero"}`} aria-pressed={on}
        data-tip={`${status}: ${summary.counts[status]}${on ? " — click again to show all" : " — click to show only these"}`} onClick={() => onStatus(status)}>
        <span className="d" style={{ background: CAP_STATUS_COLOR[status] }} /><b>{formatNumber(summary.counts[status])}</b>{status}</button>;
    })}
    {showDue && <>
      <button type="button" className={`cap-cnt cap-alert${summary.overdue ? " hot" : " zero"}${due === "overdue" ? " on" : ""}`} aria-pressed={due === "overdue"}
        data-tip={`Open CAPs past their submission due date: ${summary.overdue}${due === "overdue" ? " — click again to show all" : " — click to show only these"}`} onClick={() => onDue("overdue")}>
        <Icon name="triangle-alert" /><b>{formatNumber(summary.overdue)}</b>Overdue</button>
      <button type="button" className={`cap-cnt cap-alert${summary.dueSoon ? " warm" : " zero"}${due === "week" ? " on" : ""}`} aria-pressed={due === "week"}
        data-tip={`Open CAPs due today or in the next ${CAP_DUE_SOON_DAYS} days: ${summary.dueSoon} — click to show what is due this week`} onClick={() => onDue("week")}>
        <Icon name="alarm-clock" /><b>{formatNumber(summary.dueSoon)}</b>Due soon</button>
    </>}
    <div className="cap-bar-wrap" data-tip={`${summary.completed} of ${summary.total} stores have completed their CAP`}>
      <div className="cap-bar">{summary.total ? CAP_STATES.filter((status) => summary.counts[status]).map((status) => <span key={status}
        style={{ width: `${(summary.counts[status] / summary.total) * 100}%`, background: CAP_STATUS_COLOR[status] }} />) : null}</div>
      <b>{summary.percent}%</b><span className="muted">completed</span>
    </div>
  </div>;
}

function CapsFilters({ filter, anyFilter, showDue }) {
  const sort = filter.sort;
  const sortOption = (key, dir, icon, label, close) => <FilterOption key={`${key}${dir}`} selected={sort.key === key && sort.dir === dir}
    onClick={() => { sortCaps(key, dir); close(); }}><Icon name={icon} />{label}</FilterOption>;
  return <div className="ifbar"><div className="grp fdd-grp">
    <FilterDropdown icon="filter" label="Status" value={filter.statuses.join(", ")} active={filter.statuses.length > 0}>
      <FilterOption selected={!filter.statuses.length} onClick={() => toggleCapStatus("")}><span className="d" style={{ background: "var(--line)" }} />All statuses</FilterOption>
      <div className="fdd-div" />
      {CAP_STATES.map((status) => <FilterOption key={status} selected={filter.statuses.includes(status)} checkable onClick={() => toggleCapStatus(status)}>
        <span className="d" style={{ background: CAP_STATUS_COLOR[status] }} />{status}</FilterOption>)}
      <div className="fdd-note">Pick one or more</div>
    </FilterDropdown>
    <FilterDropdown icon="mail" label="Email" value={EMAIL_LABELS[filter.email] || ""} active={!!filter.email}>
      {({ close }) => <>
        <FilterOption selected={!filter.email} onClick={() => { setCapEmailFilter(""); close(); }}>All stores</FilterOption>
        <FilterOption selected={filter.email === "has"} onClick={() => { setCapEmailFilter("has"); close(); }}>Has an email address</FilterOption>
        <FilterOption selected={filter.email === "none"} onClick={() => { setCapEmailFilter("none"); close(); }}>No email address</FilterOption>
      </>}
    </FilterDropdown>
    {showDue && <FilterDropdown icon="calendar-clock" label="Due date" value={DUE_LABELS[filter.due] || ""} active={!!filter.due}>
      {({ close }) => <>
        <FilterOption selected={!filter.due} onClick={() => { setCapDueFilter(""); close(); }}>All stores</FilterOption>
        <div className="fdd-div" />
        {Object.entries(DUE_LABELS).map(([value, label]) => <FilterOption key={value} selected={filter.due === value} onClick={() => { setCapDueFilter(value); close(); }}>{label}</FilterOption>)}
        <div className="fdd-note">Overdue and due filters skip Completed CAPs</div>
      </>}
    </FilterDropdown>}
    <FilterDropdown icon="arrow-down-up" label="Sort" value={sortText(sort)}>
      {({ close }) => <>
        {sortOption("added", -1, "arrow-down-wide-narrow", "Date added · newest first", close)}
        {sortOption("added", 1, "arrow-up-narrow-wide", "Date added · oldest first", close)}
        {sortOption("updated", -1, "arrow-down-wide-narrow", "Last updated · newest first", close)}
        {sortOption("updated", 1, "arrow-up-narrow-wide", "Last updated · oldest first", close)}
        <div className="fdd-div" />
        {sortOption("num", 1, "arrow-up-narrow-wide", "Store number · low to high", close)}
        {sortOption("num", -1, "arrow-down-wide-narrow", "Store number · high to low", close)}
        {sortOption("status", 1, "arrow-up-narrow-wide", "Status · No Action Yet first", close)}
        {sortOption("status", -1, "arrow-down-wide-narrow", "Status · Completed first", close)}
        {showDue && <>
          <div className="fdd-div" />
          {sortOption("due", 1, "arrow-up-narrow-wide", "Due date · soonest first", close)}
          {sortOption("due", -1, "arrow-down-wide-narrow", "Due date · latest first", close)}
        </>}
      </>}
    </FilterDropdown>
  </div>
    <InfoTip text="Filters and sorting work together with the search box. Search by store # (#123), franchisee (@name), email, phone or notes. You can also click a column title to sort." />
    {anyFilter && <button type="button" className="btn link" onClick={clearCapsFilters} style={{ marginLeft: "auto" }}><Icon name="x" />Clear filters</button>}
  </div>;
}

/** Status picker inside the table row; saves right away. */
function StatusSelect({ record }) {
  const [saving, setSaving] = useState(false);
  const status = normalizeCapStatus(record.status);
  return <select className={`cap-sel ${capStatusClass(status)}`} value={status} disabled={saving} aria-label={`Status of store ${record.store_num}`}
    onChange={async (event) => {
      setSaving(true);
      await updateCap(record, { status: event.target.value });
      setSaving(false);
    }}>
    {CAP_STATES.map((value) => <option key={value} value={value}>{value}</option>)}
  </select>;
}

function SortButton({ sortKey, sort, children }) {
  const on = sort.key === sortKey;
  return <button type="button" className={on ? "on" : ""} data-tip={`Sort by ${SORT_LABELS[sortKey]}`} onClick={() => sortCaps(sortKey)}>{children}
    <Icon name={on ? (sort.dir < 0 ? "arrow-down" : "arrow-up") : "arrow-down-up"} /></button>;
}

function SortHeader({ sortKey, sort, className = "", children }) {
  const on = sort.key === sortKey;
  return <th className={`cap-sort${on ? " on" : ""}${className ? ` ${className}` : ""}`} aria-sort={on ? (sort.dir < 0 ? "descending" : "ascending") : undefined}>
    <SortButton sortKey={sortKey} sort={sort}>{children}</SortButton></th>;
}

/** Contact value; muted with a tip when it comes from the store records. */
function ContactValue({ value, text = value, fromStore, href }) {
  if (!value) return <span className="muted">—</span>;
  return <span className={fromStore ? "cap-fromstore" : ""} data-tip={fromStore ? "From the store records" : "Saved on this CAP record"}>
    {href ? <a href={href} onClick={(event) => event.stopPropagation()}>{text}</a> : text}</span>;
}

/** "(714) 863-8900" never splits across lines; extra text such as "(Store)" can still wrap. */
const keepPhoneTogether = (value) => String(value || "").replace(/\) (?=\d)/g, ")\u00a0").replace(/(\d)-(\d)/g, "$1\u2011$2");

function CapsTable({ ctx, rows, sort, showDue }) {
  const { items, pagerProps } = usePaged("cap", rows);
  return <div className="card" style={{ overflowX: "auto" }}><table className="is-table cap-table"><thead><tr>
    <SortHeader sortKey="num" sort={sort} className="c-snum">Store #</SortHeader>
    <th>Franchisee</th><th className="hide-sm">Email Address</th><th className="hide-sm cap-phone">Phone Number</th>
    <SortHeader sortKey="status" sort={sort} className="cap-statuscol">Status</SortHeader>
    {showDue && <SortHeader sortKey="due" sort={sort} className="cap-duecol">Due Date</SortHeader>}
    <th className="hide-sm cap-notes">Notes</th>
    <th className="cap-sort cap-sort2 hide-sm cap-date"><SortButton sortKey="added" sort={sort}>Date Added</SortButton>
      <SortButton sortKey="updated" sort={sort}>Last Updated</SortButton></th>
    <th className="c-act">Actions</th>
  </tr></thead><tbody>
    {items.map(({ record, contact }) => {
      const store = ctx.storeByNum.get(String(record.store_num));
      return <tr key={record.id}>
        <td className="c-snum">{store
          ? <button type="button" className="ob-snum" data-tip="Open store information" onClick={() => openStore(store.id)}>{record.store_num}</button>
          : <span className="cap-nostore" data-tip="Not in the store list">{record.store_num}</span>}
          {store && storeStatus(store) !== "Open" && <div style={{ marginTop: 3 }}><StoreStatusIfClosed status={storeStatus(store)} /></div>}</td>
        <td><ContactValue value={contact.name} fromStore={contact.fromStore.name} /></td>
        <td className="hide-sm cap-email"><ContactValue value={contact.email} fromStore={contact.fromStore.email} href={contact.email ? `mailto:${contact.email}` : ""} /></td>
        <td className="hide-sm cap-phone"><ContactValue value={contact.phone} text={keepPhoneTogether(contact.phone)} fromStore={contact.fromStore.phone} href={contact.phone ? telHref(contact.phone) : ""} /></td>
        <td className="cap-statuscol"><StatusSelect key={`${record.id}-${record.updated_at}`} record={record} /></td>
        {showDue && <td className="cap-duecol">{record.due_date
          ? <div className="cap-due-cell"><span>{formatDueDate(record.due_date)}</span><CapDueBadge record={record} /></div>
          : <button type="button" className="btn link cap-setdue" data-tip="Set a submission due date" onClick={() => openCapForm(record.id)}><Icon name="calendar" />Set</button>}</td>}
        <td className="hide-sm cap-notes">{record.notes ? <span className="cap-note" data-tip={record.notes}>{record.notes}</span> : <span className="muted">—</span>}</td>
        <AddedUpdatedCell record={record} />
        <td className="c-act"><div className="row-acts">
          <button type="button" className="iconbtn mini" data-tip="Edit details, status and notes" aria-label="Edit" onClick={() => openCapForm(record.id)}><Icon name="pencil" /></button>
          <button type="button" className="iconbtn mini del" data-tip="Remove from CAPs Monitoring" aria-label="Remove" onClick={() => askDeleteCap(record.id)}><Icon name="trash-2" /></button>
        </div></td>
      </tr>;
    })}
  </tbody></table>
    <Pagination {...pagerProps} />
  </div>;
}

export default function CapsView() {
  const ctx = useDataContext();
  const filter = useUiStore((state) => state.capsFilter);
  const search = useUiStore((state) => state.search);
  const rows = useMemo(() => filterCaps(ctx, ctx.capsDueReady ? filter : { ...filter, due: "" }, searchQuery(search)), [ctx, filter, search]);
  const summary = useMemo(() => capsProgress(ctx), [ctx]);
  useToolbarCount(ctx.capsReady ? `${formatNumber(rows.length)} store${rows.length !== 1 ? "s" : ""} · ${formatNumber(summary.completed)} completed` : "");

  if (!ctx.capsReady) return <EmptyState icon="database" title="CAPs Monitoring needs a quick database update">Run migrate-caps.sql in the Supabase SQL Editor, then click Refresh. Other tabs are not affected.</EmptyState>;
  if (!ctx.caps.length) {
    return <EmptyState icon="list-checks" title="No stores in CAPs Monitoring yet"
      actions={<><button type="button" className="btn round" onClick={() => openCapForm()}><Icon name="plus" />Add store</button>
        <button type="button" className="btn outline round" onClick={openCapsImport}><Icon name="upload" />Import spreadsheet</button></>}>
      Add a single store, or import many from an Excel spreadsheet.</EmptyState>;
  }
  const showDue = ctx.capsDueReady;
  const anyFilter = !!(filter.statuses.length || filter.email || (showDue && filter.due) || search.trim());
  return <>
    {!showDue && <div className="warnbox show cap-migrate"><Icon name="database" /><div>
      <b>Submission due dates need a quick database update.</b> Run <code>migrate-caps-due-date.sql</code> in the Supabase SQL Editor, then click Refresh. Everything else in CAPs Monitoring works as before.</div></div>}
    <CapsProgress summary={summary} statuses={filter.statuses} due={filter.due} showDue={showDue} />
    <CapsFilters filter={filter} anyFilter={anyFilter} showDue={showDue} />
    {rows.length ? <CapsTable ctx={ctx} rows={rows} sort={filter.sort} showDue={showDue} /> : <EmptyState icon="search-x" title="No stores match">Try a different search or filter.</EmptyState>}
  </>;
}
