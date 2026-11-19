/*
 * Sessions: a signed token in an HttpOnly cookie. The token holds the account id, the account's
 * session_version (bumped to sign the account out everywhere) and an expiry; it is signed with AUTH_SECRET.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "ft_session";

const sign = (payload, secret) => createHmac("sha256", secret).update(payload).digest("base64url");

export function createToken({ id, sessionVersion }, secret, hours, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: id, v: sessionVersion, e: Math.floor(now / 1000) + Math.round(hours * 3600) })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns { id, sessionVersion } for a valid, unexpired token, otherwise null. */
export function readToken(token, secret, now = Date.now()) {
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.e !== "number" || data.e * 1000 <= now) return null;
    return { id: data.u, sessionVersion: data.v };
  } catch {
    return null;
  }
}

/** The value of one cookie from the request's Cookie header. */
export function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function cookie(req, value, maxAgeSeconds) {
  return [
    `${COOKIE_NAME}=${value}`,
    "Path=/api",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
    req.secure ? "Secure" : null,
  ].filter(Boolean).join("; ");
}

export function setSessionCookie(req, res, account, config) {
  const token = createToken({ id: account.id, sessionVersion: account.session_version || 0 }, config.authSecret, config.sessionHours);
  res.setHeader("Set-Cookie", cookie(req, token, Math.round(config.sessionHours * 3600)));
}

export function clearSessionCookie(req, res) {
  res.setHeader("Set-Cookie", cookie(req, "", 0));
}
