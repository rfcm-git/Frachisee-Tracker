/* /api/accounts — admins add, edit and delete accounts. (Mounted behind requireUser + requireAdmin.) */
import { Router } from "express";
import { createAccount, deleteAccount, listAccounts, publicAccount, updateAccount } from "../auth/accounts.js";
import { setSessionCookie } from "../auth/sessions.js";

export function accountsRouter(db, config) {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json({ accounts: await listAccounts(db) });
  });

  router.post("/", async (req, res) => {
    const { username, displayName, role, password } = req.body || {};
    res.status(201).json({ account: await createAccount(db, { username, displayName, role, password }) });
  });

  router.patch("/:id", async (req, res) => {
    const { username, displayName, role, active, password } = req.body || {};
    const saved = await updateAccount(db, req.user, req.params.id, { username, displayName, role, active, password });
    // Changing your own password signs out your other browsers; keep this one signed in.
    if (String(saved.id) === String(req.user.id)) setSessionCookie(req, res, saved, config);
    res.json({ account: publicAccount(saved) });
  });

  router.delete("/:id", async (req, res) => {
    await deleteAccount(db, req.user, req.params.id);
    res.json({ ok: true });
  });

  return router;
}
