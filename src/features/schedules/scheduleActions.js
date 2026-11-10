import { formatClock } from "../../domain/schedules.js";
import { closeDialogType } from "../../state/dialogStore.js";
import { DIALOG } from "../../state/dialogs.js";
import { useNotificationStore } from "../../state/notificationStore.js";
import { confirmOccurrence, getSchedule, isConfirmed } from "../../state/scheduleStore.js";
import { toast } from "../../state/toastStore.js";
import { setTab, showCaps } from "../../state/uiStore.js";

const TAB_LABELS = { caps: "Open CAP list", franchisees: "Open Franchisees", stores: "Open All Stores", onboarding: "Open Onboarding", issues: "Open Issues" };

export const targetLabel = (target) => TAB_LABELS[target] || "";

/** Goes to the page the reminder is about. */
export function openScheduleTarget(target) {
  if (target === "caps") showCaps();
  else if (target) { setTab(target); window.scrollTo(0, 0); }
}

/**
 * Settles a confirmed reminder's notifications: the ones already in the box are marked done and read,
 * and a card still waiting on screen moves straight into the box instead of disappearing.
 */
export function settleNotifications(key, doneAt = Date.now()) {
  const ofKey = (item) => item.target?.type === "schedule" && item.target.key === key;
  const settle = (item) => ({ ...item, read: true, done: true, doneAt, tone: "ok" });
  useNotificationStore.setState((s) => ({
    items: [...s.incoming.filter(ofKey).map(settle), ...s.items.map((item) => (ofKey(item) ? settle(item) : item))],
    incoming: s.incoming.filter((item) => !ofKey(item)),
  }));
}

/** The user confirmed the task is done. */
export function confirmSchedule(key) {
  const [id, , time] = key.split("|");
  const schedule = getSchedule(id);
  const already = isConfirmed(key);
  confirmOccurrence(key);
  settleNotifications(key);
  closeDialogType(DIALOG.scheduleConfirm);
  if (!already) toast(`Confirmed: ${schedule?.name || "reminder"} (${formatClock(time)})`, "ok");
}
