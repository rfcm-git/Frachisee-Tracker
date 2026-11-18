/*
 * Database access, moved from the frontend's services/api.js. Same queries, same team-safe rules.
 * Every function takes the Supabase client first and throws an ApiError on failure.
 */
import { dbError } from "./errors.js";

const PAGE_SIZE = 1000;

const check = ({ data, error }) => {
  if (error) throw dbError(error);
  return data;
};

/** Reads a whole table, 1000 rows at a time. */
export async function fetchAll(db, table) {
  let all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const data = check(await db.from(table).select("*").range(from, from + PAGE_SIZE - 1));
    all = all.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return all;
}

/** One row by id, or null. */
export async function fetchRow(db, table, id) {
  return check(await db.from(table).select("*").eq("id", id).maybeSingle()) || null;
}

/** True when the table has the column (false when a newer migration has not been run yet). */
export async function hasColumn(db, table, column) {
  const { error } = await db.from(table).select(column).limit(1);
  if (!error) return true;
  const code = String(error.code || "").toUpperCase();
  if (code === "42703" || code === "PGRST204" || String(error.message || "").toLowerCase().includes(column)) return false;
  throw dbError(error);
}

/**
 * Team-safe save: only updates when nobody changed the row since it was loaded
 * (matched on updated_at). Returns the saved row, or null when someone else saved first.
 */
export async function guardedUpdate(db, table, id, updatedAt, patch) {
  let query = db.from(table).update(patch).eq("id", id);
  if (updatedAt) query = query.eq("updated_at", updatedAt);
  const data = check(await query.select());
  return data && data.length ? data[0] : null;
}

export async function insertRows(db, table, rows) {
  return check(await db.from(table).insert(rows).select()) || [];
}

/**
 * Inserts rows that need a numeric id taken from the database (franchisees, staff).
 * Retries when a teammate took the same ids first.
 */
export async function insertWithNextIds(db, table, records, select = "*") {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const max = check(await db.from(table).select("id").order("id", { ascending: false }).limit(1));
    let next = (max?.[0]?.id || 0) + 1;
    const withIds = records.map((record) => ({ ...record, id: next++ }));
    const { data, error } = await db.from(table).insert(withIds).select(select);
    if (!error) return data || [];
    lastError = error;
    const isIdClash = error.code === "23505" && String(error.message || "").toLowerCase().includes("pkey");
    if (!isIdClash) throw dbError(error);
  }
  throw dbError(lastError || new Error("Couldn't get free IDs — try again"));
}

/** Deletes rows where column = value, or column is one of values. */
export async function deleteRows(db, table, column, { value, values }) {
  const query = db.from(table).delete();
  check(await (values ? query.in(column, values) : query.eq(column, value)));
}

/** Sets patch on every row where column = value. */
export async function updateWhere(db, table, column, value, patch) {
  check(await db.from(table).update(patch).eq(column, value));
}

/** Current updated_at of several rows (used before saving a multi-store update). */
export async function fetchUpdatedAt(db, table, ids) {
  return check(await db.from(table).select("id,updated_at").in("id", ids)) || [];
}

export async function upsertRows(db, table, rows, onConflict = "id") {
  check(await db.from(table).upsert(rows, { onConflict }));
}

/** app_settings value of a key, or null. */
export async function readSetting(db, key) {
  const data = check(await db.from("app_settings").select("value").eq("key", key).maybeSingle());
  return data ? data.value : null;
}

export async function writeSetting(db, key, value) {
  check(await db.from("app_settings").upsert({ key, value }, { onConflict: "key" }));
}
