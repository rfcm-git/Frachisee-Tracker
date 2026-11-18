import { useEffect } from "react";
import { useDataStore } from "../state/dataStore.js";
import { DIALOG, findDialog, openFranchiseeIssues, openStore, openStoreIssues } from "../state/dialogs.js";
import { saveUiSession, takePendingRestore } from "../state/uiStore.js";

const scrollOf = (id) => document.getElementById(id)?.scrollTop || 0;

/** Saves the screen (tab, filters, open store, scroll) before the page unloads. */
function saveScreen() {
  const store = findDialog(DIALOG.store);
  const storeIssues = findDialog(DIALOG.storeIssues);
  saveUiSession({
    store: store ? store.props.storeId : null,
    storeIssues: storeIssues ? storeIssues.props : null,
    scrollY: window.scrollY,
    frListScroll: scrollOf("frList"),
    storeScroll: { left: scrollOf("sw_left"), right: scrollOf("sw_right") },
  });
}

/** Re-opens the saved store window / issue list and scroll positions after the first data load. */
function restoreScreen(saved) {
  requestAnimationFrame(() => {
    window.scrollTo(0, saved.scrollY || 0);
    const list = document.getElementById("frList");
    if (list) list.scrollTop = saved.frListScroll || 0;
    const { stores } = useDataStore.getState().data;
    if (saved.store && stores.some((store) => store.id === saved.store)) {
      openStore(saved.store);
      requestAnimationFrame(() => {
        const left = document.getElementById("sw_left");
        const right = document.getElementById("sw_right");
        if (left) left.scrollTop = saved.storeScroll?.left || 0;
        if (right) right.scrollTop = saved.storeScroll?.right || 0;
      });
    }
    const issues = saved.storeIssues;
    if (issues?.mode === "fr" && issues.franchiseeId != null) openFranchiseeIssues(issues.franchiseeId);
    else if (issues?.mode === "store" && issues.storeNum != null) openStoreIssues(issues.storeNum);
  });
}

/** Keeps the current screen across a browser refresh. */
export function useSessionRestore() {
  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === "hidden") saveScreen(); };
    window.addEventListener("beforeunload", saveScreen);
    window.addEventListener("pagehide", saveScreen);
    document.addEventListener("visibilitychange", onHidden);

    const unsubscribe = useDataStore.subscribe((state, previous) => {
      if (state.phase === "ready" && previous.phase !== "ready") {
        const saved = takePendingRestore();
        if (saved) restoreScreen(saved);
        unsubscribe();
      }
    });
    return () => {
      window.removeEventListener("beforeunload", saveScreen);
      window.removeEventListener("pagehide", saveScreen);
      document.removeEventListener("visibilitychange", onHidden);
      unsubscribe();
    };
  }, []);
}
