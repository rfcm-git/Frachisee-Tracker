import { useMemo, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import ChangeLogCell from "../../components/ui/ChangeLogCell.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import FilterDropdown, { FilterOption } from "../../components/ui/FilterMenu.jsx";
import { EmptyState, InfoTip, StoreStatusIfClosed } from "../../components/ui/common.jsx";
import { usePaged } from "../../hooks/usePaged.js";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { OB_STATES, OB_STATUS_COLOR } from "../../config/constants.js";
import { storeContactDefaults } from "../../domain/caps.js";
import { obHistory, obIsOpen, obStatusClass, obStatusLabel } from "../../domain/onboarding.js";
import { OB_EMAIL_NOTE } from "../../domain/onboardingEmail.js";
import { platformStatus, storeStatus } from "../../domain/records.js";
import { searchQuery } from "../../domain/search.js";
import { formatNumber, formatTimestamp, telHref, timeOf } from "../../lib/format.js";
import { oneLine } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openNewOnboarding, openOnboardingHistory, openStore, openUpdateOnboarding } from "../../state/dialogs.js";
import {
  clearEzFilters, setEzEmailFilter, setEzSort, toggleEzFranchisee, toggleEzOnlyStatus, toggleEzStatus, useUiStore,
} from "../../state/uiStore.js";
import { askDeleteOnboarding, updateOnboarding } from "../onboarding/onboardingActions.js";
import { sendOnboardingEmail } from "../onboarding/onboardingEmailActions.js";
import { ezFranchisees, ezProgress, ezRecords, filterEzCater } from "./ezcaterSelectors.js";

const SORT_LABELS = { num: "Store Number", status: "Status", emailed: "Emailed", added: "Date Added", updated: "Last Updated" };
const EMAIL_LABELS = { none: "Not emailed yet", sent: "Emailed" };

const shortDay = (ts) => new Date(ts).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });

/** "Status · Not enrolled first" etc. */
function sortText(sort) {
  if (sort.key === "added" || sort.key === "updated" || sort.key === "emailed") return `${SORT_LABELS[sort.key]} · ${sort.dir < 0 ? "newest" : "oldest"}`;
  if (sort.key === "status") return `Status · ${sort.dir > 0 ? "Not enrolled first" : "Exempted first"}`;
  return `Store Number · ${sort.dir > 0 ? "low to high" : "high to low"}`;
}

/** One-line progress strip: counts per status (click to filter), stores not emailed yet, and the onboarded bar. All stores, not affected by filters. */
function EzProgress({ summary, statuses, email }) {
  return <div className="cap-prog" role="group" aria-label="ezCater progress">
    <button type="button" className={`cap-cnt total${!statuses.length ? " on" : ""}`} data-tip="All stores on the ezCater tab — click to show all" onClick={() => toggleEzStatus("")}>
      <b>{formatNumber(summary.total)}</b>Total stores</button>
    {OB_STATES.map((status) => {
      const on = statuses.length === 1 && statuses[0] === status;
      const count = summary.counts[status] || 0;
      return <button type="button" key={status} className={`cap-cnt${on ? " on" : ""}${count ? "" : " zero"}`} aria-pressed={on}
        data-tip={`${status}: ${count}${on ? " — click again to show all" : " — click to show only these"}`} onClick={() => toggleEzOnlyStatus(status)}>
        <span className="d" style={{ background: OB_STATUS_COLOR[status] }} /><b>{formatNumber(count)}</b>{status}</button>;
    })}
    <button type="button" className={`cap-cnt cap-alert${summary.notEmailed ? " warm" : " zero"}${email === "none" ? " on" : ""}`} aria-pressed={email === "none"}
      data-tip={`Stores still being onboarded that were not emailed yet: ${summary.notEmailed}${email === "none" ? " — click again to show all" : " — click to show only these"}`}
      onClick={() => setEzEmailFilter(email === "none" ? "" : "none")}>
      <Icon name="mail" /><b>{formatNumber(summary.notEmailed)}</b>Not emailed</button>
    <div className="cap-bar-wrap" data-tip={`${summary.done} of ${summary.total} stores are onboarded on ezCater`}>
      <div className="cap-bar">{summary.total ? OB_STATES.filter((status) => summary.counts[status]).map((status) => <span key={status}
        style={{ width: `${(summary.counts[status] / summary.total) * 100}%`, background: OB_STATUS_COLOR[status] }} />) : null}</div>
      <b>{summary.percent}%</b><span className="muted">onboarded</span>
    </div>
  </div>;
}

