/*
 * Turns database and network errors into plain messages.
 * Returns { title, body, action } where action is "retry" (optional).
 */
export function friendlyError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = error?.code ? String(error.code) : "";

  if (message.includes("call_logs_store_mismatch")) return { title: "That store doesn't belong to this franchisee", body: "Pick one of their stores, or leave Store as General." };
  if (message.includes("call_logs_not_future")) return { title: "The call time can't be in the future", body: "Check the date and time." };
  if (message.includes("call_logs_reason_required") || message.includes("call_logs_result_required")) return { title: "Reason and result are required", body: "Fill in both fields." };

  if (code === "23505" || message.includes("duplicate key")) {
    if (message.includes("stores_num_unique")) return { title: "That store number already exists", body: "Each store number can only be used once." };
    if (message.includes("onboarding_open_unique")) return { title: "That store already has an open onboarding for this platform", body: "Update the existing record instead." };
    if (message.includes("franchisees_name_unique")) return { title: "A franchisee with that name already exists", body: "Use the existing franchisee instead." };
    return { title: "That record already exists", body: "Refresh and try again." };
  }
  if (message.includes("does not exist") || code === "42p01" || code === "42P01" || message.includes("could not find the table") || message.includes("column")) {
    return {
      title: "Database needs the latest setup",
      body: "The database schema is missing a required table or column. Ask your database administrator to apply the latest migrations, then try again.",
      action: "retry",
    };
  }
  if (message.includes("row-level security") || message.includes("permission denied") || code === "42501") {
    return { title: "Database access is blocked", body: "Ask your database administrator to check the database access policies, then try again.", action: "retry" };
  }
  if (message.includes("invalid api key") || message.includes("apikey") || message.includes("jwt")) {
    return { title: "Database authentication failed", body: "Ask your database administrator to check the app's database configuration.", action: "retry" };
  }
  if (message.includes("failed to fetch") || message.includes("fetch") || message.includes("networkerror")) {
    return { title: "Can't reach the database", body: "Check your internet connection and try again.", action: "retry" };
  }
  return { title: "Something went wrong", body: error?.message || "Please try again.", action: "retry" };
}

export const errorTitle = (error) => friendlyError(error).title;
