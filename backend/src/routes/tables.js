/*
 * /api/tables/:table — row access for the app's tables (see src/tables.js).
 * The frontend keeps its business rules; these endpoints are the database calls it used to make directly.
 */
import { Router } from "express";
import * as store from "../db.js";
import { ApiError, badRequest } from "../errors.js";
import { isAllowedTable, isColumnName, isSelectList } from "../tables.js";

const requireArray = (value, name) => {
  if (!Array.isArray(value)) throw badRequest(`${name} must be an array`);
  return value;
};
const requireColumn = (value) => {
  if (!isColumnName(value)) throw badRequest("column must be a column name");
  return value;
};
const requireObject = (value, name) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest(`${name} must be an object`);
  return value;
};

export function tablesRouter(db) {
  const router = Router();

  router.param("table", (_req, _res, next, table) => {
    next(isAllowedTable(table) ? undefined : new ApiError(404, `Unknown table: ${table}`, { code: "UNKNOWN_TABLE" }));
  });

  // Every row of the table.
  router.get("/:table", async (req, res) => {
    res.json({ rows: await store.fetchAll(db, req.params.table) });
  });

  // Whether the table has a column (older databases may be missing newer columns).
  router.get("/:table/columns/:column", async (req, res) => {
    res.json({ exists: await store.hasColumn(db, req.params.table, requireColumn(req.params.column)) });
  });

  // Current updated_at of several rows.
  router.post("/:table/updated-at", async (req, res) => {
    res.json({ rows: await store.fetchUpdatedAt(db, req.params.table, requireArray(req.body?.ids, "ids")) });
  });

  // One row by id ({ row: null } when it no longer exists).
  router.get("/:table/rows/:id", async (req, res) => {
    res.json({ row: await store.fetchRow(db, req.params.table, req.params.id) });
  });

  // Insert rows; returns them as saved.
  router.post("/:table/rows", async (req, res) => {
    res.status(201).json({ rows: await store.insertRows(db, req.params.table, requireArray(req.body?.rows, "rows")) });
  });

  // Insert rows with the next free numeric ids.
  router.post("/:table/rows/next-ids", async (req, res) => {
    const select = req.body?.select ?? "*";
    if (!isSelectList(select)) throw badRequest("select must be * or a list of column names");
    res.status(201).json({ rows: await store.insertWithNextIds(db, req.params.table, requireArray(req.body?.rows, "rows"), select) });
  });

  // Insert or overwrite rows matched on onConflict (default id).
  router.put("/:table/rows", async (req, res) => {
    const onConflict = req.body?.onConflict ?? "id";
    if (onConflict === "*" || !isSelectList(onConflict)) throw badRequest("onConflict must be column names");
    await store.upsertRows(db, req.params.table, requireArray(req.body?.rows, "rows"), onConflict);
    res.json({ ok: true });
  });

  // Team-safe update of one row: 409 when someone else changed it since updated_at.
  router.patch("/:table/rows/:id", async (req, res) => {
    const patch = requireObject(req.body?.patch, "patch");
    const row = await store.guardedUpdate(db, req.params.table, req.params.id, req.body?.updated_at || null, patch);
    if (!row) return res.status(409).json({ conflict: true, error: { message: "Someone else changed this record", code: "CONFLICT" } });
    res.json({ row });
  });

  // Update every row where column = value.
  router.patch("/:table/rows", async (req, res) => {
    const { column, value } = req.body || {};
    await store.updateWhere(db, req.params.table, requireColumn(column), value, requireObject(req.body?.patch, "patch"));
    res.json({ ok: true });
  });

  // Delete rows where column = value, or column is one of values.
  router.delete("/:table/rows", async (req, res) => {
    const { column, value, values } = req.body || {};
    if (values !== undefined) requireArray(values, "values");
    else if (value === undefined) throw badRequest("value or values is required");
    await store.deleteRows(db, req.params.table, requireColumn(column), { value, values });
    res.json({ ok: true });
  });

  return router;
}
