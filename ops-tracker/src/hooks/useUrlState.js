import { useSearchParams } from "react-router-dom";

/**
 * Filter state kept in the URL so views are shareable and survive reloads.
 * Values equal to their default are left out of the URL.
 * Make one `set` call per event: React Router's updater sees the params from
 * the last render, so two calls in a row would overwrite each other.
 */
export function useUrlState(defaults) {
  const [params, setParams] = useSearchParams();
  const values = {};
  for (const [k, d] of Object.entries(defaults)) values[k] = params.get(k) ?? d;
  const set = (patch) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v === defaults[k] || v == null || v === "") next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  /** Reset every filter to its default, except the keys listed in `keep`. */
  const reset = (...keep) => set(Object.fromEntries(Object.keys(defaults).filter((k) => !keep.includes(k)).map((k) => [k, defaults[k]])));
  return [values, set, reset];
}
