/*
 * Loaded database rows and connection status.
 * Components read the indexed data context with useDataContext().
 */
import { create } from "zustand";
import { EMPTY_DATA, buildContext } from "../domain/context.js";

export const useDataStore = create(() => ({
  data: EMPTY_DATA,
  /** "disconnected" | "loading" | "ready" | "error" */
  phase: "loading",
  loadingText: "Connecting…",
  error: null,
  connection: { state: "", header: "Not connected", popup: "Not connected" },
  lastRefreshAt: null,
}));

let cache = { data: null, ctx: null };

/** Indexed context for a data snapshot (cached until the data changes). */
export function contextFor(data) {
  if (cache.data !== data) cache = { data, ctx: buildContext(data) };
  return cache.ctx;
}

/** Current context, for code outside React components. */
export const getContext = () => contextFor(useDataStore.getState().data);

/** Current context inside components; re-renders when the data changes. */
export function useDataContext() {
  const data = useDataStore((state) => state.data);
  return contextFor(data);
}

export const setConnection = (state, header, popup) => useDataStore.setState({ connection: { state: state || "", header, popup: popup || header } });

/** Replaces some tables: updateData(data => ({ stores: [...] })) */
export function updateData(change) {
  useDataStore.setState((state) => ({ data: { ...state.data, ...change(state.data) } }));
}

export const setAllData = (data) => useDataStore.setState({ data: { ...EMPTY_DATA, ...data } });

/** Puts a saved row back into its table (matched by id). */
export const replaceRow = (table, row) => updateData((data) => ({ [table]: data[table].map((item) => (item.id === row.id ? row : item)) }));

export function replaceRows(table, rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  updateData((data) => ({ [table]: data[table].map((item) => byId.get(item.id) || item) }));
}

export const addRows = (table, rows) => updateData((data) => ({ [table]: [...data[table], ...rows] }));

export const removeRows = (table, predicate) => updateData((data) => ({ [table]: data[table].filter((item) => !predicate(item)) }));
