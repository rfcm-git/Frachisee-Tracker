import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside `ref` while open, closes on Esc, restores focus on close. */
export function useFocusTrap(ref, onCloseProp, open) {
  // Keep the latest onClose without re-running the trap (which would move focus).
  const closeRef = useRef(onCloseProp);
  useEffect(() => {
    closeRef.current = onCloseProp;
  });
  useEffect(() => {
    if (!open) return undefined;
    const onClose = () => closeRef.current();
    const prev = document.activeElement;
    const node = ref.current;
    const first = node.querySelector("[data-autofocus]") || node.querySelector(FOCUSABLE) || node;
    first.focus();
    // Listen on the document so keys still work when focus has fallen to <body>
    // (e.g. the button that had focus was removed). Only the topmost dialog acts.
    function onKey(e) {
      const modals = document.querySelectorAll('[aria-modal="true"]');
      if (modals[modals.length - 1] !== node) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const a = items[0];
      const b = items[items.length - 1];
      if (!node.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? b : a).focus();
      } else if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        b.focus();
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault();
        a.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (prev && prev.focus) prev.focus();
    };
  }, [ref, open]);
}

