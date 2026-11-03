import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../data/index.js";
import { AppContext } from "./appContext.js";
import { ToastViewport } from "../components/ui/overlays.jsx";
import { FlagIssueDialog } from "../pages/issues/FlagIssueDialog.jsx";
import { CommandPalette } from "../components/layout/CommandPalette.jsx";
import { ShortcutsDialog } from "../components/layout/ShortcutsDialog.jsx";

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [lookups, setLookups] = useState({ stores: [], franchisees: [], users: [] });
  const [toasts, setToasts] = useState([]);
  const [flag, setFlag] = useState(null); // null = closed, {} = open with optional prefill
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const toastId = useRef(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([api.getCurrentUser(), api.getLookups()]).then(([u, l]) => {
        if (alive) {
          setUser(u);
          setLookups(l);
        }
      });
    load();
    const off = api.onChange((t) => (t === "users" || t === "all") && load());
    return () => {
      alive = false;
      off();
    };
  }, []);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t) => {
      const id = ++toastId.current;
      setToasts((list) => [...list.slice(-2), { type: "success", ...t, id }]);
      setTimeout(() => dismiss(id), t.type === "error" ? 8000 : 5000);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      user,
      lookups,
      toast,
      openFlagIssue: (prefill = {}) => setFlag(prefill),
      openPalette: () => setPaletteOpen(true),
      openShortcuts: () => setShortcutsOpen(true),
    }),
    [user, lookups, toast],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      {flag && <FlagIssueDialog prefill={flag} onClose={() => setFlag(null)} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </AppContext.Provider>
  );
}
