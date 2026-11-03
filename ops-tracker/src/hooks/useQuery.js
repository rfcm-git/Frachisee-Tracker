import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../data/index.js";

/**
 * Runs an async loader and re-runs it when `deps` change or when the data
 * source reports a change to one of `topics`.
 * - `loading` is true only until the first result (show skeletons).
 * - `refreshing` is true while newer data is on its way; keep showing `data`
 *   so the layout doesn't jump.
 */
export function useQuery(loader, deps, { topics = [], intervalMs } = {}) {
  const depsKey = JSON.stringify(deps);
  const [state, setState] = useState({ data: undefined, error: null, key: null, busy: false });
  const seq = useRef(0);
  const loaderRef = useRef(loader);
  const keyRef = useRef(depsKey);
  useEffect(() => {
    loaderRef.current = loader;
    keyRef.current = depsKey;
  });

  // Fetch without touching state synchronously (safe to call from effects).
  const fetchNow = useCallback((key) => {
    const id = ++seq.current;
    loaderRef.current().then(
      (data) => id === seq.current && setState({ data, error: null, key, busy: false }),
      (error) => id === seq.current && setState((s) => ({ ...s, error, key, busy: false })),
    );
  }, []);
  // Event-driven refresh: mark busy first so the UI can dim the old data.
  const run = useCallback(
    (key) => {
      setState((s) => ({ ...s, busy: true, error: null }));
      fetchNow(key);
    },
    [fetchNow],
  );

  useEffect(() => fetchNow(depsKey), [depsKey, fetchNow]);

  const topicKey = topics.join(",");
  useEffect(() => {
    if (!topicKey) return undefined;
    const list = topicKey.split(",");
    return api.onChange((t) => (t === "all" || list.includes(t)) && run(keyRef.current));
  }, [topicKey, run]);

  useEffect(() => {
    if (!intervalMs) return undefined;
    const t = setInterval(() => document.visibilityState === "visible" && run(keyRef.current), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, run]);

  const hasData = state.data !== undefined;
  return {
    data: state.data,
    error: state.error,
    loading: !hasData && !state.error,
    refreshing: hasData && (state.key !== depsKey || state.busy),
    reload: () => run(depsKey),
  };
}
