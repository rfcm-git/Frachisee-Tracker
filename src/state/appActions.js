/* App-wide actions: connecting, loading data, backups. */
import { errorTitle, friendlyError } from "../lib/errors.js";
import { downloadBlob } from "../lib/browser.js";
import { localDateInput, nowIso } from "../lib/format.js";
import { TABLES, fetchAll, hasDb, loadAllTables, upsertRows } from "../services/api.js";
import { clearDb, createDb, getDb, getSavedCredentials, saveCredentials } from "../services/supabase.js";
import { getContext, setAllData, setConnection, useDataStore } from "./dataStore.js";
import { DIALOG, closeDialogs } from "./dialogs.js";
import { toast } from "./toastStore.js";

const setPhase = (phase, extra = {}) => useDataStore.setState({ phase, ...extra });
let activeLoad = null;
let lastDatabaseNotice = "";

function notifyDatabaseProblem(error) {
  const message = errorTitle(error);
  if (lastDatabaseNotice === message) return;
  lastDatabaseNotice = message;
  toast(`Database problem: ${message}`, "err");
}

/** Reloads every table. silent = background refresh (keeps the screen as it is). */
export function loadAll({ silent = false } = {}) {
  if (activeLoad) return activeLoad;
  if (!hasDb()) {
    const error = new Error("Database client is unavailable");
    setConnection("err", "Connection issue", errorTitle(error));
    if (!silent) setPhase("error", { error });
    notifyDatabaseProblem(error);
    return Promise.resolve(false);
  }
  if (!silent) setPhase("loading", { loadingText: "Loading data…" });
  activeLoad = (async () => {
    try {
      const data = await loadAllTables();
      setAllData(data);
      lastDatabaseNotice = "";
      setConnection("ok", "Connected", "Connected");
      setPhase("ready", { error: null, lastRefreshAt: new Date() });
      return true;
    } catch (error) {
      setConnection("err", "Connection issue", errorTitle(error));
      if (!silent) setPhase("error", { error });
      notifyDatabaseProblem(error);
      return false;
    } finally {
      activeLoad = null;
    }
  })();
  return activeLoad;
}

/** Connects with the given credentials, then loads the data. */
export async function connect(url, key, { silent = false } = {}) {
  const projectUrl = String(url || "").trim();
  const projectKey = String(key || "").trim();
  if (!projectUrl || !projectKey) { toast("Enter both URL and key", "err"); return false; }
  setConnection("busy", "Connecting…");
  if (!silent) setPhase("loading", { loadingText: "Connecting…" });
  try {
    createDb(projectUrl, projectKey);
  } catch (error) {
    clearDb();
    setConnection("err", "Not connected", errorTitle(error));
    setPhase("error", { error });
    notifyDatabaseProblem(error);
    return false;
  }
  saveCredentials(projectUrl, projectKey);
  const loaded = await loadAll();
  if (loaded && !silent) {
    toast("Connected", "ok");
    closeDialogs(DIALOG.settings);
  }
  return loaded;
}

/** Connects with the saved (or default) credentials when the app starts. */
export function connectSaved() {
  const { url, key } = getSavedCredentials();
  if (url && key) return connect(url, key, { silent: true });
  setPhase("disconnected");
  notifyDatabaseProblem(new Error("Database credentials are unavailable"));
  return Promise.resolve(false);
}

/** Downloads every table as one JSON file. */
export async function downloadBackup() {
  if (!getDb()) { toast("Connect first", "err"); return; }
  try {
    const [franchisees, stores, staff, issues] = await Promise.all([fetchAll(TABLES.franchisees), fetchAll(TABLES.stores), fetchAll(TABLES.staff), fetchAll(TABLES.issues)]);
    const onboarding = await fetchAll(TABLES.onboarding).catch(() => []);
    const callLogs = await fetchAll(TABLES.callLogs).catch(() => []);
    const caps = await fetchAll(TABLES.caps).catch(() => []);
    const payload = {
      exported_at: nowIso(),
      counts: { franchisees: franchisees.length, stores: stores.length, staff: staff.length, issues: issues.length, onboarding: onboarding.length, call_logs: callLogs.length, caps: caps.length },
      franchisees, stores, staff, issues, onboarding, call_logs: callLogs, caps,
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `franchisee-tracker-backup-${localDateInput()}.json`);
    toast("Backup downloaded", "ok");
  } catch (error) {
    toast(errorTitle(error), "err");
  }
}

