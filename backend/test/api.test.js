/* API tests against a fake Supabase client (no network, no real database). Run: npm test -w backend */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../src/app.js";

/**
 * Minimal stand-in for the Supabase query builder: records each call chain and
 * resolves with whatever respond(chain) returns ({ data, error }).
 */
function fakeDb(respond) {
  const calls = [];
  const db = {
    calls,
    from(table) {
      const chain = { table, ops: [] };
      calls.push(chain);
      const builder = new Proxy({}, {
        get(_target, prop) {
          if (prop === "then") {
            const result = Promise.resolve(respond(chain));
            return result.then.bind(result);
          }
          return (...args) => { chain.ops.push([prop, ...args]); return builder; };
        },
      });
      return builder;
    },
  };
  return db;
}

const config = { corsOrigins: ["http://localhost:5173"], adminPassword: "secret-pass", jsonLimit: "1mb" };

let respond;
let server;
let base;
let db;

before(async () => {
  db = fakeDb((chain) => respond(chain));
  server = createApp({ db, config }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());
beforeEach(() => {
  db.calls.length = 0;
  respond = () => ({ data: [], error: null });
});

const call = async (method, path, body, headers = {}) => {
  const response = await fetch(base + path, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
};
const opNames = (chain) => chain.ops.map(([name]) => name);

describe("health", () => {
  it("reports the database as reachable", async () => {
    const res = await call("GET", "/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, database: true });
  });
  it("returns 503 when the database fails", async () => {
    respond = () => ({ data: null, error: { message: "Invalid API key", code: "401" } });
    const res = await call("GET", "/health");
    assert.equal(res.status, 503);
    assert.equal(res.body.error.message, "Invalid API key");
  });
});

describe("tables", () => {
  it("reads a whole table page by page", async () => {
    respond = (chain) => {
      const [, from] = chain.ops.find(([name]) => name === "range");
      return { data: from === 0 ? Array.from({ length: 1000 }, (_, i) => ({ id: i })) : [{ id: 1000 }], error: null };
    };
    const res = await call("GET", "/tables/stores");
    assert.equal(res.status, 200);
    assert.equal(res.body.rows.length, 1001);
    assert.equal(db.calls.length, 2);
  });

  it("refuses tables the app does not use", async () => {
    const res = await call("GET", "/tables/pg_user");
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "UNKNOWN_TABLE");
    assert.equal(db.calls.length, 0);
  });

  it("passes the missing-table code through (optional tables)", async () => {
    respond = () => ({ data: null, error: { message: "Could not find the table 'public.walmart'", code: "PGRST205" } });
    const res = await call("GET", "/tables/walmart");
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "PGRST205");
  });

  it("guarded update matches id and updated_at and returns the row", async () => {
    respond = () => ({ data: [{ id: 7, name: "New" }], error: null });
    const res = await call("PATCH", "/tables/franchisees/rows/7", { patch: { name: "New" }, updated_at: "2026-01-01T00:00:00Z" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.row, { id: 7, name: "New" });
    const eqs = db.calls[0].ops.filter(([name]) => name === "eq");
    assert.deepEqual(eqs, [["eq", "id", "7"], ["eq", "updated_at", "2026-01-01T00:00:00Z"]]);
  });

  it("guarded update returns 409 when someone else saved first", async () => {
    respond = () => ({ data: [], error: null });
    const res = await call("PATCH", "/tables/franchisees/rows/7", { patch: { name: "x" }, updated_at: "old" });
    assert.equal(res.status, 409);
    assert.equal(res.body.conflict, true);
  });

  it("keeps database error codes (duplicate key)", async () => {
    respond = () => ({ data: null, error: { message: "duplicate key value violates unique constraint \"stores_num_unique\"", code: "23505" } });
    const res = await call("POST", "/tables/stores/rows", { rows: [{ num: "1" }] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "23505");
    assert.match(res.body.error.message, /stores_num_unique/);
  });

  it("inserts with the next free ids, retrying on an id clash", async () => {
    let inserts = 0;
    respond = (chain) => {
      if (opNames(chain).includes("order")) return { data: [{ id: 41 }], error: null };
      inserts += 1;
      if (inserts === 1) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"franchisees_pkey\"" } };
      const [, rows] = chain.ops.find(([name]) => name === "insert");
      return { data: rows.map(({ id, name }) => ({ id, name })), error: null };
    };
    const res = await call("POST", "/tables/franchisees/rows/next-ids", { rows: [{ name: "A" }, { name: "B" }], select: "id,name" });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.rows, [{ id: 42, name: "A" }, { id: 43, name: "B" }]);
    assert.equal(inserts, 2);
  });

  it("deletes by one value or by a list", async () => {
    await call("DELETE", "/tables/issues/rows", { column: "store_num", value: "123" });
    await call("DELETE", "/tables/issues/rows", { column: "id", values: [1, 2] });
    assert.deepEqual(db.calls[0].ops.at(-1), ["eq", "store_num", "123"]);
    assert.deepEqual(db.calls[1].ops.at(-1), ["in", "id", [1, 2]]);
  });

  it("rejects column names that are not plain identifiers", async () => {
    const res = await call("DELETE", "/tables/issues/rows", { column: "id;drop", value: 1 });
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });

  it("reports whether a column exists", async () => {
    respond = () => ({ data: null, error: { code: "42703", message: "column stores.email_exempt does not exist" } });
    const res = await call("GET", "/tables/stores/columns/email_exempt");
    assert.deepEqual(res.body, { exists: false });
  });
});

describe("settings", () => {
  it("reads and writes a setting", async () => {
    respond = () => ({ data: { value: { subject: "Hi" } }, error: null });
    const read = await call("GET", "/settings/onboarding_email_template");
    assert.deepEqual(read.body, { value: { subject: "Hi" } });
    const write = await call("PUT", "/settings/links", { value: [1, 2] });
    assert.equal(write.status, 200);
    assert.deepEqual(db.calls[1].ops[0], ["upsert", { key: "links", value: [1, 2] }, { onConflict: "key" }]);
  });
});

describe("admin password", () => {
  it("accepts the right password and refuses a wrong one", async () => {
    assert.equal((await call("POST", "/auth/password", { password: "secret-pass" })).status, 200);
    assert.equal((await call("POST", "/auth/password", { password: "nope" })).status, 401);
  });
});

describe("CORS", () => {
  it("allows the configured frontend origin only", async () => {
    const ok = await call("GET", "/health", undefined, { Origin: "http://localhost:5173" });
    assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:5173");
    const other = await call("GET", "/health", undefined, { Origin: "http://evil.example" });
    assert.equal(other.headers.get("access-control-allow-origin"), null);
  });
});

describe("unknown endpoints", () => {
  it("return JSON 404", async () => {
    const res = await call("GET", "/nothing-here");
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "NOT_FOUND");
  });
});
