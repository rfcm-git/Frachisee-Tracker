/* /api/auth — the admin password check, kept on the server so the password is not shipped to browsers. */
import { timingSafeEqual } from "node:crypto";
import { Router } from "express";

const sameText = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
};

export function authRouter(adminPassword) {
  const router = Router();

  router.post("/password", (req, res) => {
    const ok = Boolean(adminPassword) && sameText(req.body?.password ?? "", adminPassword);
    if (!ok) return res.status(401).json({ ok: false, error: { message: "Wrong password", code: "WRONG_PASSWORD" } });
    res.json({ ok: true });
  });

  return router;
}
