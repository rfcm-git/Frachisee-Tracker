/*
 * Scheduled reminders: tasks the user is reminded about at set times (update the records on Thursdays,
 * update the CAP list each morning). Each one can ask the user to confirm it was done, and keeps
 * reminding them until they do or the shift ends.
 */

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Where "Open" on a reminder leads. */
export const SCHEDULE_TARGETS = [["", "Nothing — just remind me"], ["caps", "CAP list"], ["franchisees", "Franchisees"], ["stores", "All Stores"], ["onboarding", "Onboarding"], ["issues", "Issues"]];

export const SCHEDULE_DEFAULTS = [
  {
    id: "records", name: "Update the records", icon: "clipboard-list",
    message: "Time to update the records. Confirm once they're up to date.",
    enabled: true, days: [4], times: ["08:00", "17:00"], confirm: true, repeatMin: 30, until: "17:00", target: "",
  },
  {
    id: "caps", name: "Update the CAP list", icon: "list-checks",
    message: "Start of shift: update the CAP list and confirm when it's done.",
    enabled: true, days: [0, 1, 2, 3, 4, 5, 6], times: ["08:00"], confirm: true, repeatMin: 30, until: "17:00", target: "caps",
  },
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (value) => TIME_RE.test(String(value || ""));
export const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** "17:00" -> "5:00 PM" */
export function formatClock(time) {
  if (!isTime(time)) return "";
  const date = new Date();
  date.setHours(Number(time.slice(0, 2)), Number(time.slice(3, 5)), 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Local calendar day, e.g. "2026-11-12". */
export function dayKey(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Fills in anything missing or invalid from the reminder's defaults. */
export function normalizeSchedule(saved, base) {
  const value = { ...base, ...(saved || {}) };
  const days = Array.isArray(value.days) ? [...new Set(value.days.map(Number).filter((day) => day >= 0 && day <= 6))].sort() : base.days;
  const times = Array.isArray(value.times) ? [...new Set(value.times.filter(isTime))].sort() : base.times;
  const repeatMin = Math.max(0, Math.min(240, Math.round(Number(value.repeatMin) || 0)));
  return {
    ...base,
    name: String(value.name || "").trim().slice(0, 60) || base.name,
    message: String(value.message ?? "").slice(0, 300),
    enabled: value.enabled !== false,
    days, times, repeatMin,
    confirm: value.confirm !== false,
    until: isTime(value.until) ? value.until : base.until,
    target: SCHEDULE_TARGETS.some(([key]) => key === value.target) ? value.target : base.target,
  };
}

export function loadSchedules(saved) {
  const byId = Object.fromEntries((Array.isArray(saved) ? saved : []).filter((item) => item?.id).map((item) => [item.id, item]));
  return SCHEDULE_DEFAULTS.map((base) => normalizeSchedule(byId[base.id], base));
}

/** "Every Thursday at 8:00 AM and 5:00 PM", "Every day at 8:00 AM" */
export function scheduleSummary(schedule) {
  if (!schedule.days.length || !schedule.times.length) return "No days or times set";
  const { days } = schedule;
  const weekdays = days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day));
  const when = days.length === 7 ? "Every day" : weekdays ? "Weekdays"
    : days.length === 1 ? `Every ${DAY_LONG[days[0]]}` : days.map((day) => DAY_NAMES[day]).join(", ");
  const times = schedule.times.map(formatClock);
  const at = times.length > 1 ? `${times.slice(0, -1).join(", ")} and ${times.at(-1)}` : times[0];
  return `${when} at ${at}`;
}

/** "Reminds again every 30 min until 5:00 PM until you confirm" */
export function repeatSummary(schedule) {
  if (!schedule.confirm) return "Reminds once, no confirmation needed";
  if (!schedule.repeatMin) return "Asks you to confirm; reminds once";
  return `Asks you to confirm; reminds again every ${schedule.repeatMin} min until ${formatClock(schedule.until)}`;
}

/** Occurrence key: one per reminder, day and time. */
export const occurrenceKey = (schedule, date, time) => `${schedule.id}|${dayKey(date)}|${time}`;

/**
 * Today's occurrences of a reminder that have started, each with when it may still remind.
 * A time at or after the "until" time reminds only once (it has no repeat window), but
 * can still be caught up later the same day if the app was closed.
 */
export function startedOccurrences(schedule, now) {
  if (!schedule.enabled || !schedule.days.includes(now.getDay())) return [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const untilMin = toMinutes(schedule.until);
  return schedule.times.filter((time) => toMinutes(time) <= nowMin).map((time) => {
    const start = toMinutes(time);
    // The next time slot of the same day takes over, so one occurrence never overlaps the next.
    const nextSlot = schedule.times.map(toMinutes).filter((min) => min > start).sort((a, b) => a - b)[0];
    const repeatEnd = Math.min(untilMin, nextSlot ?? 24 * 60);
    return { key: occurrenceKey(schedule, now, time), time, canRepeat: start < untilMin && nowMin < repeatEnd, catchUp: start >= untilMin || nowMin < untilMin };
  });
}

/**
 * What to do for each started occurrence now:
 *   "first"  — never reminded yet
 *   "repeat" — not confirmed and the repeat interval has passed
 * state: { [key]: { at, last, done } }
 */
export function dueReminders(schedules, state, now) {
  const due = [];
  schedules.forEach((schedule) => {
    startedOccurrences(schedule, now).forEach((occ) => {
      const entry = state[occ.key];
      if (entry?.done) return;
      if (!entry) {
        if (occ.catchUp) due.push({ schedule, ...occ, kind: "first" });
        return;
      }
      if (schedule.confirm && schedule.repeatMin && occ.canRepeat && now.getTime() - entry.last >= schedule.repeatMin * 60_000) {
        due.push({ schedule, ...occ, kind: "repeat" });
      }
    });
  });
  return due;
}

/** The latest open (unconfirmed) occurrence of a reminder today, if any. */
export function openOccurrence(schedule, state, now) {
  return startedOccurrences(schedule, now).reverse().find((occ) => state[occ.key] && !state[occ.key].done) || null;
}

/** Today's last occurrence of a reminder that was confirmed, if any. */
export function confirmedToday(schedule, state, now) {
  const today = `${schedule.id}|${dayKey(now)}|`;
  return Object.entries(state).filter(([key, entry]) => key.startsWith(today) && entry?.done)
    .map(([key, entry]) => ({ key, time: key.slice(today.length), doneAt: entry.done }))
    .sort((a, b) => b.doneAt - a.doneAt)[0] || null;
}
