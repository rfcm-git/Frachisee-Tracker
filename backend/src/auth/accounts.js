/* Accounts (app_users table). Password hashes never leave this file except to be verified. */
import { ApiError, badRequest, dbError } from "../errors.js";
import { MIN_PASSWORD_LENGTH, hashPassword } from "./passwords.js";

export const ACCOUNTS_TABLE = "app_users";
export const ROLES = ["admin", "user"];

const PUBLIC_COLUMNS = "id,username,display_name,role,active,last_login_at,created_at,updated_at";

/** The accounts table hasn't been created yet (backend/sql/01-accounts.sql). */
function notSetUp(error) {
  const code = String(error?.code || "");
  return code === "PGRST205" || code === "42P01";
}

function check({ data, error }) {
  if (!error) return data;
  if (notSetUp(error)) {
    throw new ApiError(503, "Accounts are not set up yet: run backend/sql/01-accounts.sql in Supabase.", { code: "ACCOUNTS_NOT_SET_UP" });
  }
  if (error.code === "23505") throw new ApiError(409, "That username is already taken", { code: "USERNAME_TAKEN" });
  throw dbError(error);
}

/** What the API returns for an account. */
export const publicAccount = (row) => row && ({
  id: row.id,
  username: row.username,
  displayName: row.display_name || "",
  role: row.role,
  active: row.active !== false,
  lastLoginAt: row.last_login_at || null,
  createdAt: row.created_at || null,
});

export function normalizeUsername(value) {
  const username = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw badRequest("Username must be 3–40 characters: letters, numbers, dot, dash or underscore");
  return username;
}

export function checkPassword(value) {
  const password = String(value ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) throw badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  if (password.length > 200) throw badRequest("Password is too long");
  return password;
}

function checkRole(value) {
  if (!ROLES.includes(value)) throw badRequest("Role must be admin or user");
  return value;
}

const cleanName = (value) => String(value ?? "").trim().slice(0, 80);

export async function findByUsername(db, username) {
  return check(await db.from(ACCOUNTS_TABLE).select("*").eq("username", username).maybeSingle()) || null;
}

export async function findById(db, id) {
  return check(await db.from(ACCOUNTS_TABLE).select("*").eq("id", id).maybeSingle()) || null;
}

export async function countAccounts(db) {
  const { count, error } = await db.from(ACCOUNTS_TABLE).select("id", { count: "exact", head: true });
  check({ data: null, error });
  return count || 0;
}

export async function listAccounts(db) {
  const rows = check(await db.from(ACCOUNTS_TABLE).select(PUBLIC_COLUMNS).order("username"));
  return (rows || []).map(publicAccount);
}

export async function createAccount(db, { username, displayName, role, password }) {
  const row = {
    username: normalizeUsername(username),
    display_name: cleanName(displayName),
    role: checkRole(role ?? "user"),
    password_hash: await hashPassword(checkPassword(password)),
    active: true,
  };
  const rows = check(await db.from(ACCOUNTS_TABLE).insert(row).select(PUBLIC_COLUMNS));
  return publicAccount(rows[0]);
}

export async function markLoggedIn(db, id) {
  check(await db.from(ACCOUNTS_TABLE).update({ last_login_at: new Date().toISOString() }).eq("id", id));
}

async function otherActiveAdmins(db, id) {
  const { count, error } = await db.from(ACCOUNTS_TABLE).select("id", { count: "exact", head: true })
    .eq("role", "admin").eq("active", true).neq("id", id);
  check({ data: null, error });
  return count || 0;
}

/**
 * Changes an account. actor = the signed-in admin making the change.
 * A new password, a role change or deactivation signs that account out everywhere.
 * Returns the saved account row (with session_version, for re-issuing the actor's own cookie).
 */
export async function updateAccount(db, actor, id, changes) {
  const current = await findById(db, id);
  if (!current) throw new ApiError(404, "That account no longer exists", { code: "ACCOUNT_GONE" });
  const self = String(current.id) === String(actor.id);
  const patch = {};
  let signOut = false;

  if (changes.username !== undefined) {
    const username = normalizeUsername(changes.username);
    if (username !== current.username) patch.username = username;
  }
  if (changes.displayName !== undefined) patch.display_name = cleanName(changes.displayName);
  if (changes.role !== undefined && changes.role !== current.role) {
    if (self) throw badRequest("You can't change your own role");
    patch.role = checkRole(changes.role);
    signOut = true;
  }
  if (changes.active !== undefined && Boolean(changes.active) !== (current.active !== false)) {
    if (self) throw badRequest("You can't deactivate your own account");
    patch.active = Boolean(changes.active);
    signOut = signOut || !patch.active;
  }
  if (changes.password !== undefined && changes.password !== "") {
    patch.password_hash = await hashPassword(checkPassword(changes.password));
    signOut = true;
  }
  const losesAdmin = current.role === "admin" && current.active !== false && (patch.role === "user" || patch.active === false);
  if (losesAdmin && !(await otherActiveAdmins(db, current.id))) throw badRequest("Keep at least one active admin account");

  if (!Object.keys(patch).length) return current;
  if (signOut) patch.session_version = (current.session_version || 0) + 1;
  patch.updated_at = new Date().toISOString();
  const rows = check(await db.from(ACCOUNTS_TABLE).update(patch).eq("id", current.id).select("*"));
  return rows[0];
}

export async function deleteAccount(db, actor, id) {
  const current = await findById(db, id);
  if (!current) return;
  if (String(current.id) === String(actor.id)) throw badRequest("You can't delete your own account");
  if (current.role === "admin" && current.active !== false && !(await otherActiveAdmins(db, current.id))) {
    throw badRequest("Keep at least one active admin account");
  }
  check(await db.from(ACCOUNTS_TABLE).delete().eq("id", current.id));
}
