/* API tests against a fake Supabase client (no network, no real database). Run: npm test -w backend */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/passwords.js";
import { COOKIE_NAME, createToken } from "../src/auth/sessions.js";

/**
 * Minimal stand-in for the Supabase query builder: records each call chain and
 * resolves with whatever respond(chain) returns ({ data, error, count }).
 */
function fakeDb(respond) {
  const calls = [];
  return {
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
}

const config = {
  corsOrigins: ["http://localhost:5173"], jsonLimit: "1mb", authSecret: "x".repeat(40), sessionHours: 12,
  adminUsername: "admin", adminPassword: "first-admin-pass",
};

const ADMIN = { id: 1, username: "admin", display_name: "Admin", role: "admin", active: true, session_version: 0 };
const USER = { id: 2, username: "sam", display_name: "Sam", role: "user", active: true, session_version: 3 };
const cookieFor = (account, secret = config.authSecret) => `${COOKIE_NAME}=${createToken({ id: account.id, sessionVersion: account.session_version }, secret, 12)}`;

const op = (chain, name) => chain.ops.find(([n]) => n === name);
const opNames = (chain) => chain.ops.map(([name]) => name);

let accounts;   // app_users rows the fake database holds
let respond;    // answers for every other table
let server;
let base;
let db;

/** Fake app_users table: lookups by id / username, counts, inserts, updates, deletes. */
function accountsTable(chain) {
  const names = opNames(chain);
  const eqs = chain.ops.filter(([n]) => n === "eq").map(([, col, val]) => [col, val]);
  const match = (row) => eqs.every(([col, val]) => String(row[col]) === String(val)) && chain.ops.filter(([n]) => n === "neq").every(([, col, val]) => String(row[col]) !== String(val));
  if (names.includes("insert")) {
    const [, row] = op(chain, "insert");
    if (accounts.some((a) => a.username === row.username)) return { data: null, error: { code: "23505", message: "duplicate key app_users_username_unique" } };
    const saved = { id: accounts.length + 10, session_version: 0, ...row };
    accounts.push(saved);
    return { data: [saved], error: null };
  }
  if (names.includes("update")) {
    const [, patch] = op(chain, "update");
    const rows = accounts.filter(match);
    rows.forEach((row) => Object.assign(row, patch));
    return { data: rows, error: null };
  }
  if (names.includes("delete")) {
    accounts = accounts.filter((row) => !match(row));
    return { data: null, error: null };
  }
  const select = op(chain, "select");
  if (select?.[2]?.head) return { data: null, count: accounts.filter(match).length, error: null };
  const rows = accounts.filter(match);
  return names.includes("maybeSingle") ? { data: rows[0] || null, error: null } : { data: rows, error: null };
}

before(async () => {
  db = fakeDb((chain) => (chain.table === "app_users" ? accountsTable(chain) : respond(chain)));
  server = createApp({ db, config }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());
beforeEach(() => {
  db.calls.length = 0;
  accounts = [{ ...ADMIN }, { ...USER }];
  respond = () => ({ data: [], error: null });
});

const call = async (method, path, body, { cookie, headers = {} } = {}) => {
  const response = await fetch(base + path, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
};
const asAdmin = { cookie: cookieFor(ADMIN) };
const asUser = { cookie: cookieFor(USER) };
const dataCalls = () => db.calls.filter((chain) => chain.table !== "app_users");

describe("health", () => {
  it("is public and reports the database as reachable", async () => {
    const res = await call("GET", "/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, database: true });
  });
  it("returns 503 when the database fails", async () => {
    respond = () => ({ data: null, error: { message: "Invalid API key", code: "401" } });
    const res = await call("GET", "/health");
    assert.equal(res.status, 503);
  });
});

describe("sign-in required", () => {
  it("refuses data without a session", async () => {
    for (const path of ["/tables/stores", "/settings/links", "/accounts"]) {
      const res = await call("GET", path);
      assert.equal(res.status, 401, path);
      assert.equal(res.body.error.code, "UNAUTHENTICATED");
    }
    assert.equal(dataCalls().length, 0);
  });
  it("refuses a forged or tampered session", async () => {
    assert.equal((await call("GET", "/tables/stores", undefined, { cookie: cookieFor(ADMIN, "y".repeat(40)) })).status, 401);
    const tampered = asAdmin.cookie.replace(/\.(.)/, (_m, c) => `.${c === "A" ? "B" : "A"}`);
    assert.equal((await call("GET", "/tables/stores", undefined, { cookie: tampered })).status, 401);
  });
  it("refuses a turned-off account and an old session version", async () => {
    accounts[1].active = false;
    assert.equal((await call("GET", "/tables/stores", undefined, asUser)).status, 401);
    accounts[1].active = true;
    accounts[1].session_version = 4;
    assert.equal((await call("GET", "/tables/stores", undefined, asUser)).status, 401);
  });
  it("allows a valid session", async () => {
    assert.equal((await call("GET", "/tables/stores", undefined, asUser)).status, 200);
  });
});

describe("login", () => {
  it("signs in with the right password and sets an HttpOnly cookie", async () => {
    accounts[1].password_hash = await hashPassword("sam-password");
    const res = await call("POST", "/auth/login", { username: "Sam", password: "sam-password" });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, "sam");
    assert.equal(res.body.user.password_hash, undefined);
    const cookie = res.headers.get("set-cookie");
    assert.match(cookie, /^ft_session=.+; Path=\/api; Max-Age=43200; HttpOnly; SameSite=Lax/);
    const me = await call("GET", "/auth/me", undefined, { cookie: cookie.split(";")[0] });
    assert.equal(me.body.user.username, "sam");
  });
  it("refuses a wrong password and an unknown username the same way", async () => {
    accounts[1].password_hash = await hashPassword("sam-password");
    const wrong = await call("POST", "/auth/login", { username: "sam", password: "nope-nope" });
    const unknown = await call("POST", "/auth/login", { username: "ghost", password: "nope-nope" });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body, unknown.body);
  });
  it("locks a username after 5 wrong tries", async () => {
    accounts[1].password_hash = await hashPassword("sam-password");
    for (let i = 0; i < 5; i += 1) await call("POST", "/auth/login", { username: "sam", password: "bad-guess" });
    const res = await call("POST", "/auth/login", { username: "sam", password: "sam-password" });
    assert.equal(res.status, 429);
  });
  it("creates the first admin from ADMIN_PASSWORD only while no accounts exist", async () => {
    accounts = [];
    const res = await call("POST", "/auth/login", { username: "admin", password: "first-admin-pass" });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, "admin");
    assert.equal(accounts.length, 1);
    assert.match(accounts[0].password_hash, /^scrypt\$/);
    accounts = [{ ...USER, password_hash: "x" }];
    assert.equal((await call("POST", "/auth/login", { username: "admin", password: "first-admin-pass" })).status, 401);
  });
  it("logout clears the cookie", async () => {
    const res = await call("POST", "/auth/logout", {});
    assert.match(res.headers.get("set-cookie"), /Max-Age=0/);
  });
  it("explains when the accounts table is missing", async () => {
    // A separate app whose app_users table looks missing.
    const failing = (chain) => (chain.table === "app_users" ? { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.app_users'" } } : respond(chain));
    const app = createApp({ db: fakeDb(failing), config }).listen(0);
    await new Promise((resolve) => app.once("listening", resolve));
    const res = await fetch(`http://127.0.0.1:${app.address().port}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "x" }) });
    app.close();
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.code, "ACCOUNTS_NOT_SET_UP");
  });
});

describe("accounts (admin)", () => {
  it("is admin only", async () => {
    assert.equal((await call("GET", "/accounts", undefined, asUser)).status, 403);
    const res = await call("GET", "/accounts", undefined, asAdmin);
    assert.equal(res.status, 200);
    assert.equal(res.body.accounts.length, 2);
  });
  it("adds an account with a hashed password", async () => {
    const res = await call("POST", "/accounts", { username: "New.Person", displayName: "New Person", role: "user", password: "long-enough" }, asAdmin);
    assert.equal(res.status, 201);
    assert.equal(res.body.account.username, "new.person");
    assert.match(accounts.at(-1).password_hash, /^scrypt\$/);
  });
  it("checks usernames and passwords", async () => {
    assert.equal((await call("POST", "/accounts", { username: "a b", password: "long-enough" }, asAdmin)).status, 400);
    assert.equal((await call("POST", "/accounts", { username: "okname", password: "short" }, asAdmin)).status, 400);
    assert.equal((await call("POST", "/accounts", { username: "sam", password: "long-enough" }, asAdmin)).status, 409);
  });
  it("a new password signs that account out everywhere", async () => {
    const res = await call("PATCH", "/accounts/2", { password: "brand-new-pass" }, asAdmin);
    assert.equal(res.status, 200);
    assert.equal(accounts[1].session_version, 4);
    assert.equal((await call("GET", "/tables/stores", undefined, asUser)).status, 401);
  });
  it("won't let an admin remove their own access or the last admin", async () => {
    assert.equal((await call("PATCH", "/accounts/1", { role: "user" }, asAdmin)).status, 400);
    assert.equal((await call("PATCH", "/accounts/1", { active: false }, asAdmin)).status, 400);
    assert.equal((await call("DELETE", "/accounts/1", undefined, asAdmin)).status, 400);
    assert.equal(accounts.length, 2);
  });
  it("edits and deletes another account", async () => {
    assert.equal((await call("PATCH", "/accounts/2", { displayName: "Samuel", role: "admin" }, asAdmin)).body.account.role, "admin");
    assert.equal((await call("DELETE", "/accounts/2", undefined, asAdmin)).status, 200);
    assert.equal(accounts.length, 1);
  });
});

describe("admin-only data actions", () => {
  it("only admins delete franchisees or restore backups", async () => {
    assert.equal((await call("DELETE", "/tables/franchisees/rows", { column: "id", value: 5 }, asUser)).status, 403);
    assert.equal((await call("PUT", "/tables/stores/rows", { rows: [] }, asUser)).status, 403);
    assert.equal(dataCalls().length, 0);
    assert.equal((await call("DELETE", "/tables/franchisees/rows", { column: "id", value: 5 }, asAdmin)).status, 200);
    assert.equal((await call("PUT", "/tables/stores/rows", { rows: [] }, asAdmin)).status, 200);
  });
  it("everyone signed in can delete other records (as before)", async () => {
    assert.equal((await call("DELETE", "/tables/issues/rows", { column: "id", value: 1 }, asUser)).status, 200);
  });
});

describe("tables", () => {
  it("reads a whole table page by page", async () => {
    respond = (chain) => {
      const [, from] = op(chain, "range");
      return { data: from === 0 ? Array.from({ length: 1000 }, (_, i) => ({ id: i })) : [{ id: 1000 }], error: null };
    };
    const res = await call("GET", "/tables/stores", undefined, asUser);
    assert.equal(res.body.rows.length, 1001);
    assert.equal(dataCalls().length, 2);
  });
  it("refuses tables the app does not use, including accounts", async () => {
    for (const table of ["pg_user", "app_users"]) {
      const res = await call("GET", `/tables/${table}`, undefined, asUser);
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, "UNKNOWN_TABLE");
    }
  });
  it("passes the missing-table code through (optional tables)", async () => {
    respond = () => ({ data: null, error: { message: "Could not find the table 'public.walmart'", code: "PGRST205" } });
    const res = await call("GET", "/tables/walmart", undefined, asUser);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "PGRST205");
  });
  it("guarded update matches id and updated_at; 409 when someone saved first", async () => {
    respond = () => ({ data: [{ id: 7, name: "New" }], error: null });
    const res = await call("PATCH", "/tables/franchisees/rows/7", { patch: { name: "New" }, updated_at: "2026-01-01T00:00:00Z" }, asUser);
    assert.deepEqual(res.body.row, { id: 7, name: "New" });
    assert.deepEqual(dataCalls()[0].ops.filter(([n]) => n === "eq"), [["eq", "id", "7"], ["eq", "updated_at", "2026-01-01T00:00:00Z"]]);
    respond = () => ({ data: [], error: null });
    assert.equal((await call("PATCH", "/tables/franchisees/rows/7", { patch: { name: "x" }, updated_at: "old" }, asUser)).status, 409);
  });
  it("keeps database error codes (duplicate key)", async () => {
    respond = () => ({ data: null, error: { message: "duplicate key value violates unique constraint \"stores_num_unique\"", code: "23505" } });
    const res = await call("POST", "/tables/stores/rows", { rows: [{ num: "1" }] }, asUser);
    assert.equal(res.body.error.code, "23505");
  });
  it("inserts with the next free ids, retrying on an id clash", async () => {
    let inserts = 0;
    respond = (chain) => {
      if (opNames(chain).includes("order")) return { data: [{ id: 41 }], error: null };
      inserts += 1;
      if (inserts === 1) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"franchisees_pkey\"" } };
      const [, rows] = op(chain, "insert");
      return { data: rows.map(({ id, name }) => ({ id, name })), error: null };
    };
    const res = await call("POST", "/tables/franchisees/rows/next-ids", { rows: [{ name: "A" }, { name: "B" }], select: "id,name" }, asUser);
    assert.deepEqual(res.body.rows, [{ id: 42, name: "A" }, { id: 43, name: "B" }]);
  });
  it("rejects column names that are not plain identifiers", async () => {
    assert.equal((await call("DELETE", "/tables/issues/rows", { column: "id;drop", value: 1 }, asUser)).status, 400);
  });
});

describe("settings", () => {
  it("reads and writes a setting", async () => {
    respond = () => ({ data: { value: { subject: "Hi" } }, error: null });
    assert.deepEqual((await call("GET", "/settings/onboarding_email_template", undefined, asUser)).body, { value: { subject: "Hi" } });
    assert.equal((await call("PUT", "/settings/links", { value: [1, 2] }, asUser)).status, 200);
  });
});

describe("CORS", () => {
  it("allows the configured frontend origin with credentials, and no other", async () => {
    const ok = await call("GET", "/health", undefined, { headers: { Origin: "http://localhost:5173" } });
    assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.equal(ok.headers.get("access-control-allow-credentials"), "true");
    const other = await call("GET", "/health", undefined, { headers: { Origin: "http://evil.example" } });
    assert.equal(other.headers.get("access-control-allow-origin"), null);
  });
});
