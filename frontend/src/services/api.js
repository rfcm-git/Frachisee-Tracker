/*
 * Database access through the backend API (backend/). Same functions and results as before the split:
 * write helpers return { row } | { rows } | { conflict: true } | { gone: true } | { error }.
 * Errors keep the database's code and message, so lib/errors.js still turns them into plain messages.
 */

/** Backend address from VITE_API_BASE_URL (frontend/.env). Empty = same address as the app (/api). */
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export const TABLES = {
  franchisees: "franchisees",
  stores: "stores",
  staff: "staff",
  issues: "issues",
  onboarding: "onboarding",
  callLogs: "call_logs",
  walmart: "walmart",
  snapshots: "coverage_snapshots",
  settings: "app_settings",
};

/** app_settings key of the scheduled-reminder state (which occurrences were reminded/confirmed, shared across devices). */
export const SCHEDULE_STATE_KEY = "schedule_state";

/** app_settings key of the onboarding email template. */
export const ONBOARDING_EMAIL_KEY = "onboarding_email_template";

/** app_settings key of the Walmart email template. */
export const WALMART_EMAIL_KEY = "walmart_email_template";

/** app_settings key of the ezCater email template. */
export const EZCATER_EMAIL_KEY = "ezcater_email_template";

let connected = false;

/** Marks the backend as configured (set when the app connects at start). */
export function setConnected(value) {
  connected = Boolean(value);
}

/** An Error carrying the API's error details (code, details, hint, status). */
function apiError(body, status) {
  const info = body?.error || {};
  return Object.assign(new Error(info.message || `Request failed (${status})`), {
    code: info.code, details: info.details, hint: info.hint, status,
  });
}

/** Calls the backend. Resolves with the JSON body; throws on network failure or an error status (409 included). */
async function request(method, path, body) {
  const response = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw apiError(data, response.status);
  return data;
}

const tablePath = (table) => `/tables/${encodeURIComponent(table)}`;

/** Runs a write and returns its error, or null. */
const errorOf = (promise) => promise.then(() => null, (error) => error);

/** Reads a whole table (the backend pages through it). */
export async function fetchAll(table) {
  return (await request("GET", tablePath(table))).rows || [];
}

function isMissingTable(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205"
    || message.includes("could not find the table")
    || /(?:relation|table).+does not exist/.test(message);
}

/** Loads every table. Onboarding, call logs and Walmart are optional (older databases may not have them). */
/** onProgress(fraction) is called as each table arrives (used by the intro's loading ring). */
export async function loadAllTables({ onProgress } = {}) {
  let done = 0;
  const tick = (promise) => promise.then((value) => {
    onProgress?.(++done / 8);
    return value;
  });
  const fetchOptional = async (table) => {
    try {
      return { rows: await fetchAll(table), ready: true };
    } catch (error) {
      if (isMissingTable(error)) return { rows: [], ready: false };
      throw error;
    }
  };
  const [franchisees, stores, staff, issues, onboardingResult, callLogsResult, walmartResult, snapshotsResult] = await Promise.all([
    tick(fetchAll(TABLES.franchisees)),
    tick(fetchAll(TABLES.stores)),
    tick(fetchAll(TABLES.staff)),
    tick(fetchAll(TABLES.issues)),
    tick(fetchOptional(TABLES.onboarding)),
    tick(fetchOptional(TABLES.callLogs)),
    tick(fetchOptional(TABLES.walmart)),
    tick(fetchOptional(TABLES.snapshots)),
  ]);
  const { rows: onboarding, ready: onboardingReady } = onboardingResult;
  const { rows: callLogs, ready: callLogsReady } = callLogsResult;
  const { rows: walmart, ready: walmartReady } = walmartResult;
  const { rows: snapshots, ready: snapshotsReady } = snapshotsResult;
  const emailExemptReady = await hasColumn(TABLES.stores, "email_exempt");
  // Onboarding email template: undefined when app_settings is not set up (kept on this computer instead).
  const obTemplate = onboardingReady ? await readSetting(ONBOARDING_EMAIL_KEY).catch((error) => ({ error })) : { value: null };
  const onboardingEmail = obTemplate.error ? undefined : obTemplate.value || null;
  const ezTemplate = onboardingReady ? await readSetting(EZCATER_EMAIL_KEY).catch((error) => ({ error })) : { value: null };
  const ezcaterEmail = ezTemplate.error ? undefined : ezTemplate.value || null;
  // Walmart email template: undefined when app_settings is not set up (kept on this computer instead).
  const wmTemplate = walmartReady ? await readSetting(WALMART_EMAIL_KEY).catch((error) => ({ error })) : { value: null };
  const walmartEmail = wmTemplate.error ? undefined : wmTemplate.value || null;
  return { franchisees, stores, staff, issues, onboarding, callLogs, walmart, walmartReady, walmartEmail, snapshots, snapshotsReady, onboardingReady, callLogsReady, emailExemptReady, onboardingEmail, ezcaterEmail };
}

