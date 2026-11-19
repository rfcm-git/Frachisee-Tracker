/* Builds the ready-to-use API from the environment. Shared by server.js (local / Node host) and api/index.js (Vercel). */
import { createClient } from "@supabase/supabase-js";
import { createApp } from "./app.js";
import { missingSettings, readConfig } from "./config.js";

/** Returns { app, config } or { missing: [names of unset settings], config }. */
export function buildApp(env = process.env) {
  const config = readConfig(env);
  const missing = missingSettings(config);
  if (missing.length) return { missing, config };
  const db = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { app: createApp({ db, config }), config };
}
