/* Small text helpers used for matching and validation. */

export const EM_DASH = "—";
export const DOT = "·";

export const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

export const normalizeName = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const isPhone = (value) => /^\(\d{3}\) \d{3}-\d{4}$/.test(value);

/** Compares store numbers naturally (2 before 10). */
export const compareNumbers = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true });

export const compareStores = (a, b) => compareNumbers(a.num, b.num);

export const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));

/** Splits pasted text like "123, 456 789" into store numbers. */
export const splitStoreNumbers = (raw) => String(raw || "").split(/[\s,;]+/).map((part) => part.replace(/^#/, "").trim()).filter(Boolean);

/** True when the text looks like a franchisee name rather than store numbers. */
export const looksLikeName = (value) => /[a-z]/i.test(value) || value.startsWith("@");

/** Removes a leading "#" from a typed store number. */
export const cleanStoreNumber = (value) => String(value || "").trim().replace(/^#/, "");