/** True when the table has the column (false when a newer migration has not been run yet). */
async function hasColumn(table, column) {
  return (await request("GET", `${tablePath(table)}/columns/${encodeURIComponent(column)}`)).exists;
}

/**
 * Team-safe save: only updates when nobody changed the row since it was loaded
 * (matched on updated_at). Returns { row } | { conflict: true } | { error }.
 */
export async function guardedUpdate(table, row, patch) {
  try {
    const data = await request("PATCH", `${tablePath(table)}/rows/${encodeURIComponent(row.id)}`, { patch, updated_at: row.updated_at || null });
    return { row: data.row };
  } catch (error) {
    return error.status === 409 ? { conflict: true } : { error };
  }
}

/**
 * Loads the latest store, applies mutate(freshRow) -> patch, and saves.
 * Retries when someone saved in between. Returns { row } | { gone } | { conflict } | { error }.
 */
export const mergeStoreSave = (storeId, mutate) => mergeRowSave(TABLES.stores, storeId, mutate);

/** Same as mergeStoreSave, for any table with an id column. */
export async function mergeRowSave(table, id, mutate) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let fresh;
    try {
      fresh = (await request("GET", `${tablePath(table)}/rows/${encodeURIComponent(id)}`)).row;
    } catch (error) {
      return { error };
    }
    if (!fresh) return { gone: true };
    const result = await guardedUpdate(table, fresh, mutate(fresh));
    if (result.error || result.row) return result;
  }
  return { conflict: true };
}

/** Inserts rows and returns { rows } | { error }. */
export async function insertRows(table, rows) {
  try {
    return { rows: (await request("POST", `${tablePath(table)}/rows`, { rows })).rows || [] };
  } catch (error) {
    return { error };
  }
}

/**
 * Inserts rows that need a numeric id taken from the database (franchisees, staff).
 * The backend retries when a teammate took the same ids first.
 */
export async function insertWithNextIds(table, records, select = "*") {
  try {
    return { rows: (await request("POST", `${tablePath(table)}/rows/next-ids`, { rows: records, select })).rows || [] };
  } catch (error) {
    return { error };
  }
}

export const deleteWhere = (table, column, value) => errorOf(request("DELETE", `${tablePath(table)}/rows`, { column, value }));

/** Sets patch on every row where column = value. Returns the error or null. */
export const updateWhere = (table, column, value, patch) => errorOf(request("PATCH", `${tablePath(table)}/rows`, { column, value, patch }));

export const deleteIn = (table, column, values) => errorOf(request("DELETE", `${tablePath(table)}/rows`, { column, values }));

/** Current updated_at of several rows (used before saving a multi-store update). */
export async function fetchUpdatedAt(table, ids) {
  try {
    return { rows: (await request("POST", `${tablePath(table)}/updated-at`, { ids })).rows || [] };
  } catch (error) {
    return { error };
  }
}

export const upsertRows = (table, rows, onConflict = "id") => errorOf(request("PUT", `${tablePath(table)}/rows`, { rows, onConflict }));

/** app_settings key/value storage. Returns { value } | { error }. */
export async function readSetting(key) {
  try {
    return { value: (await request("GET", `/settings/${encodeURIComponent(key)}`)).value ?? null };
  } catch (error) {
    return { error };
  }
}

export const writeSetting = (key, value) => errorOf(request("PUT", `/settings/${encodeURIComponent(key)}`, { value }));

/** Checks the admin password on the server. Returns { ok } | { error } (a wrong password is { ok: false }). */
export async function verifyAdminPassword(password) {
  try {
    return { ok: (await request("POST", "/auth/password", { password })).ok === true };
  } catch (error) {
    return error.status === 401 ? { ok: false } : { error };
  }
}

export const hasDb = () => connected;
