import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import { formatTimestamp } from "../../lib/format.js";

const LOG_LIMIT = 25;

const shortDay = (ts) => new Date(ts).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
const shortTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
/** "today, 2:15 PM" for today, else "Oct 30, 2026". */
const updatedText = (ts) => (shortDay(ts) === shortDay(Date.now()) ? `today, ${shortTime(ts)}` : shortDay(ts));

/** The change log, newest first, in a panel next to the hovered date. */
function LogPanel({ heading, entries, footer, anchor }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: 0 });
  const shown = entries.slice(0, LOG_LIMIT);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const box = panel.getBoundingClientRect();
    let top = anchor.bottom + 6;
    if (top + box.height > window.innerHeight - 8) top = Math.max(8, anchor.top - box.height - 6);
    const left = Math.min(Math.max(8, anchor.right - box.width), window.innerWidth - box.width - 8);
    setPos({ left, top });
  }, [anchor]);
  const more = entries.length - shown.length;
  return createPortal(<div className="cap-log" ref={panelRef} role="tooltip" style={pos}>
    <div className="cap-log-h"><Icon name="history" />{heading}<span>{entries.length} {entries.length === 1 ? "entry" : "entries"}</span></div>
    <ol>{shown.map((entry) => <li key={entry.key} className={entry.created ? "created" : ""}>
      <div className="cap-log-t"><b>{entry.title}</b><time>{formatTimestamp(entry.ts)}</time></div>
      {entry.lines.map((line, index) => <div key={index} className="cap-log-c">{line}</div>)}
    </li>)}</ol>
    {more > 0 && <div className="cap-log-more">+{more} older {more === 1 ? "entry" : "entries"}</div>}
    {footer && <div className="cap-log-more">{footer}</div>}
  </div>, document.body);
}

/**
 * Table cell: date added, with the last update below it (with the time when it was today).
 * Hover or focus shows the change log. Used by the CAP and Walmart tabs.
 *   entries: newest first, [{ key, title, ts, created, lines: [text or element] }]
 */
export default function ChangeLogCell({ createdAt, updatedAt, heading, label, entries, footer, className = "hide-sm muted cap-date" }) {
  const [anchor, setAnchor] = useState(null);
  const updated = updatedAt || createdAt;
  const changed = updated && createdAt && Math.abs(new Date(updated) - new Date(createdAt)) > 1000;
  useEffect(() => {
    if (!anchor) return undefined;
    const hide = () => setAnchor(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, [anchor]);
  const open = (event) => setAnchor(event.currentTarget.getBoundingClientRect());
  const close = () => setAnchor(null);
  return <td className={className}>
    <div className="cap-logwrap" tabIndex={0} aria-label={label}
      onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <span>{createdAt ? shortDay(createdAt) : "—"}</span>
      {changed && <div className="cap-upd">upd. {updatedText(updated)}</div>}
    </div>
    {anchor && <LogPanel heading={heading} entries={entries} footer={footer} anchor={anchor} />}
  </td>;
}
