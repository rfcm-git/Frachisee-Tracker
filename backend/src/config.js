/* Settings read from the environment (backend/.env locally, project settings on Vercel). */

const list = (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);

export function readConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 4000,
    supabaseUrl: env.SUPABASE_URL || "",
    // The secret key lets only this API reach the database (see backend/sql/02-lock-database.sql).
    // The publishable key still works until that script is run.
    supabaseKey: env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY || "",
    usingSecretKey: Boolean(env.SUPABASE_SECRET_KEY),
    authSecret: env.AUTH_SECRET || "",
    sessionHours: Number(env.SESSION_HOURS) || 12,
    // First admin account: signing in with these while no accounts exist creates it.
    adminUsername: String(env.ADMIN_USERNAME || "admin").trim().toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD || "",
    corsOrigins: list(env.CORS_ORIGINS || "http://localhost:5173"),
    jsonLimit: env.JSON_LIMIT || "25mb",
  };
}

/** Names of required settings that are missing or unusable. */
export function missingSettings(config) {
  const missing = [];
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseKey) missing.push("SUPABASE_SECRET_KEY");
  if (config.authSecret.length < 32) missing.push("AUTH_SECRET (at least 32 characters)");
  return missing;
}
