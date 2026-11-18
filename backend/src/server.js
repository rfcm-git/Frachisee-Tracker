/* Starts the API (npm run dev / npm start load backend/.env first). */
import { createClient } from "@supabase/supabase-js";
import { createApp } from "./app.js";
import { missingSettings, readConfig } from "./config.js";

const config = readConfig();
const missing = missingSettings(config);
if (missing.length) {
  console.error(`Missing settings: ${missing.join(", ")}. Copy backend/.env.example to backend/.env and fill them in.`);
  process.exit(1);
}

const db = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
const app = createApp({ db, config });

app.listen(config.port, () => {
  console.log(`Franchisee Tracker API on port ${config.port} (CORS: ${config.corsOrigins.join(", ")})`);
});
