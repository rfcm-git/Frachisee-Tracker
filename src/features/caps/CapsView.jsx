import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import ChangeLogCell from "../../components/ui/ChangeLogCell.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import FilterDropdown, { FilterOption } from "../../components/ui/FilterMenu.jsx";
import MenuButton, { MenuItem } from "../../components/ui/MenuButton.jsx";
import { CapDueBadge, EmptyState, InfoTip, StoreStatusIfClosed } from "../../components/ui/common.jsx";
import { usePaged } from "../../hooks/usePaged.js";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { CAP_DUE_SOON_DAYS, CAP_STATES, CAP_STATUS_COLOR } from "../../config/constants.js";
import { capChangeText, capHistory, capAssessmentId, capStatusClass, formatDueDate, normalizeCapStatus } from "../../domain/caps.js";
import { storeStatus } from "../../domain/records.js";
import { searchQuery } from "../../domain/search.js";
import { formatNumber, formatTimestamp, telHref, timeOf } from "../../lib/format.js";
import { useDataContext } from "../../state/dataStore.js";
import { openCapForm, openCapsImport, openStore } from "../../state/dialogs.js";
import { capStatusesAreDefault, clearCapsFilters, setCapDueFilter, setCapEmailFilter, setCapAssessmentFilter, sortCaps, toggleCapDueFilter, toggleCapOnlyStatus, toggleCapStatus, useUiStore } from "../../state/uiStore.js";
import { askBulkCapStatus, askBulkDeleteCaps, askDeleteCap, lastCapsImport, updateCap } from "./capsActions.js";
import { sendCapEmail } from "./capEmailActions.js";
import { capsProgress, filterCaps } from "./capsSelectors.js";

const SORT_LABELS = { num: "Store Number", aid: "Assessment ID", status: "Status", added: "Date Added", updated: "Last Updated", due: "Due Date" };
const EMAIL_LABELS = { has: "Has email", none: "No email" };
const ASSESSMENT_LABELS = { has: "Has Assessment ID", none: "No Assessment ID" };
const DUE_LABELS = { overdue: "Overdue", today: "Due today", week: "Due in 7 days", none: "No due date" };

/** Title of a log entry: "Added", "Added by import", "Status changed", "Updated", "Updated by import". */
function logTitle(entry) {
  const imported = entry.source === "import" ? " by import" : "";
  if (entry.kind === "created") return `Added${imported}`;
  if (entry.legacy) return "Last updated";
  const changes = entry.changes || [];
  return changes.length === 1 && changes[0].field === "status" && !imported ? "Status changed" : `Updated${imported}`;
}

/** Date added / last updated, with the record's change log on hover. */
function AddedUpdatedCell({ record, historyReady }) {
  const entries = capHistory(record).slice().reverse().map((entry, index) => ({
    key: `${entry.ts}-${index}`, title: logTitle(entry), ts: entry.ts, created: entry.kind === "created",
    lines: [
      ...(entry.kind === "created" && entry.status ? [`Status: ${normalizeCapStatus(entry.status)}`] : []),
      ...(entry.changes || []).map(capChangeText),
      ...(entry.legacy ? ["Changed before the log was kept, so the details were not recorded."] : []),
    ],
  }));
  return <ChangeLogCell createdAt={record.created_at} updatedAt={record.updated_at} heading={`Change log · Store ${record.store_num}`}
    label={`Store ${record.store_num}: change log`} entries={entries}
    footer={historyReady ? null : "Run migrate-caps-history.sql to keep a full log of every change."} />;
}

/** Status filter button text: "All but Completed" (the default), "All statuses", or the picked ones. */
function statusText(statuses) {
  if (!statuses.length) return "All statuses";
  return capStatusesAreDefault(statuses) ? "All but Completed" : statuses.join(", ");
}

/** "Store Number ↑" etc. */
function sortText(sort) {
  if (sort.key === "added" || sort.key === "updated") return `${SORT_LABELS[sort.key]} · ${sort.dir < 0 ? "newest" : "oldest"}`;
  if (sort.key === "due") return `Due Date · ${sort.dir > 0 ? "soonest first" : "latest first"}`;
  if (sort.key === "status") return `Status · ${sort.dir > 0 ? "No Action Yet first" : "Completed first"}`;
  if (sort.key === "aid") return `Assessment ID · ${sort.dir > 0 ? "low to high" : "high to low"}`;
  return `Store Number · ${sort.dir > 0 ? "low to high" : "high to low"}`;
}

