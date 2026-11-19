/*
 * Vercel serverless entry: serves the backend API at /api/* on the same address as the website.
 * vercel.json sends every /api/... request here; settings come from the Vercel project's environment variables.
 */
import { buildApp } from "../backend/src/main.js";

const { app, missing } = buildApp();

export default function handler(req, res) {
  if (app) return app(req, res);
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: { message: `Server settings missing: ${missing.join(", ")}`, code: "CONFIG" } }));
}
