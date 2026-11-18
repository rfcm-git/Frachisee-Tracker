import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../ui/Icon.jsx";

/**
 * "Preview for" store picker in the email editors. Replaces a native <select> of hundreds of stores:
 * the list opens at exactly the field's width, scrolls inside a fixed height, and has a search box.
 * Keyboard: ↑ ↓ move, Enter picks, Escape closes and returns focus to the field.
 * options: [{ id, label }]; value: the picked id.
 */
export default function PreviewPicker({ id, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const selected = options.find((option) => option.id === value) || options[0];
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options), [options, q]);

  function toggle() {
    if (open) { setOpen(false); return; }
    setQuery("");
    setActive(Math.max(0, options.findIndex((option) => option.id === value)));
    setOpen(true);
  }

  function pick(option) {
    onChange(option.id);
    setOpen(false);
    buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onDown = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted store in view while moving with the arrow keys.
  useEffect(() => {
    if (open) listRef.current?.querySelector(".act")?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function onKeyDown(event) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); buttonRef.current?.focus(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!shown.length) return;
      setActive((index) => (event.key === "ArrowDown" ? Math.min(shown.length - 1, index + 1) : Math.max(0, index - 1)));
      return;
    }
    if (event.key === "Enter" && shown[active]) { event.preventDefault(); pick(shown[active]); }
    if (event.key === "Tab") setOpen(false);
  }

  return <div className={`pp${open ? " open" : ""}`} ref={rootRef}>
    <button type="button" id={id} ref={buttonRef} className="pp-btn" aria-haspopup="listbox" aria-expanded={open} onClick={toggle}>
      <span className="pp-val">{selected?.label || "Pick a store"}</span><Icon name="chevron-down" className="car" />
    </button>
    {open && <div className="pp-panel">
      <div className="pp-search"><Icon name="search" />
        <input ref={inputRef} type="text" value={query} placeholder={`Find one of ${options.length} stores — # or franchisee`} role="combobox"
          aria-expanded="true" aria-controls={listId} aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined} aria-label="Find a store to preview"
          onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={onKeyDown} />
      </div>
      {shown.length ? <ul className="pp-list" role="listbox" id={listId} ref={listRef} aria-label="Stores">
        {shown.map((option, index) => <li key={option.id} id={`${listId}-${index}`} role="option" aria-selected={option.id === value}
          className={`${index === active ? "act" : ""}${option.id === value ? " on" : ""}`}
          onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => pick(option)}>
          <span>{option.label}</span>{option.id === value && <Icon name="check" />}</li>)}
      </ul> : <div className="pp-empty">No store matches “{query.trim()}”</div>}
    </div>}
  </div>;
}
