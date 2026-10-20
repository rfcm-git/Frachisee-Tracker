import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

export function FilterOption({ selected, checkable = false, onClick, children }) {
  return <button type="button" className={`fdd-opt${checkable ? " fdd-ck" : ""}${selected ? " on" : ""}`} onClick={onClick}>
    {checkable && <span className={`cbox${selected ? " on" : ""}`}>{selected && <Icon name="check" />}</span>}
    {children}{selected && !checkable && <Icon name="check" className="ck" />}
  </button>;
}

/**
 * Dropdown filter button. Closes on outside click or Escape.
 * children can be a function ({ close }) => content.
 */
export default function FilterDropdown({ icon, label, value, active, children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const close = () => setOpen(false);
  return <div className={`fdd${open ? " open" : ""}`} ref={rootRef}>
    <button type="button" className={`fdd-btn${active ? " active" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon name={icon} /><span>{label}</span>{value && <span className="fdd-val">{value}</span>}<Icon name="chevron-down" className="car" />
    </button>
    {open && <div className="fdd-menu">{typeof children === "function" ? children({ close }) : children}</div>}
  </div>;
}
