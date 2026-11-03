import { useEffect, useRef } from "react";

const isTyping = (el) =>
  el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

/**
 * Global single-key and two-key ("g d") shortcuts. Ignored while typing in a
 * field or when a dialog is open (the dialog owns the keyboard).
 * map: { "/": fn, "n": fn, "g d": fn, "mod+k": fn }
 */
export function useHotkeys(map) {
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  });
  useEffect(() => {
    let prefix = null;
    let timer;
    function onKey(e) {
      const m = mapRef.current;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && m["mod+k"]) {
        e.preventDefault();
        m["mod+k"]();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector("[role=dialog][aria-modal=true]")) return;
      const key = e.key === "?" ? "?" : e.key.toLowerCase();
      if (prefix) {
        const combo = `${prefix} ${key}`;
        prefix = null;
        clearTimeout(timer);
        if (m[combo]) {
          e.preventDefault();
          m[combo]();
        }
        return;
      }
      if (key === "g") {
        prefix = "g";
        timer = setTimeout(() => (prefix = null), 900);
        return;
      }
      if (m[key]) {
        e.preventDefault();
        m[key]();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, []);
}
