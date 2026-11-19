/* Request guards: requireUser (any signed-in, active account) and requireAdmin. */
import { ApiError } from "../errors.js";
import { findById } from "./accounts.js";
import { COOKIE_NAME, clearSessionCookie, readCookie, readToken } from "./sessions.js";

const signedOut = () => new ApiError(401, "Please sign in", { code: "UNAUTHENTICATED" });

/** Loads the signed-in account into req.user, or answers 401. Checked against the database on every request. */
export function requireUser(db, config) {
  return async (req, res, next) => {
    const session = readToken(readCookie(req, COOKIE_NAME), config.authSecret);
    if (!session) return next(signedOut());
    const account = await findById(db, session.id);
    if (!account || account.active === false || (account.session_version || 0) !== session.sessionVersion) {
      clearSessionCookie(req, res);
      return next(signedOut());
    }
    req.user = account;
    next();
  };
}

export const isAdmin = (req) => req.user?.role === "admin";

export function requireAdmin(req, _res, next) {
  next(isAdmin(req) ? undefined : new ApiError(403, "Only admins can do this", { code: "ADMIN_ONLY" }));
}
