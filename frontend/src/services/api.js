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
let onSignedOut = null;

/** Called with the error when the backend answers 401 (not signed in, or the session ended). */
export function setSignedOutHandler(handler) {
  onSignedOut = handler;
}

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

/**
 * Calls the backend with the session cookie. Resolves with the JSON body; throws on network failure or an
 * error status (409 included). A 401 also tells the sign-in screen to show (unless quiet401).
 */
async function request(method, path, body, { quiet401 = false } = {}) {
  const response = await fetch(`${API_BASE}/api${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = apiError(data, response.status);
    if (response.status === 401 && !quiet401) onSignedOut?.(error);
    throw error;
  }
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
  // Everything is requested at once (tables, the column check and the email templates), so loading takes one round trip.
  const template = (key) => readSetting(key).catch((error) => ({ error }));
  const [franchisees, stores, staff, issues, onboardingResult, callLogsResult, walmartResult, snapshotsResult, emailExemptReady, obSetting, ezSetting, wmSetting] = await Promise.all([
    tick(fetchAll(TABLES.franchisees)),
    tick(fetchAll(TABLES.stores)),
    tick(fetchAll(TABLES.staff)),
    tick(fetchAll(TABLES.issues)),
    tick(fetchOptional(TABLES.onboarding)),
    tick(fetchOptional(TABLES.callLogs)),
    tick(fetchOptional(TABLES.walmart)),
    tick(fetchOptional(TABLES.snapshots)),
    hasColumn(TABLES.stores, "email_exempt"),
    template(ONBOARDING_EMAIL_KEY),
    template(EZCATER_EMAIL_KEY),
    template(WALMART_EMAIL_KEY),
  ]);
  const { rows: onboarding, ready: onboardingReady } = onboardingResult;
  const { rows: callLogs, ready: callLogsReady } = callLogsResult;
  const { rows: walmart, ready: walmartReady } = walmartResult;
  const { rows: snapshots, ready: snapshotsReady } = snapshotsResult;
  // Email templates: undefined when app_settings is not set up (kept on this computer instead); only used when their tab exists.
  const obTemplate = onboardingReady ? obSetting : { value: null };
  const onboardingEmail = obTemplate.error ? undefined : obTemplate.value || null;
  const ezTemplate = onboardingReady ? ezSetting : { value: null };
  const ezcaterEmail = ezTemplate.error ? undefined : ezTemplate.value || null;
  const wmTemplate = walmartReady ? wmSetting : { value: null };
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

/* ---------------------------------------------------------------- sign-in */

/** The signed-in account, or null when signed out. Throws on other failures (backend down, accounts not set up). */
export async function fetchCurrentUser() {
  try {
    return (await request("GET", "/auth/me", undefined, { quiet401: true })).user;
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}

/** Returns { user } | { error }. */
export async function signIn(username, password) {
  try {
    return { user: (await request("POST", "/auth/login", { username, password }, { quiet401: true })).user };
  } catch (error) {
    return { error };
  }
}

export const signOut = () => errorOf(request("POST", "/auth/logout", {}, { quiet401: true }));

/* --------------------------------------------------------------- accounts (admins) */

/** Returns { accounts } | { error }. */
export async function fetchAccounts() {
  try {
    return { accounts: (await request("GET", "/accounts")).accounts || [] };
  } catch (error) {
    return { error };
  }
}

/** Returns { account } | { error }. */
export async function createAccount(fields) {
  try {
    return { account: (await request("POST", "/accounts", fields)).account };
  } catch (error) {
    return { error };
  }
}

/** Returns { account } | { error }. Only the fields given are changed (password: "" = keep). */
export async function updateAccount(id, fields) {
  try {
    return { account: (await request("PATCH", `/accounts/${encodeURIComponent(id)}`, fields)).account };
  } catch (error) {
    return { error };
  }
}

export const deleteAccount = (id) => errorOf(request("DELETE", `/accounts/${encodeURIComponent(id)}`));

export const hasDb = () => connected;
