import { useEffect, useRef, useState } from "react";

const MENU_WIDTH = 260;
const ITEMS = '[role="menuitem"]:not([disabled])';

/** One menu choice. The menu closes after it is picked. */
export function MenuItem({ onSelect, danger = false, disabled = false, children }) {
  return <button type="button" role="menuitem" className={`mnu-item${danger ? " danger" : ""}`} disabled={disabled} onClick={onSelect}>{children}</button>;
}

/**
 * A button that opens a small menu of actions.
 * The menu is placed on the screen (position: fixed), so a scrolling table or card never cuts it off.
 * Closes on a pick, outside click, Escape (focus returns to the button), scrolling or resizing. Arrow keys move between items.
 * trigger: the button content. children: MenuItem / notes, or ({ close }) => content.
 */
export default function MenuButton({ trigger, className = "btn round", align = "left", label, tip, children }) {
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const open = !!pos;
  const close = () => setPos(null);

  function toggle() {
    if (open) { close(); return; }
    const rect = buttonRef.current.getBoundingClientRect();
    const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
    const left = align === "right" ? rect.right - width : rect.left;
    setPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)), width });
  }

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector(ITEMS)?.focus();
    const onDown = (event) => {
      if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) setPos(null);
    };
    const onKey = (event) => {
      if (event.key === "Escape") { event.stopPropagation(); setPos(null); buttonRef.current?.focus(); return; }
      if (event.key === "Tab") { setPos(null); return; }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...(menuRef.current?.querySelectorAll(ITEMS) || [])];
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next].focus();
    };
    const onMove = (event) => { if (!menuRef.current?.contains(event.target)) setPos(null); };
    const onResize = () => setPos(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return <div className={`mnu${open ? " open" : ""}`}>
    <button type="button" ref={buttonRef} className={className} aria-haspopup="menu" aria-expanded={open} aria-label={label} data-tip={open ? undefined : tip} onClick={toggle}>
      {trigger}</button>
    {open && <div ref={menuRef} role="menu" className="mnu-menu" style={{ top: pos.top, left: pos.left, width: pos.width }}
      onClick={(event) => { if (event.target.closest(ITEMS)) close(); }}>
      {typeof children === "function" ? children({ close }) : children}
    </div>}
  </div>;
}
