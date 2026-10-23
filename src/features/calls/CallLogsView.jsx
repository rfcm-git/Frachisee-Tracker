import { useMemo, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { KpiCard } from "../../components/charts/Charts.jsx";
import { CallOutcomeBadge, EmptyState, FollowUpBadge } from "../../components/ui/common.jsx";
import { clickableProps } from "../../components/ui/clickable.js";
import { usePaged } from "../../hooks/usePaged.js";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { CALL_OUTCOMES } from "../../config/constants.js";
import { anyCallFilter, callCounts, callFollowUpDue, callFranchiseeName, callLastActivity, callPreviousName, filterCalls, hasOpenFollowUp, latestCallUpdate } from "../../domain/calls.js";
import { searchQuery } from "../../domain/search.js";
import { addDays, formatCallTime, formatNumber, formatTimestamp, shortDate, startOfDay, startOfWeek } from "../../lib/format.js";
import { oneLine } from "../../lib/richText.js";
import { compareNumbers } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { openCallDetails, openCallFollowUp, openCallLog } from "../../state/dialogs.js";
import { resetCallFilters, setCallFilter, setCallView, toggleCallInsights, toggleCallSort, useUiStore } from "../../state/uiStore.js";
import { askDeleteCall } from "./callActions.js";
import CallContacts from "./CallContacts.jsx";
import CallCountsTable from "./CallCountsTable.jsx";
import CallInsights from "./CallInsights.jsx";

/** Text filter that applies on blur or Enter. Give it key={value} so it resets when the filter changes. */
function DraftInput({ value, onCommit, ...rest }) {
  const [draft, setDraft] = useState(value);
  return <input type="text" value={draft} onChange={(event) => setDraft(event.target.value)}
    onBlur={() => onCommit(draft.trim())} onKeyDown={(event) => { if (event.key === "Enter") onCommit(draft.trim()); }} {...rest} />;
}

function CallFilters({ ctx, filters, anyFilter }) {
  const stores = useMemo(() => [...new Set(ctx.callLogs.map((call) => call.store_num).filter(Boolean))].sort(compareNumbers), [ctx.callLogs]);
  return <div className="ifbar cl-filters" role="search" aria-label="Call log filters">
    <datalist id="cl_frlist">{ctx.franchisees.map((franchisee) => franchisee.name).filter(Boolean).map((name) => <option key={name} value={name} />)}</datalist>
    <datalist id="cl_stlist">{stores.map((num) => <option key={num} value={num} />)}</datalist>
    <label className="cl-fl"><span><Icon name="calendar" />Date</span>
      <select value={filters.range} onChange={(event) => setCallFilter("range", event.target.value)}>
        <option value="all">All time</option><option value="today">Today</option><option value="week">This week</option>
        <option value="month">This month</option><option value="30">Last 30 days</option><option value="custom">Date range…</option>
      </select></label>
    {filters.range === "custom" && <>
      <label className="cl-fl"><span>From</span><input type="date" value={filters.from} onChange={(event) => setCallFilter("from", event.target.value)} /></label>
      <label className="cl-fl"><span>To</span><input type="date" value={filters.to} onChange={(event) => setCallFilter("to", event.target.value)} /></label>
    </>}
    <label className="cl-fl"><span><Icon name="user-round" />Franchisee</span>
      <DraftInput key={filters.fr} list="cl_frlist" placeholder="Any franchisee" value={filters.fr} onCommit={(value) => setCallFilter("fr", value)} /></label>
    <label className="cl-fl"><span><Icon name="store" />Store #</span>
      <DraftInput key={filters.store} list="cl_stlist" placeholder="Any" style={{ width: 110 }} value={filters.store} onCommit={(value) => setCallFilter("store", value)} /></label>
    <label className="cl-fl"><span><Icon name="list-checks" />Outcome</span>
      <select value={filters.outcome} onChange={(event) => setCallFilter("outcome", event.target.value)}>
        <option value="">Any outcome</option>
        {CALL_OUTCOMES.map((outcome) => <option key={outcome} value={outcome}>{outcome}</option>)}
        <option value="__none">Outcome not set</option><option value="__fu_open">Follow-up still open</option><option value="__fu_done">Follow-up done</option>
      </select></label>
    {anyFilter && <button type="button" className="btn link" onClick={resetCallFilters} style={{ marginLeft: "auto" }}><Icon name="rotate-ccw" />Reset filters</button>}
  </div>;
}

const VIEW_OPTIONS = [["calls", "phone", "Calls"], ["franchisee", "user-round", "By franchisee"], ["store", "store", "By store"]];

/** View switch (calls list or call counts) and how many calls, franchisees and stores are shown out of all. */
function CallViewBar({ view, calls, allCount, franchisees, stores }) {
  const plural = (count, word) => `${formatNumber(count)} ${word}${count !== 1 ? "s" : ""}`;
  return <div className="cl-viewbar">
    <div className="cl-count-mode cl-view" role="group" aria-label="Call log view">
      {VIEW_OPTIONS.map(([key, icon, label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => setCallView(key)}><Icon name={icon} />{label}</button>)}
    </div>
    <div className="cl-totals" aria-live="polite">
      <span><b>{formatNumber(calls.length)}</b>{calls.length !== allCount ? <> of {formatNumber(allCount)}</> : ""} call{allCount !== 1 ? "s" : ""}</span>
      <span>to <b>{plural(franchisees, "franchisee")}</b></span>
      <span>about <b>{plural(stores, "store")}</b></span>
    </div>
  </div>;
}

function CallTable({ ctx, calls, sort }) {
  const { items, pagerProps } = usePaged("cl", calls);
  return <div className="card" style={{ overflowX: "auto" }}>
    <table className="cl-table"><thead><tr>
      <th className="sortable on" onClick={toggleCallSort} data-tip={`Date and time of the latest update. Click to sort ${sort === "desc" ? "oldest" : "newest"} first`} aria-sort={sort === "desc" ? "descending" : "ascending"}>
        Date and Time<Icon name={sort === "desc" ? "arrow-down" : "arrow-up"} /></th>
      <th>Franchisee Name</th><th>Store Number</th><th>Reason for Call</th><th>Result of Call</th><th className="c-act">Actions</th>
    </tr></thead><tbody>
      {items.map((call) => {
        const lastActivity = callLastActivity(call);
        const when = formatCallTime(new Date(lastActivity).toISOString());
        const name = callFranchiseeName(ctx, call);
        const previous = callPreviousName(ctx, call);
        const hasUpdate = lastActivity > new Date(call.call_at).getTime();
        const latestUpdate = latestCallUpdate(call);
        return <tr className="click" key={call.id} aria-label={`View call to ${name} on ${when.date}`} {...clickableProps(() => openCallDetails(call.id))}>
          <td><div className="cl-when" data-tip={hasUpdate ? `Latest update ${formatTimestamp(lastActivity)} · call made ${formatTimestamp(call.call_at)}` : `Call made ${formatTimestamp(call.call_at)}`}>
            <b>{when.date}</b><span>{when.time}</span>{hasUpdate && <small className="cl-updlbl"><Icon name="refresh-cw" />Updated</small>}</div></td>
          <td className="cl-fr">{name}<CallContacts ctx={ctx} franchiseeId={call.franchisee_id} variant="row" />
            {previous && <small data-tip="Name when the call was logged">was “{previous}”</small>}</td>
          <td className="cl-st">{call.store_num ? <b>{call.store_num}</b> : <span className="muted">General</span>}</td>
          <td className="cl-txt"><div className="cl-clamp">{call.reason || ""}</div></td>
          <td className="cl-txt"><div className="cl-res-top"><CallOutcomeBadge outcome={call.outcome} />
            <FollowUpBadge call={call} onClick={() => openCallFollowUp(call.id)} /></div>
            <div className="cl-clamp">{call.result || ""}</div>{latestUpdate?.note && <div className="cl-latest"><Icon name="message-square" /><span>{oneLine(latestUpdate.note, 120)}</span></div>}</td>
          <td className="c-act"><div className="row-acts">
            <button type="button" className="iconbtn mini" title="View full details" aria-label="View call" onClick={(event) => { event.stopPropagation(); openCallDetails(call.id); }}><Icon name="eye" /></button>
            <button type="button" className="iconbtn mini" title="Edit this call" aria-label="Edit call" onClick={(event) => { event.stopPropagation(); openCallLog(null, call.id); }}><Icon name="pencil" /></button>
            <button type="button" className="iconbtn mini del" title="Delete this call" aria-label="Delete call" onClick={(event) => { event.stopPropagation(); askDeleteCall(call.id); }}><Icon name="trash-2" /></button>
          </div></td>
        </tr>;
      })}
    </tbody></table>
    <Pagination {...pagerProps} />
  </div>;
}

export default function CallLogsView() {
  const ctx = useDataContext();
  const filters = useUiStore((state) => state.callFilters);
  const sort = useUiStore((state) => state.callSort);
  const insights = useUiStore((state) => state.callInsights);
  const search = useUiStore((state) => state.search);
  const view = useUiStore((state) => state.callView);

  const calls = useMemo(() => filterCalls(ctx, filters, searchQuery(search))
    .sort((a, b) => (sort === "desc" ? callLastActivity(b) - callLastActivity(a) : callLastActivity(a) - callLastActivity(b))), [ctx, filters, search, sort]);
  const byFranchisee = useMemo(() => callCounts(ctx, calls, "franchisee"), [ctx, calls]);
  const byStore = useMemo(() => callCounts(ctx, calls, "store"), [ctx, calls]);
  const storeCount = byStore.filter((row) => row.storeNum).length;
  const countText = view === "franchisee" ? `${formatNumber(byFranchisee.length)} franchisee${byFranchisee.length !== 1 ? "s" : ""}`
    : view === "store" ? `${formatNumber(storeCount)} store${storeCount !== 1 ? "s" : ""}` : "";
  useToolbarCount(ctx.callLogsReady ? `${formatNumber(calls.length)} call${calls.length !== 1 ? "s" : ""}${countText ? ` · ${countText}` : ""}` : "");

  if (!ctx.callLogsReady) return <EmptyState icon="database" title="Call Logs needs a quick database update">Run migrate-call-logs.sql in the Supabase SQL Editor, then click Refresh.</EmptyState>;

  const today = startOfDay(new Date());
  const weekStart = startOfWeek();
  const countBetween = (from, to) => calls.filter((call) => { const date = new Date(call.call_at); return date >= from && date < to; }).length;
  const followUps = calls.filter(hasOpenFollowUp).length;
  const dueNow = calls.filter((call) => callFollowUpDue(call)).length;
  const anyFilter = anyCallFilter(filters, search);
  const scopeNote = anyFilter ? " (matching your filters)" : "";

  return <>
    <div className="db-kpis cl-kpis">
      <KpiCard icon="phone" label="Total calls" value={formatNumber(calls.length)} sub={anyFilter ? "matching filters" : "all time"} tip={`Number of call logs${scopeNote}.`} />
      <KpiCard icon="calendar-check" label="Calls today" value={formatNumber(countBetween(today, addDays(today, 1)))} sub={shortDate(new Date())} tip={`Calls made today${scopeNote} (your computer's time zone).`} />
      <KpiCard icon="calendar-range" label="Calls this week" value={formatNumber(countBetween(weekStart, addDays(weekStart, 7)))} sub={`since ${shortDate(weekStart)}`} tip={`Calls made this week, Sunday to Saturday${scopeNote}.`} />
      <KpiCard icon="flag" label="Follow-ups required" value={formatNumber(followUps)} sub={followUps ? (dueNow ? <><span className="due-n">{dueNow} due now</span> · click to see</> : "click to see them") : "all caught up"}
        tip={`Calls marked “Needs follow-up” that are not done yet${scopeNote}.`} tone={followUps ? "warn" : ""}
        onClick={followUps ? () => setCallFilter("outcome", "__fu_open") : undefined} />
    </div>

    {ctx.callLogs.length > 0 && <>
      <div className="cl-inswrap">
        <button type="button" className="btn link cl-insbtn" aria-expanded={insights} onClick={toggleCallInsights}>
          <Icon name={insights ? "chevron-up" : "chevron-down"} />{insights ? "Hide" : "Show"} insights</button>
      </div>
      {insights && calls.length > 0 && <CallInsights ctx={ctx} calls={calls} scopeNote={scopeNote} />}
      <CallFilters ctx={ctx} filters={filters} anyFilter={anyFilter} />
      <CallViewBar view={view} calls={calls} allCount={ctx.callLogs.length} franchisees={byFranchisee.length} stores={storeCount} />
    </>}

    {!ctx.callLogs.length ? <EmptyState icon="phone" title="No call logs yet">Log a call from the Franchisee tab to get started — use the phone button next to any franchisee.</EmptyState>
      : !calls.length ? <EmptyState icon="search-x" title="No calls match">Try a different search, or reset the filters.</EmptyState>
        : view === "franchisee" ? <CallCountsTable rows={byFranchisee} calls={calls} by="franchisee" />
          : view === "store" ? <CallCountsTable rows={byStore} calls={calls} by="store" />
            : <CallTable ctx={ctx} calls={calls} sort={sort} />}
  </>;
}
