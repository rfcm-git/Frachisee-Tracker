/* Errors sent to the frontend keep Supabase's code, message, details and hint, so its friendly messages still apply. */

export class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export const badRequest = (message) => new ApiError(400, message, { code: "BAD_REQUEST" });

/** Turns a Supabase (PostgREST) error into an ApiError. */
export function dbError(error) {
  if (error instanceof ApiError) return error;
  const code = String(error?.code || "");
  const status = code === "PGRST205" || code === "42P01" ? 404 : code === "42501" ? 403 : 400;
  return new ApiError(status, error?.message || "Database error", { code, details: error?.details, hint: error?.hint });
}

export function errorBody(error) {
  return { error: { message: error.message, code: error.code || undefined, details: error.details || undefined, hint: error.hint || undefined } };
}
