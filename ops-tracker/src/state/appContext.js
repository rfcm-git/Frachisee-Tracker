import { createContext, useContext } from "react";

export const AppContext = createContext(null);

/** { user, lookups, toast, openFlagIssue, openPalette, openShortcuts } */
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
