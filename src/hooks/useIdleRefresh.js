import { useEffect } from "react";
import { hasDb } from "../services/api.js";
import { loadAll } from "../state/appActions.js";
import { isAnyFormOpen } from "../state/dialogStore.js";
import { useUiStore } from "../state/uiStore.js";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];
const CHECK_EVERY_MS = 15000;

/**
 * Reloads the data in the background after some minutes without activity (Settings → Auto-refresh).
 * Waits while a form is open so nothing being typed is lost.
 */
export function useIdleRefresh() {
  useEffect(() => {
    let lastActive = Date.now();
    const markActive = () => { lastActive = Date.now(); };
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, markActive, { passive: true, capture: true }));
    const unsubscribe = useUiStore.subscribe((state, previous) => { if (state.idleMinutes !== previous.idleMinutes) markActive(); });
    const timer = window.setInterval(() => {
      const minutes = useUiStore.getState().idleMinutes;
      if (!minutes || !hasDb()) return;
      if (Date.now() - lastActive < minutes * 60000) return;
      if (isAnyFormOpen()) return;
      markActive();
      loadAll({ silent: true });
    }, CHECK_EVERY_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActive, { capture: true }));
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);
}
