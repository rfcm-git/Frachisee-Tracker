/* Tables the API may touch, and checks for names that end up in database queries. */

export const TABLES = {
  franchisees: "franchisees",
  stores: "stores",
  staff: "staff",
  issues: "issues",
  onboarding: "onboarding",
  callLogs: "call_logs",
  walmart: "walmart",
  snapshots: "coverage_snapshots",
  settings: "app_settings",
};

const ALLOWED = new Set(Object.values(TABLES));

export const isAllowedTable = (name) => ALLOWED.has(name);

/** A plain column name (letters, digits, underscores). */
export const isColumnName = (name) => typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);

/** "*" or a comma-separated list of column names. */
export const isSelectList = (value) => value === "*" || (typeof value === "string" && value.split(",").every((part) => isColumnName(part.trim())));
