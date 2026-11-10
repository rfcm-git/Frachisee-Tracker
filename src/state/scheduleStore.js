/* Scheduled reminders: their settings (editable in Settings) and which occurrences were reminded or confirmed. */
import { create } from "zustand";
import { STORAGE_KEYS } from "../config/constants.js";
import { SCHEDULE_DEFAULTS, dayKey, loadSchedules, normalizeSchedule } from "../domain/schedules.js";
import { SCHEDULE_STATE_KEY, hasDb, readSetting, writeSetting } from "../services/api.js";
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
  pushScheduleState();
}

export function confirmOccurrence(key, at = Date.now()) {
  useScheduleStore.setState((s) => ({ state: { ...s.state, [key]: { at: s.state[key]?.at || at, last: s.state[key]?.last || at, done: at } } }));
  pushScheduleState();
}

export const isConfirmed = (key) => Boolean(useScheduleStore.getState().state[key]?.done);

/* ---- Shared-database sync: a reminder confirmed on one device, tab or browser stays confirmed everywhere. ---- */

function mergeEntry(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { at: Math.min(a.at || b.at, b.at || a.at), last: Math.max(a.last || 0, b.last || 0), done: Math.max(a.done || 0, b.done || 0) };
}

/** Merges two occurrence states: a confirmation on either side wins, the latest reminder time is kept. */
function mergeStates(mine, theirs) {
  const merged = { ...mine };
  Object.entries(theirs || {}).forEach(([key, entry]) => { if (entry) merged[key] = mergeEntry(merged[key], entry); });
  return merged;
}

const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Reads the shared state and merges in what other devices did.
 * Returns the keys that turned out to be confirmed elsewhere (to settle their notifications here).
 */
export async function pullScheduleState() {
  if (!hasDb()) return [];
  try {
    const { value, error } = await readSetting(SCHEDULE_STATE_KEY);
    if (error || !value || typeof value !== "object") return [];
    const before = useScheduleStore.getState().state;
    const merged = mergeStates(before, value);
    if (sameState(merged, before)) return [];
    useScheduleStore.setState({ state: merged });
    return Object.keys(merged).filter((key) => merged[key]?.done && !before[key]?.done);
  } catch {
    return []; // Offline: this device still remembers locally.
  }
}

let pushTimer = 0;

/** Writes this device's state to the shared database (read–merge–write, slightly delayed to coalesce bursts). */
export function pushScheduleState() {
  if (!hasDb() || typeof window === "undefined") return;
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(async () => {
    try {
      const { value, error } = await readSetting(SCHEDULE_STATE_KEY);
      if (error) return; // app_settings is not set up; the reminder state stays on this computer.
      const merged = pruned(mergeStates(useScheduleStore.getState().state, value && typeof value === "object" ? value : {}));
      if (!sameState(merged, useScheduleStore.getState().state)) useScheduleStore.setState({ state: merged });
      await writeSetting(SCHEDULE_STATE_KEY, merged);
    } catch { /* Offline: the next confirm or reminder tries again. */ }
  }, 300);
}
