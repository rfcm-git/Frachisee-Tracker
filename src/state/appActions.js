/* App-wide actions: connecting, loading data, backups. */
import { errorTitle, friendlyError } from "../lib/errors.js";
import { downloadBlob } from "../lib/browser.js";
import { localDateInput, nowIso } from "../lib/format.js";
import { TABLES, fetchAll, hasDb, loadAllTables, upsertRows } from "../services/api.js";
import { clearDb, createDb, getDb, getSavedCredentials, saveCredentials } from "../services/supabase.js";
import { setAllData, setConnection, useDataStore } from "./dataStore.js";
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
    const payload = {
      exported_at: nowIso(),
      counts: { franchisees: franchisees.length, stores: stores.length, staff: staff.length, issues: issues.length, onboarding: onboarding.length, call_logs: callLogs.length },
      franchisees, stores, staff, issues, onboarding, call_logs: callLogs,
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
    onboarding: data.onboarding || [], callLogs: data.call_logs || [],
  };
  if (!backup.franchisees.length && !backup.stores.length && !backup.staff.length && !backup.issues.length) { toast("No data found in that file", "err"); return null; }
  return backup;
}

const chunks = (list, size) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

const withoutId = (rows) => rows.map(({ id: _id, ...rest }) => rest);

/** Restores a backup into the shared database (matching records are overwritten). Throws on failure. */
export async function restoreBackup(backup) {
  const db = getDb();
  for (const part of chunks(backup.staff, 400)) { const error = await upsertRows(TABLES.staff, part); if (error) throw error; }
  for (const part of chunks(backup.franchisees, 400)) { const error = await upsertRows(TABLES.franchisees, part); if (error) throw error; }
  for (const part of chunks(backup.stores, 300)) { const error = await upsertRows(TABLES.stores, part); if (error) throw error; }
  for (const part of chunks(withoutId(backup.issues), 300)) { const { error } = await db.from(TABLES.issues).insert(part); if (error) throw error; }
  for (const part of chunks(withoutId(backup.callLogs), 300)) { const { error } = await db.from(TABLES.callLogs).insert(part); if (error) throw error; }
  for (const part of chunks(withoutId(backup.onboarding), 300)) { const { error } = await db.from(TABLES.onboarding).insert(part); if (error) throw error; }
}

export { friendlyError };
