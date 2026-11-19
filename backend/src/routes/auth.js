/* /api/auth — sign in, sign out, and who is signed in. */
import { Router } from "express";
import { ApiError } from "../errors.js";
import { countAccounts, createAccount, findByUsername, markLoggedIn, publicAccount } from "../auth/accounts.js";
import { requireUser } from "../auth/middleware.js";
import { burnPasswordCheck, sameText, verifyPassword } from "../auth/passwords.js";
import { clearSessionCookie, setSessionCookie } from "../auth/sessions.js";

const MAX_FAILURES = 5;
const LOCK_MS = 60_000;

/** Slows down password guessing: 5 wrong tries for a username from one address locks it for a minute (per server instance). */
function failureCounter() {
  const failures = new Map();
  const key = (req, username) => `${req.ip}|${username}`;
  return {
    locked(req, username) {
      const entry = failures.get(key(req, username));
      return Boolean(entry && entry.count >= MAX_FAILURES && Date.now() - entry.at < LOCK_MS);
    },
    fail(req, username) {
      const k = key(req, username);
      const entry = failures.get(k);
      const fresh = !entry || Date.now() - entry.at >= LOCK_MS;
      failures.set(k, { count: fresh ? 1 : entry.count + 1, at: Date.now() });
      if (failures.size > 5000) failures.clear();
    },
    clear(req, username) {
      failures.delete(key(req, username));
    },
  };
}

const wrongLogin = () => new ApiError(401, "Wrong username or password", { code: "BAD_LOGIN" });

export function authRouter(db, config) {
  const router = Router();
  const counter = failureCounter();

  router.post("/login", async (req, res) => {
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!username || !password) throw new ApiError(400, "Enter your username and password", { code: "BAD_REQUEST" });
    if (counter.locked(req, username)) throw new ApiError(429, "Too many wrong tries. Wait a minute, then try again.", { code: "LOCKED" });

    let account = await findByUsername(db, username);
    if (!account) {
      // First run: no accounts yet, so the admin from ADMIN_USERNAME / ADMIN_PASSWORD becomes the first account.
      const firstAdmin = config.adminPassword && username === config.adminUsername && sameText(password, config.adminPassword)
        && (await countAccounts(db)) === 0;
      if (firstAdmin) {
        await createAccount(db, { username, displayName: "Admin", role: "admin", password });
        account = await findByUsername(db, username);
      } else {
        await burnPasswordCheck(password);
        counter.fail(req, username);
        throw wrongLogin();
      }
    } else if (!(await verifyPassword(password, account.password_hash))) {
      counter.fail(req, username);
      throw wrongLogin();
    }
    if (account.active === false) throw new ApiError(403, "This account is turned off. Ask an admin to turn it back on.", { code: "ACCOUNT_OFF" });

    counter.clear(req, username);
    await markLoggedIn(db, account.id);
    setSessionCookie(req, res, account, config);
    res.json({ user: publicAccount(account), sessionHours: config.sessionHours });
  });

  router.post("/logout", (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  router.get("/me", requireUser(db, config), (req, res) => {
    res.json({ user: publicAccount(req.user) });
  });

  return router;
}
