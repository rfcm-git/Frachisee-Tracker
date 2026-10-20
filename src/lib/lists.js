/* List helpers. */

/** Adds or removes a value from a list (returns a new list). */
export const toggleIn = (list, value) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