/** One-line progress strip: counts per status (click to filter) and the completion bar. All records, not affected by filters. */
export function CapsProgress({ summary, statuses = [], due = "", showDue = true, onStatus = toggleCapOnlyStatus, onTotal = () => toggleCapStatus(""), onDue = toggleCapDueFilter }) {
  return <div className="cap-prog" role="group" aria-label="CAPs progress">
    <button type="button" className={`cap-cnt total${!statuses.length ? " on" : ""}`} data-tip="All stores in the CAP list — click to show all" onClick={onTotal}>
      <b>{formatNumber(summary.total)}</b>Total stores</button>
    {CAP_STATES.map((status) => {
      const on = statuses.length === 1 && statuses[0] === status;
      return <button type="button" key={status} className={`cap-cnt${on ? " on" : ""}${summary.counts[status] ? "" : " zero"}`} aria-pressed={on}
        data-tip={`${status}: ${summary.counts[status]}${on ? " — click again to go back" : " — click to show only these"}`} onClick={() => onStatus(status)}>
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

/** When the list was last imported (with what changed) and last changed by anyone. */
function CapsLastImport({ ctx }) {
  const info = lastCapsImport(ctx);
  const lastChange = ctx.caps.reduce((latest, record) => Math.max(latest, timeOf(record.updated_at || record.created_at)), 0);
  const counts = info ? [info.added && `${formatNumber(info.added)} added`, info.completed && `${formatNumber(info.completed)} completed`,
    info.statusChanged && `${formatNumber(info.statusChanged)} status${info.statusChanged === 1 ? "" : "es"} changed`,
    info.assessed && `${formatNumber(info.assessed)} Assessment ID${info.assessed === 1 ? "" : "s"} added`,
    info.updated && `${formatNumber(info.updated)} due date${info.updated === 1 ? "" : "s"} updated`].filter(Boolean) : [];
  return <div className="cap-meta">
    <span data-tip={info ? `Imported ${formatTimestamp(info.at)}${info.file ? ` from ${info.file}` : ""}` : "No spreadsheet has been imported yet"}>
      <Icon name="upload" />Last import: <b>{info ? formatTimestamp(info.at) : "never"}</b>
      {info && <span className="muted"> · {counts.length ? counts.join(" · ") : "no changes"}{info.file ? ` · ${info.file}` : ""}</span>}</span>
    {lastChange > 0 && <span data-tip="Last time any store in the CAP list was added or changed (import, edit or status change)">
      <Icon name="history" />List last updated: <b>{formatTimestamp(lastChange)}</b></span>}
  </div>;
}

function CapsFilters({ filter, anyFilter, showDue, showAssessment }) {
  const sort = filter.sort;
  const sortOption = (key, dir, icon, label, close) => <FilterOption key={`${key}${dir}`} selected={sort.key === key && sort.dir === dir}
    onClick={() => { sortCaps(key, dir); close(); }}><Icon name={icon} />{label}</FilterOption>;
  return <div className="ifbar"><div className="grp fdd-grp">
    <FilterDropdown icon="filter" label="Status" value={statusText(filter.statuses)} active={!capStatusesAreDefault(filter.statuses)}>
      <FilterOption selected={!filter.statuses.length} onClick={() => toggleCapStatus("")}><span className="d" style={{ background: "var(--line)" }} />All statuses</FilterOption>
      <div className="fdd-div" />
      {CAP_STATES.map((status) => <FilterOption key={status} selected={filter.statuses.includes(status)} checkable onClick={() => toggleCapStatus(status)}>
        <span className="d" style={{ background: CAP_STATUS_COLOR[status] }} />{status}</FilterOption>)}
      <div className="fdd-note">Pick one or more. Completed is unchecked at first — check it to see completed CAPs.</div>
    </FilterDropdown>
    <FilterDropdown icon="mail" label="Email" value={EMAIL_LABELS[filter.email] || ""} active={!!filter.email}>
      {({ close }) => <>
        <FilterOption selected={!filter.email} onClick={() => { setCapEmailFilter(""); close(); }}>All stores</FilterOption>
        <FilterOption selected={filter.email === "has"} onClick={() => { setCapEmailFilter("has"); close(); }}>Has an email address</FilterOption>
        <FilterOption selected={filter.email === "none"} onClick={() => { setCapEmailFilter("none"); close(); }}>No email address</FilterOption>
      </>}
    </FilterDropdown>
    {showAssessment && <FilterDropdown icon="map-pin" label="Assessment ID" value={ASSESSMENT_LABELS[filter.assessment] || ""} active={!!filter.assessment}>
      {({ close }) => <>
        <FilterOption selected={!filter.assessment} onClick={() => { setCapAssessmentFilter(""); close(); }}>All stores</FilterOption>
        <FilterOption selected={filter.assessment === "has"} onClick={() => { setCapAssessmentFilter("has"); close(); }}>Has an Assessment ID</FilterOption>
        <FilterOption selected={filter.assessment === "none"} onClick={() => { setCapAssessmentFilter("none"); close(); }}>No Assessment ID</FilterOption>
      </>}
    </FilterDropdown>}
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
        {showAssessment && sortOption("aid", 1, "arrow-up-narrow-wide", "Assessment ID · low to high", close)}
        {showAssessment && sortOption("aid", -1, "arrow-down-wide-narrow", "Assessment ID · high to low", close)}
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
    <InfoTip text={`Filters and sorting work together with the search box. Search by store # (#123), franchisee (@name)${showAssessment ? ", Assessment ID" : ""}, email, phone, status or notes. A store #${showAssessment ? " or Assessment ID" : ""} search also finds CAPs the filters hide. You can also click a column title to sort.`} />
    {anyFilter && <button type="button" className="btn link" onClick={clearCapsFilters} style={{ marginLeft: "auto" }}><Icon name="x" />Clear filters</button>}
  </div>;
}

/** Status picker inside the table row; saves right away. */
function StatusSelect({ record }) {
  const [saving, setSaving] = useState(false);
  const status = normalizeCapStatus(record.status);
  return <span className={`cap-pill ${capStatusClass(status)}${saving ? " busy" : ""}`}>
    <span className="d" style={{ background: CAP_STATUS_COLOR[status] }} aria-hidden="true" />
    <select className="cap-sel" value={status} disabled={saving} aria-label={`Status of store ${record.store_num}`} aria-busy={saving}
      onChange={async (event) => {
        setSaving(true);
        await updateCap(record, { status: event.target.value });
        setSaving(false);
      }}>
      {CAP_STATES.map((value) => <option key={value} value={value}>{value}</option>)}
    </select>
    <Icon name="chevron-down" className="car" />
  </span>;
}

/** Opens the store's CAP email in Outlook and sets Email Sent. Dimmed once the store is past No Action Yet (it asks first). */
function EmailButton({ record, email }) {
  const status = normalizeCapStatus(record.status);
  const fresh = status === CAP_STATES[0];
  const tip = !email ? "No email address on file — add one with Edit"
    : fresh ? `Open the CAP email to ${email} in Outlook · status → Email Sent` : status === "Email Sent" ? "Already emailed — click to email again" : `${status} — click to email (status → Email Sent)`;
  return <button type="button" className={`iconbtn mini cap-mailbtn${!email ? " off" : fresh ? " fresh" : " done"}`} aria-disabled={!email} data-tip={tip}
    aria-label={`Email store ${record.store_num}`} onClick={() => sendCapEmail(record.id)}><Icon name={fresh ? "send" : "mail-check"} /></button>;
}

function SortButton({ sortKey, sort, children }) {
  const on = sort.key === sortKey;
  return <button type="button" className={on ? "on" : ""} data-tip={`Sort by ${SORT_LABELS[sortKey]}`} onClick={() => sortCaps(sortKey)}>{children}
    <Icon name={on ? (sort.dir < 0 ? "arrow-down" : "arrow-up") : "arrow-down-up"} /></button>;
}

function SortHeader({ sortKey, sort, className = "", extra = null, children }) {
  const on = sort.key === sortKey;
  const button = <SortButton sortKey={sortKey} sort={sort}>{children}</SortButton>;
  return <th className={`cap-sort${on ? " on" : ""}${className ? ` ${className}` : ""}`} aria-sort={on ? (sort.dir < 0 ? "descending" : "ascending") : undefined}>
    {extra ? <div className="cap-th">{button}{extra}</div> : button}</th>;
}

/** Contact value; muted when it comes from the store records. The tip shows the full value (long emails are cut with "…") and where it comes from. */
function ContactValue({ value, text = value, fromStore, href, empty = "—" }) {
  if (!value) return <span className="muted">{empty}</span>;
  return <span className={fromStore ? "cap-fromstore" : ""} data-tip={`${value} · ${fromStore ? "from the store records" : "saved on this CAP record"}`}>
    {href ? <a href={href} onClick={(event) => event.stopPropagation()}>{text}</a> : text}</span>;
}

/** "(714) 863-8900" never splits across lines; extra text such as "(Store)" can still wrap. */
const keepPhoneTogether = (value) => String(value || "").replace(/\) (?=\d)/g, ")\u00a0").replace(/(\d)-(\d)/g, "$1\u2011$2");

/** Clicks on these inside a row do their own thing and don't select the row. */
const isControl = (target) => !!target.closest("button, a, select, input, textarea, label, [role='dialog']");

const plural = (count, word) => `${formatNumber(count)} ${word}${count === 1 ? "" : "s"}`;

/** Shown in a selection menu while nothing is selected. */
function NothingSelected({ total, onSelectAll }) {
  return <>
    <div className="mnu-note">No stores selected yet. Click rows in the list to select them — Shift+click selects a range.</div>
    <MenuItem onSelect={onSelectAll}><Icon name="check-check" />Select all {formatNumber(total)}</MenuItem>
  </>;
}

/** Icon beside the Status column title: changes the status of the selected stores. */
function BulkStatusMenu({ selected, total, onSelectAll, onDone }) {
  const count = selected.length;
  return <MenuButton align="right" className={`cap-hbtn${count ? " on" : ""}`} trigger={<Icon name="refresh-cw" />}
    label={count ? `Change the status of ${plural(count, "selected store")}` : "Change the status of selected stores"}
    tip={count ? `Change the status of ${plural(count, "selected store")}` : "Change the status of selected stores"}>
    {count ? <>
      <div className="mnu-head">Change {plural(count, "selected store")} to</div>
      {CAP_STATES.map((status) => <MenuItem key={status} onSelect={() => askBulkCapStatus(selected, status, onDone)}>
        <span className="d" style={{ background: CAP_STATUS_COLOR[status] }} />{status}</MenuItem>)}
    </> : <NothingSelected total={total} onSelectAll={onSelectAll} />}
  </MenuButton>;
}

/** Icon beside the Actions column title: select all, clear, or delete the selected stores. Shows how many are selected. */
function SelectionMenu({ selected, total, onSelectAll, onClear }) {
  const count = selected.length;
  return <MenuButton align="right" className={`cap-hbtn${count ? " on" : ""}`}
    trigger={<><Icon name="check-check" />{count > 0 && <span className="cap-hcount">{count > 99 ? "99+" : count}</span>}</>}
    label={count ? `${plural(count, "store")} selected — selection options` : "Select stores"}
    tip={count ? `${plural(count, "store")} selected` : "Select stores"}>
    {count ? <>
      <div className="mnu-head">{plural(count, "store")} selected</div>
      {count < total && <MenuItem onSelect={onSelectAll}><Icon name="check-check" />Select all {formatNumber(total)}</MenuItem>}
      <MenuItem onSelect={onClear}><Icon name="x" />Clear selection</MenuItem>
      <div className="mnu-div" />
      <MenuItem danger onSelect={() => askBulkDeleteCaps(selected, onClear)}><Icon name="trash-2" />Delete {plural(count, "selected store")}</MenuItem>
    </> : <NothingSelected total={total} onSelectAll={onSelectAll} />}
  </MenuButton>;
}

function CapsTable({ ctx, rows, sort, showDue, showAssessment, picked, onPick, selected, onSelectAll, onClear }) {
  const { items, pagerProps } = usePaged("cap", rows);
  return <div className="card" style={{ overflowX: "auto" }}><table className="is-table cap-table" role="grid" aria-multiselectable="true"><thead><tr>
    <SortHeader sortKey="num" sort={sort} className="c-snum">Store #</SortHeader>
    {showAssessment && <SortHeader sortKey="aid" sort={sort} className="cap-aid">Assessment ID</SortHeader>}
    <th className="cap-fr">Franchisee</th><th className="hide-sm cap-contact">Contact</th>
    <SortHeader sortKey="status" sort={sort} className="cap-statuscol"
      extra={<BulkStatusMenu selected={selected} total={rows.length} onSelectAll={onSelectAll} onDone={onClear} />}>Status</SortHeader>
    {showDue && <SortHeader sortKey="due" sort={sort} className="cap-duecol">Due Date</SortHeader>}
    <th className="cap-sort cap-sort2 hide-sm cap-date"><SortButton sortKey="added" sort={sort}>Date Added</SortButton>
      <SortButton sortKey="updated" sort={sort}>Last Updated</SortButton></th>
    <th className="c-act"><div className="cap-th">Actions
      <SelectionMenu selected={selected} total={rows.length} onSelectAll={onSelectAll} onClear={onClear} /></div></th>
  </tr></thead><tbody>
    {items.map(({ record, contact }) => {
      const store = ctx.storeByNum.get(String(record.store_num));
      const on = picked.has(record.id);
      return <tr key={record.id} className={on ? "cap-selrow" : ""} aria-selected={on} tabIndex={0}
        onMouseDown={(event) => { if (event.shiftKey && !isControl(event.target)) event.preventDefault(); }}
        onClick={(event) => {
          if (isControl(event.target) || String(window.getSelection?.() || "")) return;
          onPick(record.id, event.shiftKey);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || (event.key !== " " && event.key !== "Enter")) return;
          event.preventDefault();
          onPick(record.id, event.shiftKey);
        }}>
        <td className="c-snum">{store
          ? <button type="button" className="ob-snum" data-tip="Open store information" onClick={() => openStore(store.id)}>{record.store_num}</button>
          : <span className="cap-nostore" data-tip="Not in the store list">{record.store_num}</span>}
          {store && storeStatus(store) !== "Open" && <div style={{ marginTop: 3 }}><StoreStatusIfClosed status={storeStatus(store)} /></div>}</td>
        {showAssessment && <td className="cap-aid">{capAssessmentId(record) || <button type="button" className="btn link cap-setdue" data-tip="Add the Assessment ID"
          aria-label={`Add the Assessment ID of store ${record.store_num}`} onClick={() => openCapForm(record.id)}><Icon name="plus" />Add</button>}</td>}
        <td className="cap-fr"><div className="cap-clamp"><ContactValue value={contact.name} fromStore={contact.fromStore.name} /></div></td>
        <td className="hide-sm cap-contact">
          <div className="cap-cline"><Icon name="mail" /><ContactValue value={contact.email} fromStore={contact.fromStore.email} empty="No email"
            href={contact.email ? `mailto:${contact.email}` : ""} /></div>
          <div className="cap-cline"><Icon name="phone" /><ContactValue value={contact.phone} text={keepPhoneTogether(contact.phone)} fromStore={contact.fromStore.phone} empty="No phone"
            href={contact.phone ? telHref(contact.phone) : ""} /></div>
        </td>
        <td className="cap-statuscol"><div className="cap-statuswrap"><StatusSelect key={`${record.id}-${record.updated_at}`} record={record} />
          <EmailButton record={record} email={contact.email} /></div></td>
        {showDue && <td className="cap-duecol">{record.due_date
          ? <div className="cap-due-cell"><span>{formatDueDate(record.due_date)}</span><CapDueBadge record={record} /></div>
          : normalizeCapStatus(record.status) === "Completed" ? <span className="muted">—</span>
            : <button type="button" className="btn link cap-setdue" data-tip="Set a submission due date" onClick={() => openCapForm(record.id)}><Icon name="calendar" />Set</button>}</td>}
        <AddedUpdatedCell record={record} historyReady={ctx.capsHistoryReady} />
        <td className="c-act"><div className="row-acts">
          {record.notes && <button type="button" className="iconbtn mini cap-notebtn" data-tip={`Notes: ${record.notes}`} aria-label={`Notes for store ${record.store_num}: ${record.notes}`}
            onClick={() => openCapForm(record.id)}><Icon name="sticky-note" /></button>}
          <button type="button" className="iconbtn mini" data-tip="Edit details, status and notes" aria-label="Edit" onClick={() => openCapForm(record.id)}><Icon name="pencil" /></button>
          <button type="button" className="iconbtn mini del" data-tip="Remove from the CAP list" aria-label="Remove" onClick={() => askDeleteCap(record.id)}><Icon name="trash-2" /></button>
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
  const rows = useMemo(() => {
    const hiddenSort = (!ctx.capsDueReady && filter.sort.key === "due") || (!ctx.capsAssessmentReady && filter.sort.key === "aid");
    const shown = { ...filter, due: ctx.capsDueReady ? filter.due : "", assessment: ctx.capsAssessmentReady ? filter.assessment : "", sort: hiddenSort ? { key: "added", dir: -1 } : filter.sort };
    return filterCaps(ctx, shown, searchQuery(search));
  }, [ctx, filter, search]);
  const summary = useMemo(() => capsProgress(ctx), [ctx]);
  // Selected record ids. Only rows in the current list count, so filtering never acts on hidden rows.
  const [picked, setPicked] = useState(() => new Set());
  const lastPicked = useRef(null);
  const selected = useMemo(() => rows.filter((row) => picked.has(row.record.id)).map((row) => row.record), [rows, picked]);
  const shownPicked = useMemo(() => new Set(selected.map((record) => record.id)), [selected]);
  /** Click toggles one row; Shift+click sets every row between the last clicked one and this one. */
  function pickRow(id, range) {
    const ids = rows.map((row) => row.record.id);
    const from = range && lastPicked.current != null ? ids.indexOf(lastPicked.current) : -1;
    const to = ids.indexOf(id);
    setPicked((current) => {
      const next = new Set([...current].filter((item) => ids.includes(item)));
      if (from >= 0 && to >= 0) {
        const turnOn = !current.has(id);
        ids.slice(Math.min(from, to), Math.max(from, to) + 1).forEach((item) => (turnOn ? next.add(item) : next.delete(item)));
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastPicked.current = id;
  }
  const clearPicked = () => { setPicked(new Set()); lastPicked.current = null; };
  const pickAll = () => setPicked(new Set(rows.map((row) => row.record.id)));
  useToolbarCount(ctx.capsReady ? `${formatNumber(rows.length)} store${rows.length !== 1 ? "s" : ""} · ${formatNumber(summary.completed)} completed${selected.length ? ` · ${formatNumber(selected.length)} selected` : ""}` : "");

  if (!ctx.capsReady) return <EmptyState icon="database" title="The CAP tab needs a quick database update">Run migrate-caps.sql in the Supabase SQL Editor, then click Refresh. Other tabs are not affected.</EmptyState>;
  if (!ctx.caps.length) {
    return <EmptyState icon="list-checks" title="No stores in the CAP list yet"
      actions={<><button type="button" className="btn round" onClick={() => openCapForm()}><Icon name="plus" />Add store</button>
        <button type="button" className="btn outline round" onClick={openCapsImport}><Icon name="upload" />Import spreadsheet</button></>}>
      Add a single store, or import many from an Excel spreadsheet.</EmptyState>;
  }
  const showDue = ctx.capsDueReady;
  const showAssessment = ctx.capsAssessmentReady;
  const outside = rows.filter((row) => row.outsideFilters).length;
  const anyFilter = !!(!capStatusesAreDefault(filter.statuses) || filter.email || (showAssessment && filter.assessment) || (showDue && filter.due) || search.trim());
  return <>
    {!showDue && <div className="warnbox show cap-migrate"><Icon name="database" /><div>
      <b>Submission due dates need a quick database update.</b> Run <code>migrate-caps-due-date.sql</code> in the Supabase SQL Editor, then click Refresh. Everything else in the CAP list works as before.</div></div>}
    {!showAssessment && <div className="warnbox show cap-migrate"><Icon name="database" /><div>
      <b>Assessment IDs and the In Review status need a quick database update.</b> Run <code>migrate-caps-assessment-id.sql</code> in the Supabase SQL Editor, then click Refresh. Everything else in the CAP list works as before.</div></div>}
    <CapsProgress summary={summary} statuses={filter.statuses} due={filter.due} showDue={showDue} />
    <CapsLastImport ctx={ctx} />
    <CapsFilters filter={filter} anyFilter={anyFilter} showDue={showDue} showAssessment={showAssessment} />
    {outside > 0 && <div className="cap-outside" role="status"><Icon name="info" />
      {outside === 1 ? "1 store matches" : `${formatNumber(outside)} stores match`} your search by store #{showAssessment ? " or Assessment ID" : ""} but {outside === 1 ? "is" : "are"} hidden by the filters — shown anyway.</div>}
    <div className="cap-sr" role="status" aria-live="polite">{selected.length ? `${plural(selected.length, "store")} selected` : ""}</div>
    {rows.length ? <CapsTable ctx={ctx} rows={rows} sort={filter.sort} showDue={showDue} showAssessment={showAssessment} picked={shownPicked} onPick={pickRow}
      selected={selected} onSelectAll={pickAll} onClear={clearPicked} /> : <EmptyState icon="search-x" title="No stores match">Try a different search or filter.</EmptyState>}
  </>;
}
