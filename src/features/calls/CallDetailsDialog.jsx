import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { CallOutcomeBadge, FollowUpBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { callFollowUpDue, callFranchiseeName, callHistory, callPreviousName, callUpdateLabel, hasOpenFollowUp } from "../../domain/calls.js";
import { formatCallTime, formatTimestamp } from "../../lib/format.js";
import { useDataContext } from "../../state/dataStore.js";
import { openCallFollowUp, openCallLog, openStore } from "../../state/dialogs.js";
import { askDeleteCall } from "./callActions.js";
import CallContacts from "./CallContacts.jsx";

export default function CallDetailsDialog({ callId }) {
  const ctx = useDataContext();
  const { close } = useDialog();
  const call = ctx.callLogs.find((item) => item.id === callId);
  if (!call) return null;
  const when = formatCallTime(call.call_at);
  const store = call.store_num ? ctx.storeByNum.get(String(call.store_num)) : null;
  const previous = callPreviousName(ctx, call);
  const edited = call.updated_at && call.updated_at !== call.created_at ? formatTimestamp(call.updated_at) : "";
  const updates = callHistory(call);
  const due = callFollowUpDue(call);

  return <Modal size="wide" icon="phone" title="Call details" subtitle={`${when.date} · ${when.time}`} labelledBy="clv_title"
    footer={<>
      <button type="button" className="btn link danger" style={{ marginRight: "auto" }} onClick={() => askDeleteCall(call.id)}><Icon name="trash-2" />Delete</button>
      {store && <button type="button" className="btn ghost" onClick={() => { close(); openStore(store.id); }}><Icon name="store" />Open store</button>}
      {call.follow_up && <button type="button" className="btn outline round" onClick={() => { close(); openCallFollowUp(call.id); }}>
        <Icon name={call.follow_up_done_at ? "rotate-ccw" : "repeat"} />{call.follow_up_done_at ? "Reopen follow-up" : "Follow-up update"}</button>}
      <button type="button" className="btn" onClick={() => { close(); openCallLog(null, call.id); }}><Icon name="pencil" />Edit</button>
    </>}>
    <div className="clv-grid">
      <div className="clv-f"><span className="k">Franchisee</span><span className="v"><b>{callFranchiseeName(ctx, call)}</b>
        {previous && <small className="muted"> (logged as “{previous}”)</small>}</span></div>
      <div className="clv-f" style={{ gridColumn: "1 / -1" }}><span className="k">Franchisee contact</span><span className="v clv-con">
        <CallContacts ctx={ctx} franchiseeId={call.franchisee_id} emptyText="No phone or email saved for this franchisee" /></span></div>
      <div className="clv-f"><span className="k">Store</span><span className="v">{call.store_num
        ? <><b>{call.store_num}</b>{store && <> · {[store.address, store.city].filter(Boolean).join(", ")}</>}</>
        : <span className="muted">General (no specific store)</span>}</span></div>
      <div className="clv-f"><span className="k">Outcome</span><span className="v"><CallOutcomeBadge outcome={call.outcome} emptyText="Not set" /> <FollowUpBadge call={call} /></span></div>
      <div className="clv-f"><span className="k">Logged</span><span className="v muted">{formatTimestamp(call.created_at)}{edited && <> · edited {edited}</>}</span></div>
    </div>
    <div className="clv-block"><span className="k">Reason for call</span><div className="clv-text">{call.reason}</div></div>
    <div className="clv-block"><span className="k">Result of call</span><div className="clv-text">{call.result}</div></div>
    {hasOpenFollowUp(call) && call.next_follow_up_at && <div className={`clv-next${due ? " due" : ""}`}>
      <Icon name={due ? "bell-ring" : "calendar-clock"} /><span><b>{due ? "Follow-up due" : "Next follow-up"}</b> {formatTimestamp(call.next_follow_up_at)}</span></div>}
    <div className="clv-block"><span className="k">Updates — every change with date and time</span>
      {updates.length ? <div className="tl" style={{ marginTop: 8 }}>{updates.map((entry, index) => {
        const label = callUpdateLabel(entry);
        const color = entry.closed || entry.outcome === "Completed" ? "var(--ok)" : entry.kind === "follow-up" ? "var(--warn)" : entry.kind === "edited" ? "#2f7fbf" : "var(--green)";
        return <div className="tl-item" key={`${entry.ts}-${index}`}><div className="tl-dot" style={{ background: color }}>{index + 1}</div>
          <div className="tl-body"><div className="tl-head"><span className="what">{label}</span>
            {entry.prev && entry.outcome && entry.prev !== entry.outcome && <><CallOutcomeBadge outcome={entry.prev} /><Icon name="arrow-right" className="arrow" /></>}
            {entry.outcome && <CallOutcomeBadge outcome={entry.outcome} />}
            <span className="tl-time"><Icon name="clock" />{formatTimestamp(entry.ts)}</span></div>
            {entry.note && <div className="tl-act">{entry.note}</div>}
            {entry.changes?.length > 0 && <div className="tl-legacy">Changed: {entry.changes.join(", ")}</div>}
            {entry.next && <div className="tl-legacy">Next follow-up set for {formatTimestamp(entry.next)}</div>}
          </div></div>;
      })}</div> : <p className="muted">No updates recorded.</p>}
    </div>
  </Modal>;
}
