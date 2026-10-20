import { ChartKey, HorizontalBars } from "../../components/charts/Charts.jsx";
import { InfoTip } from "../../components/ui/common.jsx";
import { CALL_ANSWERED, CALL_OUTCOMES, CHART_COLORS } from "../../config/constants.js";
import { callFranchiseeName } from "../../domain/calls.js";
import { addDays, formatNumber, percent, shortDate, startOfDay } from "../../lib/format.js";
import { showFranchiseeCalls } from "../../state/uiStore.js";

const OUTCOME_COLORS = {
  Answered: CHART_COLORS.green, Completed: CHART_COLORS.ok, "No answer / voicemail": CHART_COLORS.gray,
  "Follow-up required": CHART_COLORS.orange, "Requested more info": "#2f7fbf", "Not set": "#e3e8de",
};

/** Outcomes, calls per day (last 14 days) and most called franchisees for the filtered calls. */
export default function CallInsights({ ctx, calls, scopeNote }) {
  const counts = {};
  calls.forEach((call) => { const key = call.outcome || "Not set"; counts[key] = (counts[key] || 0) + 1; });
  const outcomeKeys = [...CALL_OUTCOMES, "Not set"].filter((key) => counts[key]);
  const answered = CALL_ANSWERED.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const unanswered = counts["No answer / voicemail"] || 0;
  const followUps = calls.filter((call) => call.follow_up);
  const followUpsDone = followUps.filter((call) => call.follow_up_done_at).length;

  const today = startOfDay(new Date());
  const days = [];
  for (let back = 13; back >= 0; back -= 1) {
    const from = addDays(today, -back);
    const to = addDays(from, 1);
    days.push({ label: shortDate(from), count: calls.filter((call) => { const date = new Date(call.call_at); return date >= from && date < to; }).length });
  }
  const maxDay = Math.max(1, ...days.map((day) => day.count));

  const byFranchisee = {};
  calls.forEach((call) => { const name = callFranchiseeName(ctx, call); byFranchisee[name] = (byFranchisee[name] || 0) + 1; });
  const top = Object.entries(byFranchisee).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return <div className="cl-ins">
    <div className="cl-in">
      <div className="db-sub">Outcomes<InfoTip text="Outcome picked when the call was logged. Answered = Answered, Requested more info or Completed. Unanswered = No answer / voicemail. Follow-up required and Not set are not counted as either." /></div>
      <HorizontalBars full rows={[{ label: "All calls", parts: outcomeKeys.map((key) => ({ label: key, value: counts[key], color: OUTCOME_COLORS[key] })) }]} />
      <ChartKey items={outcomeKeys.map((key) => [OUTCOME_COLORS[key], `${key} ${counts[key]}`])} />
      <div className="cl-mini">
        <span data-tip="Outcome Answered, Requested more info or Completed"><b>{formatNumber(answered)}</b> answered</span>
        <span data-tip="No answer or voicemail"><b>{formatNumber(unanswered)}</b> unanswered</span>
        <span data-tip="Follow-ups completed ÷ follow-ups requested"><b>{followUps.length ? `${percent(followUpsDone, followUps.length)}%` : "—"}</b> follow-ups done</span>
      </div>
    </div>
    <div className="cl-in">
      <div className="db-sub">Last 14 days<InfoTip text={`Calls per day for the last 14 days${scopeNote}.`} /></div>
      <div className="cl-spark">{days.map((day) => <span key={day.label} className="sb" style={{ height: `${Math.max(3, (day.count / maxDay) * 100)}%` }}
        data-tip={`${day.label}: ${day.count} call${day.count !== 1 ? "s" : ""}`} />)}</div>
      <div className="cl-spark-x"><span>{days[0].label}</span><span>Today</span></div>
    </div>
    <div className="cl-in">
      <div className="db-sub">Most called franchisees<InfoTip text={`Franchisees with the most calls${scopeNote}. Click to filter.`} /></div>
      {top.length ? <div className="cl-top">{top.map(([name, count]) => <button type="button" key={name} className="cl-topr" data-tip={`Show only calls to ${name}`}
        onClick={() => showFranchiseeCalls(name)}><span>{name}</span><b>{count}</b></button>)}</div>
        : <div className="db-empty">No calls</div>}
    </div>
  </div>;
}