/** When the list was last changed by anyone. */
function EzMeta({ rows }) {
  const lastChange = rows.reduce((latest, record) => Math.max(latest, timeOf(record.updated_at || record.created_at)), 0);
  if (!lastChange) return null;
  return <div className="cap-meta">
    <span data-tip="Last time any store on the ezCater tab was added or changed (status change, update or email)">
      <Icon name="history" />List last updated: <b>{formatTimestamp(lastChange)}</b></span>
  </div>;
}

/** Franchisees with stores on the ezCater tab, with a search box. Pick one or more. */
function FranchiseeFilter({ values }) {
  const ctx = useDataContext();
  const [query, setQuery] = useState("");
  const all = useMemo(() => ezFranchisees(ctx), [ctx]);
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((item) => item.name.toLowerCase().includes(q)) : all;
  const names = values.map((id) => all.find((item) => item.id === id)?.name || ctx.frById.get(id)?.name || `#${id}`);
  return <FilterDropdown icon="users" label="Franchisee" value={names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0] || ""} active={values.length > 0}>
    <div className="fdd-search"><Icon name="search" /><input type="search" value={query} placeholder="Search franchisees…" aria-label="Search franchisees"
      autoFocus onChange={(event) => setQuery(event.target.value)} /></div>
    <FilterOption selected={!values.length} onClick={() => toggleEzFranchisee("")}>All franchisees</FilterOption><div className="fdd-div" />
    <div className="fdd-scroll">
      {shown.map((item) => <FilterOption key={item.id} selected={values.includes(item.id)} checkable onClick={() => toggleEzFranchisee(item.id)}>
        <span className="fdd-name">{item.name}</span><span className="fdd-cnt">{item.count}</span></FilterOption>)}
      {!shown.length && <div className="fdd-note">No franchisee matches “{query}”</div>}
    </div>
    <div className="fdd-note">Only franchisees with stores on the ezCater tab · pick one or more</div>
  </FilterDropdown>;
}

function EzFilters({ filter, anyFilter }) {
  const sort = filter.sort;
  const sortOption = (key, dir, icon, label, close) => <FilterOption key={`${key}${dir}`} selected={sort.key === key && sort.dir === dir}
    onClick={() => { setEzSort(key, dir); close(); }}><Icon name={icon} />{label}</FilterOption>;
  return <div className="ifbar"><div className="grp fdd-grp">
    <FilterDropdown icon="filter" label="Status" value={filter.statuses.join(", ")} active={filter.statuses.length > 0}>
      <FilterOption selected={!filter.statuses.length} onClick={() => toggleEzStatus("")}><span className="d" style={{ background: "var(--line)" }} />All statuses</FilterOption>
      <div className="fdd-div" />
      {OB_STATES.map((status) => <FilterOption key={status} selected={filter.statuses.includes(status)} checkable onClick={() => toggleEzStatus(status)}>
        <span className="d" style={{ background: OB_STATUS_COLOR[status] }} />{status}</FilterOption>)}
      <div className="fdd-note">Pick one or more</div>
    </FilterDropdown>
    <FranchiseeFilter values={filter.franchisees} />
    <FilterDropdown icon="mail" label="Email" value={EMAIL_LABELS[filter.email] || ""} active={!!filter.email}>
      {({ close }) => <>
        <FilterOption selected={!filter.email} onClick={() => { setEzEmailFilter(""); close(); }}>All stores</FilterOption>
        <FilterOption selected={filter.email === "none"} onClick={() => { setEzEmailFilter("none"); close(); }}>Not emailed yet</FilterOption>
        <FilterOption selected={filter.email === "sent"} onClick={() => { setEzEmailFilter("sent"); close(); }}>Emailed</FilterOption>
        <div className="fdd-note">Only stores still being onboarded (Not enrolled or Work in Progress)</div>
      </>}
    </FilterDropdown>
    <FilterDropdown icon="arrow-down-up" label="Sort" value={sortText(sort)}>
      {({ close }) => <>
        {sortOption("status", 1, "arrow-up-narrow-wide", "Status · Not enrolled first", close)}
        {sortOption("status", -1, "arrow-down-wide-narrow", "Status · Exempted first", close)}
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
  </div>
    <InfoTip text="Filters and sorting work together with the search box. Search by store # (#123), franchisee (@name), status or updates. You can also click a column title to sort." />
    {anyFilter && <button type="button" className="btn link" onClick={clearEzFilters} style={{ marginLeft: "auto" }}><Icon name="x" />Clear filters</button>}
  </div>;
}

/** Status picker inside the table row; saves right away, logs the change and sets the store's ezCater status. */
function StatusSelect({ record }) {
  const [saving, setSaving] = useState(false);
  return <select className={`cap-sel ${obStatusClass(record.status)}`} value={record.status} disabled={saving} aria-label={`ezCater status of store ${record.store_num}`}
    onChange={async (event) => {
      setSaving(true);
      await updateOnboarding(record, { status: event.target.value, text: "" });
      setSaving(false);
    }}>
    {OB_STATES.map((value) => <option key={value} value={value}>{value}</option>)}
  </select>;
}

/** Opens the ezCater email in Outlook (stores still being onboarded); dimmed once the store was emailed (it asks first). */
function EmailButton({ record, emailedAt, email }) {
  const tip = !email ? "The franchisee has no email address — add one on the franchisee"
    : emailedAt ? `Emailed ${formatTimestamp(emailedAt)} — click to email again` : `Open the ezCater email to ${email} in Outlook`;
  return <button type="button" className={`iconbtn mini cap-mailbtn${!email ? " off" : emailedAt ? " done" : " fresh"}`} aria-disabled={!email} data-tip={tip}
    aria-label={`Email store ${record.store_num}`} onClick={() => sendOnboardingEmail(record.id)}><Icon name={emailedAt ? "mail-check" : "send"} /></button>;
}

function SortButton({ sortKey, sort, children }) {
  const on = sort.key === sortKey;
  return <button type="button" className={on ? "on" : ""} data-tip={`Sort by ${SORT_LABELS[sortKey]}`} onClick={() => setEzSort(sortKey)}>{children}
    <Icon name={on ? (sort.dir < 0 ? "arrow-down" : "arrow-up") : "arrow-down-up"} /></button>;
}

function SortHeader({ sortKey, sort, className = "", children }) {
  const on = sort.key === sortKey;
  return <th className={`cap-sort${on ? " on" : ""}${className ? ` ${className}` : ""}`} aria-sort={on ? (sort.dir < 0 ? "descending" : "ascending") : undefined}>
    <SortButton sortKey={sortKey} sort={sort}>{children}</SortButton></th>;
}

/** "(714) 863-8900" never splits across lines. */
const keepPhoneTogether = (value) => String(value || "").replace(/\) (?=\d)/g, ") ").replace(/(\d)-(\d)/g, "$1‑$2");

