import { useEffect, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import { callFollowUpDue, callFranchiseeName } from "../../domain/calls.js";
import { formatTimestamp } from "../../lib/format.js";
import { oneLine } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openCallDetails } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { dismissCallReminder, getReminderState, setReminderState, snoozeCallReminder } from "./callReminders.js";

function checkReminders(calls, ctx) {
  const { reminded, snoozes } = getReminderState();
  const now = Date.now();
  const visible = [];
  for (const call of calls) {
    if (!callFollowUpDue(call, now)) continue;
    const key = `${call.id}|${call.next_follow_up_at}`;
    if (snoozes[call.id] && snoozes[call.id] > now) continue;
    if (reminded[key] && !(snoozes[call.id] && snoozes[call.id] <= now)) {
      if (!reminded[`${key}|x`]) visible.push(call);
      continue;
    }
    reminded[key] = now;
    visible.push(call);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const notification = new Notification(`Follow-up due · ${callFranchiseeName(ctx, call)}`, {
          body: `${oneLine(call.reason, 120)}${call.store_num ? ` (Store ${call.store_num})` : ""}`,
          tag: `cl-${call.id}`,
        });
        notification.onclick = () => { window.focus(); openCallDetails(call.id); notification.close(); };
      }
    } catch { /* In-app reminders remain available if desktop notifications fail. */ }
  }
  Object.keys(snoozes).forEach((id) => { if (snoozes[id] <= now) delete snoozes[id]; });
  setReminderState(reminded, snoozes);
  return visible;
}

export default function CallReminderHost() {
  const ctx = useDataContext();
  const [reminders, setReminders] = useState([]);

  useEffect(() => {
    if (!ctx.callLogsReady) return undefined;
    const refresh = () => setReminders(checkReminders(ctx.callLogs, ctx));
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [ctx]);

  function open(call) {
    dismissCallReminder(call);
    setReminders((current) => current.filter((item) => item.id !== call.id));
    openCallDetails(call.id);
  }

  function snooze(call) {
    snoozeCallReminder(call.id, Date.now() + 15 * 60_000);
    setReminders((current) => current.filter((item) => item.id !== call.id));
    toast("Reminder snoozed for 15 minutes", "ok");
  }

  function dismiss(call) {
    dismissCallReminder(call);
    setReminders((current) => current.filter((item) => item.id !== call.id));
  }

  return <div className="rem-stack" aria-live="assertive" aria-label="Due call follow-ups">
    {reminders.map((call) => <section className="rem-card" key={call.id} role="alert">
      <div className="rem-top"><span className="rem-ic"><Icon name="bell-ring" /></span><div><b>Follow-up due</b>
        <span>{callFranchiseeName(ctx, call)}{call.store_num ? ` · Store ${call.store_num}` : ""}</span></div>
        <button type="button" className="x" aria-label="Dismiss reminder" onClick={() => dismiss(call)}>&times;</button></div>
      <div className="rem-body">{oneLine(call.reason, 120)}<small>Due {formatTimestamp(call.next_follow_up_at)}</small></div>
      <div className="rem-act"><button type="button" className="btn sm round" onClick={() => open(call)}><Icon name="phone" />Open call</button>
        <button type="button" className="btn sm ghost round" onClick={() => snooze(call)}><Icon name="alarm-clock" />Snooze 15 min</button></div>
    </section>)}
  </div>;
}
