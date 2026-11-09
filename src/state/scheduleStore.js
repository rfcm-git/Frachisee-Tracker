/* Scheduled reminders: their settings (editable in Settings) and which occurrences were reminded or confirmed. */
import { create } from "zustand";
import { STORAGE_KEYS } from "../config/constants.js";
import { SCHEDULE_DEFAULTS, dayKey, loadSchedules, normalizeSchedule } from "../domain/schedules.js";
import { local } from "../lib/storage.js";

const KEEP_DAYS = 3;

const readState = () => local.getJson(STORAGE_KEYS.scheduleState, {}) || {};

export const useScheduleStore = create(() => ({
  schedules: loadSchedules(local.getJson(STORAGE_KEYS.schedules, null)),
  /** { [occurrenceKey]: { at, last, done } } — first reminded, last reminded, confirmed (ms) */
  state: readState(),
}));

useScheduleStore.subscribe((next, prev) => {
  if (next.schedules !== prev.schedules) local.setJson(STORAGE_KEYS.schedules, next.schedules);
  if (next.state !== prev.state) local.setJson(STORAGE_KEYS.scheduleState, next.state);
});

// Another tab confirmed or changed a reminder: pick it up so the same reminder is not asked twice.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEYS.scheduleState) useScheduleStore.setState({ state: readState() });
    if (event.key === STORAGE_KEYS.schedules) useScheduleStore.setState({ schedules: loadSchedules(local.getJson(STORAGE_KEYS.schedules, null)) });
  });
}

export const getSchedule = (id) => useScheduleStore.getState().schedules.find((item) => item.id === id) || null;

/** Saves one reminder's settings. Returns the saved (cleaned up) reminder. */
export function saveSchedule(id, patch) {
  const base = SCHEDULE_DEFAULTS.find((item) => item.id === id);
  if (!base) return null;
  const saved = normalizeSchedule({ ...getSchedule(id), ...patch }, base);
  useScheduleStore.setState((s) => ({ schedules: s.schedules.map((item) => (item.id === id ? saved : item)) }));
  return saved;
}

export function resetSchedule(id) {
  const base = SCHEDULE_DEFAULTS.find((item) => item.id === id);
  if (!base) return null;
  useScheduleStore.setState((s) => ({ schedules: s.schedules.map((item) => (item.id === id ? { ...base } : item)) }));
  return base;
}

/** Drops entries older than a few days so the list does not grow forever. */
function pruned(state, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const min = dayKey(cutoff);
  return Object.fromEntries(Object.entries(state).filter(([key]) => (key.split("|")[1] || "") >= min));
}

export function markReminded(keys, at = Date.now()) {
  if (!keys.length) return;
  useScheduleStore.setState((s) => {
    const state = { ...pruned(s.state) };
    keys.forEach((key) => { state[key] = { at: state[key]?.at || at, last: at, done: state[key]?.done || 0 }; });
    return { state };
  });
}

export function confirmOccurrence(key, at = Date.now()) {
  useScheduleStore.setState((s) => ({ state: { ...s.state, [key]: { at: s.state[key]?.at || at, last: s.state[key]?.last || at, done: at } } }));
}

export const isConfirmed = (key) => Boolean(useScheduleStore.getState().state[key]?.done);
