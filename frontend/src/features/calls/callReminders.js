import { STORAGE_KEYS } from "../../config/constants.js";

function read(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage can be disabled. */ }
}

/** "granted" | "denied" | "default" | "unsupported" */
export const notificationPermission = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

/** Asks once for desktop notifications (after a follow-up time is set). */
export function askNotificationPermission() {
  try {
    if (notificationPermission() === "default") return Notification.requestPermission();
  } catch { /* In-app reminders still work. */ }
  return Promise.resolve(notificationPermission());
}

export const getReminderState =() => ({
  reminded: read(STORAGE_KEYS.callReminded),
  snoozes: read(STORAGE_KEYS.callSnooze),
});

export function setReminderState(reminded, snoozes) {
  write(STORAGE_KEYS.callReminded, reminded);
  write(STORAGE_KEYS.callSnooze, snoozes);
}

export function clearCallSnooze(callId) {
  const snoozes = read(STORAGE_KEYS.callSnooze);
  delete snoozes[callId];
  write(STORAGE_KEYS.callSnooze, snoozes);
}

export function snoozeCallReminder(callId, until) {
  const snoozes = read(STORAGE_KEYS.callSnooze);
  snoozes[callId] = until;
  write(STORAGE_KEYS.callSnooze, snoozes);
}