/** Change-log entries of a record, newest first, for the Date Added / Last Updated cell. */
function logEntries(record) {
  return obHistory(record).slice().reverse().map((entry, index) => {
    const action = oneLine(entry.action || "", 140);
    const emailed = String(entry.action || "").trim() === OB_EMAIL_NOTE;
    const changed = entry.kind !== "created" && entry.prev && entry.prev !== entry.status;
    const title = entry.kind === "created" ? "Added" : emailed ? "Email opened in Outlook" : changed ? "Status changed" : "Update added";
    return {
      key: `${entry.ts}-${index}`, title, ts: entry.ts, created: entry.kind === "created",
      lines: [
        ...(entry.kind === "created" ? [`Status: ${obStatusLabel(entry.status)}`] : changed ? [`Status: ${obStatusLabel(entry.prev)} → ${obStatusLabel(entry.status)}`] : []),
        ...(action && !emailed ? [action] : []),
      ],
    };
  });
}

function EzTable({ ctx, rows, sort }) {
  const { items, pagerProps } = usePaged("ez", rows);
  return <div className="card" style={{ overflowX: "auto" }}><table className="is-table cap-table"><thead><tr>
    <SortHeader sortKey="num" sort={sort} className="c-snum">Store #</SortHeader>
    <th>Franchisee</th><th className="hide-sm">Email Address</th><th className="hide-sm cap-phone">Phone Number</th>
    <SortHeader sortKey="status" sort={sort} className="cap-statuscol">Status</SortHeader>
    <SortHeader sortKey="emailed" sort={sort} className="cap-duecol">Emailed</SortHeader>
    <th className="hide-sm cap-notes">Latest update</th>
    <th className="cap-sort cap-sort2 hide-sm cap-date"><SortButton sortKey="added" sort={sort}>Date Added</SortButton>
      <SortButton sortKey="updated" sort={sort}>Last Updated</SortButton></th>
    <th className="c-act">Actions</th>
  </tr></thead><tbody>
    {items.map(({ record, store, emailedAt }) => {
      const contact = storeContactDefaults(ctx, record.store_num);
      const storeEz = store ? platformStatus(store, "ez") : record.status;
      const open = obIsOpen(record);
      return <tr key={record.id}>
        <td className="c-snum">{store
          ? <button type="button" className="ob-snum" data-tip="Open store information" onClick={() => openStore(store.id)}>{record.store_num}</button>
          : <span className="cap-nostore" data-tip="Not in the store list">{record.store_num}</span>}
          {store && storeStatus(store) !== "Open" && <div style={{ marginTop: 3 }}><StoreStatusIfClosed status={storeStatus(store)} /></div>}</td>
        <td>{contact.name || <span className="muted">—</span>}</td>
        <td className="hide-sm cap-email">{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : <span className="muted">—</span>}</td>
        <td className="hide-sm cap-phone">{contact.phone ? <a href={telHref(contact.phone)}>{keepPhoneTogether(contact.phone)}</a> : <span className="muted">—</span>}</td>
        <td className="cap-statuscol"><div className="cap-statuswrap"><StatusSelect key={`${record.id}-${record.updated_at}`} record={record} />
          {open && <EmailButton record={record} emailedAt={emailedAt} email={contact.email} />}
          {storeEz !== record.status && <span className="wm-mismatch" role="img" aria-label={`Store's ezCater status is ${storeEz}`}
            data-tip={`The store's ezCater status is ${storeEz}. Changing the status here sets it to match.`}><Icon name="triangle-alert" /></span>}</div></td>
        <td className="cap-duecol">{!open ? <span className="muted">—</span>
          : emailedAt ? <div className="cap-due-cell"><span>{shortDay(emailedAt)}</span><span className="badge wm-sent"><Icon name="mail-check" />Emailed</span></div>
            : <span className="badge wm-unsent"><Icon name="mail" />Not emailed</span>}</td>
        <td className="hide-sm cap-notes">{record.last_update
          ? <button type="button" className="ez-upd" data-tip="See all updates" onClick={() => openOnboardingHistory(record.id)}><span className="cap-note">{oneLine(record.last_update, 160)}</span></button>
          : <span className="muted">—</span>}</td>
        <ChangeLogCell createdAt={record.created_at} updatedAt={record.updated_at} heading={`ezCater · Store ${record.store_num}`}
          label={`Store ${record.store_num}: change log`} entries={logEntries(record)} />
        <td className="c-act"><div className="row-acts">
          <button type="button" className="iconbtn mini" data-tip="Change the status or add a progress update" aria-label={`Update store ${record.store_num}`} onClick={() => openUpdateOnboarding(record.id)}><Icon name="pencil" /></button>
          <button type="button" className="iconbtn mini del" data-tip="Remove from the ezCater tab" aria-label={`Remove store ${record.store_num}`} onClick={() => askDeleteOnboarding(record.id)}><Icon name="trash-2" /></button>
        </div></td>
      </tr>;
    })}
  </tbody></table>
    <Pagination {...pagerProps} />
  </div>;
}