/** Reads a backup file. Returns the tables, or null (with a toast) when the file is not usable. */
export async function readBackupFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast("That file isn't valid JSON", "err"); return null; }
  const backup = {
    franchisees: data.franchisees || [], stores: data.stores || [], staff: data.staff || [], issues: data.issues || [],
    onboarding: data.onboarding || [], callLogs: data.call_logs || [], caps: data.caps || [],
  };
  if (!backup.franchisees.length && !backup.stores.length && !backup.staff.length && !backup.issues.length) { toast("No data found in that file", "err"); return null; }
  return backup;
}

const chunks = (list, size) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

/** Text compared as plain text: no HTML tags, &nbsp; as a space, single spaces, trimmed, lower case. */
const plainKey = (value) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();

/** Times compared to the minute. */
const minuteKey = (value) => {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? "" : time.toISOString().slice(0, 16);
};

/** Content that makes two history records the same record, whatever their ids. */
const HISTORY_KEYS = {
  [TABLES.issues]: (row) => [plainKey(row.store_num), plainKey(row.title), minuteKey(row.created_at)].join("|"),
  [TABLES.onboarding]: (row) => [plainKey(row.store_num), plainKey(row.platform), plainKey(row.details), minuteKey(row.created_at)].join("|"),
  [TABLES.callLogs]: (row) => [plainKey(row.store_num), plainKey(row.franchisee_name), plainKey(row.reason), plainKey(row.result), minuteKey(row.call_at)].join("|"),
};

export const historyKey = (table, row) => HISTORY_KEYS[table](row);

/**
 * Splits backup rows of a history table: rows whose id is saved are updated in place;
 * rows with a new id are added without it, unless the same record is already saved or earlier in the backup.
 */
export function planHistoryRestore(existing, rows, keyOf) {
  const savedIds = new Set(existing.map((row) => String(row.id)));
  const seen = new Set(existing.map(keyOf));
  const update = [];
  const add = [];
  let skipped = 0;
  rows.forEach((row) => {
    if (row.id != null && savedIds.has(String(row.id))) {
      update.push(row);
      seen.add(keyOf(row));
      return;
    }
    const key = keyOf(row);
    if (seen.has(key)) { skipped += 1; return; }
    seen.add(key);
    const { id: _id, ...rest } = row;
    add.push(rest);
  });
  return { update, add, skipped };
}

/** Restores one history table without making copies. Returns { updated, added, skipped }. Throws on failure. */
async function restoreHistory(table, rows, chunk = 300) {
  if (!rows.length) return { updated: 0, added: 0, skipped: 0 };
  const { update, add, skipped } = planHistoryRestore(await fetchAll(table), rows, (row) => historyKey(table, row));
  for (const part of chunks(update, chunk)) { const error = await upsertRows(table, part); if (error) throw error; }
  for (const part of chunks(add, chunk)) { const { error } = await getDb().from(table).insert(part); if (error) throw error; }
  return { updated: update.length, added: add.length, skipped };
}

/**
 * Restores a backup into the shared database (matching records are overwritten). Throws on failure.
 * Returns the history counts { updated, added, skipped } for concerns, call logs and onboarding.
 */
export async function restoreBackup(backup) {
  for (const part of chunks(backup.staff, 400)) { const error = await upsertRows(TABLES.staff, part); if (error) throw error; }
  for (const part of chunks(backup.franchisees, 400)) { const error = await upsertRows(TABLES.franchisees, part); if (error) throw error; }
  for (const part of chunks(backup.stores, 300)) { const error = await upsertRows(TABLES.stores, part); if (error) throw error; }
  const results = [
    await restoreHistory(TABLES.issues, backup.issues),
    await restoreHistory(TABLES.callLogs, backup.callLogs),
    getContext().onboardingReady ? await restoreHistory(TABLES.onboarding, backup.onboarding) : null,
  ].filter(Boolean);
  // CAPs: one record per store number, so the backup's record replaces the saved one for that store.
  if (getContext().capsReady && backup.caps.length) {
    // Without the due_date column (migration not run yet), backups that have it restore without it.
    const rows = backup.caps.map(({ id: _id, due_date: dueDate, ...rest }) => (getContext().capsDueReady ? { ...rest, due_date: dueDate ?? null } : rest));
    for (const part of chunks(rows, 300)) { const error = await upsertRows(TABLES.caps, part, "store_num"); if (error) throw error; }
  }
  return results.reduce((total, result) => ({ updated: total.updated + result.updated, added: total.added + result.added, skipped: total.skipped + result.skipped }), { updated: 0, added: 0, skipped: 0 });
}

export { friendlyError };
