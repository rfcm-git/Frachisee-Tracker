import { useEffect } from "react";
import { dueReminders, formatClock } from "../../domain/schedules.js";
import { findDialog, isAnyFormOpen, useDialogStore } from "../../state/dialogStore.js";
import { DIALOG, openScheduleConfirm } from "../../state/dialogs.js";
import { notify, useNotificationStore } from "../../state/notificationStore.js";
import { isConfirmed, markReminded, useScheduleStore } from "../../state/scheduleStore.js";
import { openScheduleTarget } from "./scheduleActions.js";

const CHECK_MS = 30_000;

/** Occurrences waiting for the confirm dialog, oldest first. Kept in memory: a reload re-asks on the next repeat. */
let waiting = [];

function desktop(title, body, tag, onClick) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const notification = new Notification(title, { body, tag, requireInteraction: true });
      notification.onclick = () => { window.focus(); onClick(); notification.close(); };
    }
  } catch { /* The in-app notification is still there if desktop notifications fail. */ }
}

function remind({ schedule, key, time, kind }) {
  const at = formatClock(time);
  const title = kind === "repeat" ? `Still to do: ${schedule.name}` : schedule.name;
  const subtitle = schedule.confirm ? `Due ${at} · waiting for your confirmation` : `Scheduled for ${at}`;
  // A repeat replaces the earlier unconfirmed card, so the inbox keeps one per occurrence.
  useNotificationStore.setState((s) => ({ items: s.items.filter((item) => !(item.target?.type === "schedule" && item.target.key === key)) }));
  notify({
    title, subtitle, body: schedule.message, icon: schedule.icon || "calendar-clock", tone: kind === "repeat" ? "warn" : "",
    target: { type: "schedule", id: schedule.id, key, confirm: schedule.confirm, open: schedule.target },
  });
  desktop(title, schedule.message || subtitle, `sched-${key}`, () => {
    if (schedule.confirm) openScheduleConfirm(schedule.id, key);
    else openScheduleTarget(schedule.target);
  });
  if (schedule.confirm && !waiting.some((item) => item.key === key)) waiting.push({ id: schedule.id, key });
}

/** Opens the confirm dialog for the next waiting reminder, unless the user is in the middle of a form. */
function promptNext() {
  waiting = waiting.filter((item) => !isConfirmed(item.key));
  if (!waiting.length || findDialog(DIALOG.scheduleConfirm) || isAnyFormOpen()) return;
  const next = waiting.shift();
  openScheduleConfirm(next.id, next.key);
}

/** Raises the scheduled reminders (records update, CAP list update) at their set times while the app is open. */
export default function ScheduleReminderHost() {
  const schedules = useScheduleStore((s) => s.schedules);

  useEffect(() => {
    const check = () => {
      const due = dueReminders(schedules, useScheduleStore.getState().state, new Date());
      markReminded(due.map((item) => item.key));
      due.forEach(remind);
      promptNext();
    };
    check();
    const timer = window.setInterval(check, CHECK_MS);
    return () => window.clearInterval(timer);
  }, [schedules]);

  // When the last form closes, show a confirm dialog that was waiting.
  useEffect(() => useDialogStore.subscribe((state, prev) => {
    if (state.dialogs.length < prev.dialogs.length) window.setTimeout(promptNext, 400);
  }), []);

  return null;
}