export default function EzCaterView() {
  const ctx = useDataContext();
  const filter = useUiStore((state) => state.ezFilter);
  const search = useUiStore((state) => state.search);
  const rows = useMemo(() => filterEzCater(ctx, filter, searchQuery(search)), [ctx, filter, search]);
  const summary = useMemo(() => ezProgress(ctx), [ctx]);
  useToolbarCount(ctx.onboardingReady && summary.total ? `${formatNumber(rows.length)} store${rows.length !== 1 ? "s" : ""} · ${formatNumber(summary.done)} onboarded` : "");

  if (!ctx.onboardingReady) return <EmptyState icon="database" title="The ezCater tab needs a quick database update">Run migrate-onboarding.sql in the Supabase SQL Editor, then click Refresh.</EmptyState>;
  if (!summary.total) {
    return <EmptyState icon="utensils" title="No stores on the ezCater tab yet"
      actions={<button type="button" className="btn round" onClick={() => openNewOnboarding({ platforms: ["ez"] })}><Icon name="plus" />Add store</button>}>
      Add the stores you're onboarding on ezCater. Each store's ezCater status follows its status here.</EmptyState>;
  }
  const anyFilter = !!(filter.statuses.length || filter.franchisees.length || filter.email || search.trim());
  return <>
    <EzProgress summary={summary} statuses={filter.statuses} email={filter.email} />
    <EzMeta rows={ezRecords(ctx)} />
    <EzFilters filter={filter} anyFilter={anyFilter} />
    {rows.length ? <EzTable ctx={ctx} rows={rows} sort={filter.sort} /> : <EmptyState icon="search-x" title="No stores match">Try a different search or filter.</EmptyState>}
  </>;
}
