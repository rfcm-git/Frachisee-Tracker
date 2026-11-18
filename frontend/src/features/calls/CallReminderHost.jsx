import { useEffect } from "react";
import { callFollowUpDue, callFranchiseeName } from "../../domain/calls.js";
import { formatTimestamp } from "../../lib/format.js";
import { oneLine } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openCallDetails } from "../../state/dialogs.js";
import { notify } from "../../state/notificationStore.js";
import { getReminderState, setReminderState } from "./callReminders.js";

/** Returns the calls whose follow-up just became due (or whose snooze just ran out). */
function newlyDue(calls, now) {
  const { reminded, snoozes } = getReminderState();
  const due = [];
  for (const call of calls) {
    if (!callFollowUpDue(call, now)) continue;
    const key = `${call.id}|${call.next_follow_up_at}`;
    if (snoozes[call.id] && snoozes[call.id] > now) continue;
    if (reminded[key] && !(snoozes[call.id] && snoozes[call.id] <= now)) continue;
    reminded[key] = now;
    due.push(call);
  }
  Object.keys(snoozes).forEach((id) => { if (snoozes[id] <= now) delete snoozes[id]; });
  setReminderState(reminded, snoozes);
  return due;
}

function remind(call, ctx) {
  const who = `${callFranchiseeName(ctx, call)}${call.store_num ? ` · Store ${call.store_num}` : ""}`;
  const reason = oneLine(call.reason, 120);
  notify({
    title: "Follow-up due",
    subtitle: `${who} · Due ${formatTimestamp(call.next_follow_up_at)}`,
    body: reason,
    icon: "bell-ring",
    tone: "warn",
    target: { type: "call", id: call.id },
  });
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const notification = new Notification(`Follow-up due · ${callFranchiseeName(ctx, call)}`, {
        body: `${reason}${call.store_num ? ` (Store ${call.store_num})` : ""}`,
        tag: `cl-${call.id}`,
      });
      notification.onclick = () => { window.focus(); openCallDetails(call.id); notification.close(); };
    }
  } catch { /* The in-app notification is still there if desktop notifications fail. */ }
}

/** Watches call follow-ups and raises a notification when one comes due. */
export default function CallReminderHost() {
  const ctx = useDataContext();

  useEffect(() => {
    if (!ctx.callLogsReady) return undefined;
    const refresh = () => newlyDue(ctx.callLogs, Date.now()).forEach((call) => remind(call, ctx));
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [ctx]);

  return null;
}
