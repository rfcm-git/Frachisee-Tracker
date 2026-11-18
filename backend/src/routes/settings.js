/* /api/settings/:key — shared app settings (app_settings table: email templates, links, reminders). */
import { Router } from "express";
import * as store from "../db.js";
import { badRequest } from "../errors.js";

const isKey = (key) => /^[A-Za-z0-9_.-]{1,100}$/.test(key);

export function settingsRouter(db) {
  const router = Router();

  router.param("key", (_req, _res, next, key) => next(isKey(key) ? undefined : badRequest("Invalid setting key")));

  router.get("/:key", async (req, res) => {
    res.json({ value: await store.readSetting(db, req.params.key) });
  });

  router.put("/:key", async (req, res) => {
    if (!req.body || !("value" in req.body)) throw badRequest("value is required");
    await store.writeSetting(db, req.params.key, req.body.value);
    res.json({ ok: true });
  });

  return router;
}
