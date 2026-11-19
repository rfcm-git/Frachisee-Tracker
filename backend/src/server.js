/* Starts the API (npm run dev / npm start load backend/.env first). */
import { buildApp } from "./main.js";

const { app, missing, config } = buildApp();
if (missing) {
  console.error(`Missing settings: ${missing.join(", ")}. Copy backend/.env.example to backend/.env and fill them in.`);
  process.exit(1);
}
if (!config.usingSecretKey) console.warn("Using SUPABASE_PUBLISHABLE_KEY. Set SUPABASE_SECRET_KEY so the database can be closed to the public key.");

app.listen(config.port, () => {
  console.log(`Franchisee Tracker API on port ${config.port} (CORS: ${config.corsOrigins.join(", ")})`);
});
