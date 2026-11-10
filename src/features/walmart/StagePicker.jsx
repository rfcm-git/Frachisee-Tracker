import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../../components/ui/Icon.jsx";
import { WM_STAGES, WM_STAGE_INFO } from "../../config/constants.js";
import { wmPlatformStatus, wmStageClass } from "../../domain/walmart.js";
import { updateWalmart } from "./walmartActions.js";

/** The main path; Exempted sits outside it. */
const PATH = ["Awaiting App", "Payment Setup", "Account Created"];

/** Three small segments showing how far along the path a stage is; Exempted shows a "skipped" mark instead. */
export function StageTrack({ stage }) {
  const step = PATH.indexOf(stage);
  if (step < 0) return <span className="wm-track skip" aria-hidden="true"><Icon name="circle-off" /></span>;
  return <span className="wm-track" aria-hidden="true">{PATH.map((item, index) => <i key={item} className={index <= step ? "on" : ""} />)}</span>;
}

/** Stage chip: shows the stage and its place on the path; opens a menu to change it (saved right away, the store's Walmart status follows). */
export default function StagePicker({ record, stage }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState(null);
  const [active, setActive] = useState(() => WM_STAGES.indexOf(stage));
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);

  // Place the menu under the chip (above when there is no room), inside the window.
  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current?.getBoundingClientRect();
    const menu = menuRef.current?.getBoundingClientRect();
    if (!button || !menu) return;
    const below = button.bottom + 6;
    const top = below + menu.height > window.innerHeight - 8 ? Math.max(8, button.top - menu.height - 6) : below;
    const left = Math.min(Math.max(8, button.left), window.innerWidth - menu.width - 8);
    setPos({ top, left });
  }, [open]);

  // Once placed, focus the current stage so the arrow keys work straight away.
  useEffect(() => {
    if (open && pos) itemRefs.current[WM_STAGES.indexOf(stage)]?.focus({ preventScroll: true });
  }, [open, pos, stage]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onDown = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);

  function openMenu() {
    setActive(WM_STAGES.indexOf(stage));
    setPos(null);
    setOpen(true);
  }

  async function choose(value) {
    setOpen(false);
    buttonRef.current?.focus();
    if (value === stage) return;
    setSaving(true);
    await updateWalmart(record, { stage: value });
    setSaving(false);
  }

  function onMenuKey(event) {
    const move = (step) => {
      event.preventDefault();
      const next = (active + step + WM_STAGES.length) % WM_STAGES.length;
      setActive(next);
      itemRefs.current[next]?.focus();
    };
    if (event.key === "ArrowDown") move(1);
    else if (event.key === "ArrowUp") move(-1);
    else if (event.key === "Home") move(-active);
    else if (event.key === "End") move(WM_STAGES.length - 1 - active);
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); buttonRef.current?.focus(); }
    else if (event.key === "Tab") setOpen(false);
  }

  const menuId = `wm-stage-menu-${record.id}`;
  return <>
    <button type="button" ref={buttonRef} className={`wm-stage ${wmStageClass(stage)}${saving ? " saving" : ""}`} disabled={saving}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-busy={saving}
      aria-label={`Stage of store ${record.store_num}: ${stage}. Change stage`}
      onClick={() => (open ? setOpen(false) : openMenu())}
      onKeyDown={(event) => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); openMenu(); } }}>
      <span className="wm-stage-dot" />
      <span className="wm-stage-lbl">{stage}</span>
      {saving ? <span className="wm-spin" aria-hidden="true" /> : <StageTrack stage={stage} />}
      <Icon name="chevron-down" className="wm-stage-car" />
    </button>
    {open && createPortal(<div className="wm-menu" id={menuId} role="menu" ref={menuRef} aria-label={`Stage of store ${record.store_num}`}
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }} onKeyDown={onMenuKey}>
      <div className="wm-menu-h">Move store {record.store_num} to</div>
      {WM_STAGES.map((value, index) => {
        const current = value === stage;
        return <button type="button" key={value} role="menuitemradio" aria-checked={current} tabIndex={index === active ? 0 : -1}
          ref={(element) => { itemRefs.current[index] = element; }} className={`wm-menu-item ${wmStageClass(value)}${current ? " current" : ""}`}
          onClick={() => choose(value)} onMouseEnter={() => setActive(index)}>
          <span className="wm-stage-dot" />
          <span className="wm-menu-tx"><b>{value}</b><span>{WM_STAGE_INFO[value]}</span>
            <em>Walmart status → {wmPlatformStatus(value)}</em></span>
          {current ? <Icon name="check" className="wm-menu-ck" /> : <StageTrack stage={value} />}
        </button>;
      })}
    </div>, document.body)}
  </>;
}
