/*
 * Database access. Every function uses the active Supabase client.
 * Write helpers return { row } | { rows } | { conflict: true } | { gone: true } | { error }.
 */
import { getDb } from "./supabase.js";

export const TABLES = {
  franchisees: "franchisees",
  stores: "stores",
  staff: "staff",
  issues: "issues",
  onboarding: "onboarding",
  callLogs: "call_logs",
  settings: "app_settings",
};

function db() {
  const client = getDb();
  if (!client) throw new Error("Not connected");
  return client;
}

/** Reads a whole table, 1000 rows at a time. */
export async function fetchAll(table) {
  const pageSize = 1000;
  let all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db().from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
  }
  return all;
}

function isMissingTable(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205"
    || message.includes("could not find the table")
    || /(?:relation|table).+does not exist/.test(message);
}

/** Loads every table. Onboarding and call logs are optional (older databases may not have them). */
export async function loadAllTables() {
  const fetchOptional = async (table) => {
    try {
      return { rows: await fetchAll(table), ready: true };
    } catch (error) {
      if (isMissingTable(error)) return { rows: [], ready: false };
      throw error;
    }
  };
  const [franchisees, stores, staff, issues, onboardingResult, callLogsResult] = await Promise.all([
    fetchAll(TABLES.franchisees),
    fetchAll(TABLES.stores),
    fetchAll(TABLES.staff),
    fetchAll(TABLES.issues),
    fetchOptional(TABLES.onboarding),
    fetchOptional(TABLES.callLogs),
  ]);
  const { rows: onboarding, ready: onboardingReady } = onboardingResult;
  const { rows: callLogs, ready: callLogsReady } = callLogsResult;
  return { franchisees, stores, staff, issues, onboarding, callLogs, onboardingReady, callLogsReady };
}

/**
 * Team-safe save: only updates when nobody changed the row since it was loaded
 * (matched on updated_at). Returns { row } | { conflict: true } | { error }.
 */
export async function guardedUpdate(table, row, patch) {
  let query = db().from(table).update(patch).eq("id", row.id);
  if (row.updated_at) query = query.eq("updated_at", row.updated_at);
  const { data, error } = await query.select();
  if (error) return { error };
  if (!data || !data.length) return { conflict: true };
  return { row: data[0] };
}

/**
 * Loads the latest store, applies mutate(freshRow) -> patch, and saves.
 * Retries when someone saved in between. Returns { row } | { gone } | { conflict } | { error }.
 */
export const mergeStoreSave = (storeId, mutate) => mergeRowSave(TABLES.stores, storeId, mutate);

/** Same as mergeStoreSave, for any table with an id column. */
export async function mergeRowSave(table, id, mutate) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: fresh, error } = await db().from(table).select("*").eq("id", id).maybeSingle();
    if (error) return { error };
    if (!fresh) return { gone: true };
    const result = await guardedUpdate(table, fresh, mutate(fresh));
    if (result.error || result.row) return result;
  }
  return { conflict: true };
}

/** Inserts rows and returns { rows } | { error }. */
export async function insertRows(table, rows) {
  const { data, error } = await db().from(table).insert(rows).select();
  return error ? { error } : { rows: data || [] };
}

/**
 * Inserts rows that need a numeric id taken from the database (franchisees).
 * Retries when a teammate took the same ids first.
 */
export async function insertWithNextIds(table, records, select = "*") {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const max = await db().from(table).select("id").order("id", { ascending: false }).limit(1);
    if (max.error) return { error: max.error };
    let next = (max.data?.[0]?.id || 0) + 1;
    const withIds = records.map((record) => ({ ...record, id: next++ }));
    const { data, error } = await db().from(table).insert(withIds).select(select);
    if (!error) return { rows: data || [] };
    lastError = error;
    const isIdClash = error.code === "23505" && String(error.message || "").toLowerCase().includes("pkey");
    if (!isIdClash) return { error };
  }
  return { error: lastError || new Error("Couldn't get free IDs — try again") };
}

export async function deleteWhere(table, column, value) {
  const { error } = await db().from(table).delete().eq(column, value);
  return error || null;
}

export async function deleteIn(table, column, values) {
  const { error } = await db().from(table).delete().in(column, values);
  return error || null;
}

/** Current updated_at of several rows (used before saving a multi-store update). */
export async function fetchUpdatedAt(table, ids) {
  const { data, error } = await db().from(table).select("id,updated_at").in("id", ids);
  return error ? { error } : { rows: data || [] };
}

export async function upsertRows(table, rows, onConflict = "id") {
  const { error } = await db().from(table).upsert(rows, { onConflict });
  return error || null;
}

/** app_settings key/value storage. Returns { value } | { error }. */
export async function readSetting(key) {
  const { data, error } = await db().from(TABLES.settings).select("value").eq("key", key).maybeSingle();
  return error ? { error } : { value: data ? data.value : null };
}

export async function writeSetting(key, value) {
  const { error } = await db().from(TABLES.settings).upsert({ key, value }, { onConflict: "key" });
  return error || null;
}

export const hasDb = () => !!getDb();
