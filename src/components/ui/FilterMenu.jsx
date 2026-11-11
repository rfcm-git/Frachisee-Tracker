import { useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon.jsx";

const OPTIONS = '.fdd-opt:not([disabled])';

/**
 * One choice in a filter dropdown. checkable = several can be on (checkbox look); otherwise it is a single choice (check mark).
 * Screen readers hear it as a checkbox or radio item with its on/off state.
 */
export function FilterOption({ selected, checkable = false, onClick, children }) {
  return <button type="button" role={checkable ? "menuitemcheckbox" : "menuitemradio"} aria-checked={!!selected}
    className={`fdd-opt${checkable ? " fdd-ck" : ""}${selected ? " on" : ""}`} onClick={onClick}>
    {checkable && <span className={`cbox${selected ? " on" : ""}`} aria-hidden="true">{selected && <Icon name="check" />}</span>}
    {children}{selected && !checkable && <Icon name="check" className="ck" />}
  </button>;
}

/**
 * Dropdown filter button.
 * - Opens below the button; flips to the right edge when it would run off the screen.
 * - Keyboard: focus starts on the picked option (or the first); ↑ ↓ Home End move; Escape closes and returns focus to the button.
 * - Closes on outside click, Escape or Tab.
 * children can be a function ({ close }) => content.
 */
export default function FilterDropdown({ icon, label, value, active, children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const menu = menuRef.current;
    if (menu) {
      // Keep the menu on screen: align it to the button's right edge when it would overflow.
      menu.style.left = "0px";
      menu.style.right = "auto";
      if (menu.getBoundingClientRect().right > window.innerWidth - 8) { menu.style.left = "auto"; menu.style.right = "0px"; }
      (menu.querySelector(`${OPTIONS}.on`) || menu.querySelector(OPTIONS))?.focus({ preventScroll: true });
    }
    const onClick = (event) => { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false); };
    const onKey = (event) => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); buttonRef.current?.focus(); return; }
      if (event.key === "Tab") { setOpen(false); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = [...(menuRef.current?.querySelectorAll(OPTIONS) || [])];
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next].focus();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey, true);
    const button = buttonRef.current;
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey, true);
      // After picking an option the focused item is gone: put focus back on the button (not after a click elsewhere).
      if (document.activeElement === document.body) button?.focus({ preventScroll: true });
    };
  }, [open]);

  const close = () => setOpen(false);
  return <div className={`fdd${open ? " open" : ""}`} ref={rootRef}>
    <button type="button" ref={buttonRef} className={`fdd-btn${active ? " active" : ""}`} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? menuId : undefined} onClick={() => setOpen(!open)}>
      <Icon name={icon} /><span>{label}</span>{value && <span className="fdd-val">{value}</span>}<Icon name="chevron-down" className="car" />
    </button>
    {open && <div className="fdd-menu" id={menuId} role="menu" aria-label={label} ref={menuRef}>
      {typeof children === "function" ? children({ close }) : children}</div>}
  </div>;
}
