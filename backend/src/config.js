/* Settings read from the environment (backend/.env locally). */

const list = (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);

export function readConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 4000,
    supabaseUrl: env.SUPABASE_URL || "",
    supabaseKey: env.SUPABASE_PUBLISHABLE_KEY || "",
    adminPassword: env.ADMIN_PASSWORD || "",
    corsOrigins: list(env.CORS_ORIGINS || "http://localhost:5173"),
    jsonLimit: env.JSON_LIMIT || "25mb",
  };
}

/** Names of required settings that are missing. */
export function missingSettings(config) {
  const missing = [];
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseKey) missing.push("SUPABASE_PUBLISHABLE_KEY");
  if (!config.adminPassword) missing.push("ADMIN_PASSWORD");
  return missing;
}
