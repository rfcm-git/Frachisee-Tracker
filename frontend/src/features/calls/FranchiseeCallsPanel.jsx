import Icon from "../../components/ui/Icon.jsx";
import { CallOutcomeBadge, FollowUpBadge } from "../../components/ui/common.jsx";
import { clickableProps } from "../../components/ui/clickable.js";
import { hasOpenFollowUp } from "../../domain/calls.js";
import { formatCallTime } from "../../lib/format.js";
import { oneLine } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openCallDetails, openCallFollowUp, openCallLog } from "../../state/dialogs.js";
import { showFranchiseeCalls } from "../../state/uiStore.js";

/** Last calls to a franchisee, shown on the franchisee page. */
export default function FranchiseeCallsPanel({ franchisee }) {
  const ctx = useDataContext();
  if (!ctx.callLogsReady) return null;
  const calls = ctx.callLogs.filter((call) => call.franchisee_id === franchisee.id).sort((a, b) => new Date(b.call_at) - new Date(a.call_at));
  const followUps = calls.filter(hasOpenFollowUp).length;

  return <div className="panel" style={{ gridColumn: "1 / -1" }}>
    <div className="ph"><Icon name="phone" />Calls <span className="badge-num" style={{ background: "var(--lime-soft)", color: "var(--lime-dark)" }}>{calls.length}</span>
      {followUps > 0 && <span className="badge cl-fu-open" style={{ marginLeft: 6 }}><Icon name="flag" />{followUps} follow-up{followUps > 1 ? "s" : ""}</span>}
      <span className="ph-act" style={{ display: "flex", gap: 6 }}>
        {calls.length > 0 && <button type="button" className="btn link" onClick={() => showFranchiseeCalls(franchisee.name || "")}>See all</button>}
        <button type="button" className="call-btn" data-tip="Log Call" aria-label="Log a call to this franchisee" onClick={() => openCallLog(franchisee.id)}><Icon name="phone" /></button>
      </span>
    </div>
    <div className="pb">
      {calls.length ? calls.slice(0, 3).map((call) => {
        const when = formatCallTime(call.call_at);
        return <div className="issue-line" key={call.id} {...clickableProps(() => openCallDetails(call.id))}>
          <span className="cl-when sm"><b>{when.date}</b><span>{when.time}</span></span>
          <span className="val">{oneLine(call.reason, 80)}{call.store_num && <> <span className="muted">(#{call.store_num})</span></>}</span>
          <CallOutcomeBadge outcome={call.outcome} /><FollowUpBadge call={call} onClick={() => openCallFollowUp(call.id)} />
        </div>;
      }) : <p className="muted">No calls logged yet. Use the phone button to log one.</p>}
    </div>
  </div>;
}
