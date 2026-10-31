import { useEffect } from "react";
import { useDialogStore } from "../state/dialogStore.js";
import { openFind } from "../state/uiStore.js";

const isTyping = (target) => !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** "/" (when not typing) or Ctrl+K / Cmd+K opens the Search tab, unless a dialog is open. */
export function useSearchShortcut() {
  useEffect(() => {
    const onKey = (event) => {
      if (useDialogStore.getState().dialogs.length) return;
      const ctrlK = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target);
      if (!ctrlK && !slash) return;
      event.preventDefault();
      openFind();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
