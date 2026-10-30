import { useEffect, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import { formatTimestamp, plural } from "../../lib/format.js";
import {
  clearNotifications, deliverIncoming, markAllRead, markRead, markUnread, removeNotification,
  setNotifyPanelOpen, setNotifyPosition, useNotificationStore,
} from "../../state/notificationStore.js";
import { openCallDetails, openCapForm } from "../../state/dialogs.js";
import { showCaps } from "../../state/uiStore.js";
import { toast } from "../../state/toastStore.js";
import { snoozeCallReminder } from "../calls/callReminders.js";

const SIZE = 48;         // floating box, px
const EDGE = 12;         // closest it may sit to the window edge
const SHOW_MS = 3000;    // how long a new card stays up
const QUEUED_SHOW_MS = 1600;
const DROP_MS = 650;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function clampPosition(pos) {
  const maxX = window.innerWidth - SIZE - EDGE;
  const maxY = window.innerHeight - SIZE - EDGE;
  const x = pos ? pos.x : maxX - 12;
  const y = pos ? pos.y : maxY - 12;
  return { x: Math.round(Math.max(EDGE, Math.min(maxX, x))), y: Math.round(Math.max(EDGE, Math.min(maxY, y))) };
}

/** Places a card or panel next to the box, on whichever side has room. */
function anchorStyle({ x, y }) {
  const style = {};
  if (y + SIZE / 2 > window.innerHeight / 2) style.bottom = window.innerHeight - y + 10;
  else style.top = y + SIZE + 10;
  if (x + SIZE / 2 > window.innerWidth / 2) style.right = Math.max(EDGE, window.innerWidth - x - SIZE);
  else style.left = Math.max(EDGE, x);
  return style;
}

function relativeTime(ts, now) {
  const mins = Math.round((now - ts) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function dayGroup(ts, now) {
  const start = new Date(now).setHours(0, 0, 0, 0);
  if (ts >= start) return "Today";
  if (ts >= start - 86_400_000) return "Yesterday";
  return "Earlier";
}

function openTarget(item) {
  markRead(item.id);
  if (item.target?.type === "call") openCallDetails(item.target.id);
  else if (item.target?.type === "cap") { showCaps(); openCapForm(item.target.id); }
  else if (item.target?.type === "caps") showCaps("", item.target.due);
}

function snoozeCall(item) {
  snoozeCallReminder(item.target.id, Date.now() + 15 * 60_000);
  removeNotification(item.id);
  toast("Reminder snoozed for 15 minutes", "ok");
}

function NotificationItem({ item, now }) {
  const isCall = item.target?.type === "call";
  const isCap = item.target?.type === "cap" || item.target?.type === "caps";
  return <li className={`nt-item${item.read ? "" : " unread"}${item.tone ? ` ${item.tone}` : ""}`}>
    <span className="nt-ic"><Icon name={item.icon || "bell"} /></span>
    <div className="nt-main">
      <button type="button" className="nt-open" onClick={() => openTarget(item)}>
        <span className="nt-title">{item.title}</span>
        {item.subtitle ? <span className="nt-sub">{item.subtitle}</span> : null}
        {item.body ? <span className="nt-body">{item.body}</span> : null}
      </button>
      <div className="nt-meta">
        <time dateTime={new Date(item.createdAt).toISOString()} data-tip={formatTimestamp(item.createdAt)}>{relativeTime(item.createdAt, now)}</time>
        {isCall ? <>
          <button type="button" className="nt-link" onClick={() => openTarget(item)}><Icon name="phone" />Open call</button>
          <button type="button" className="nt-link" onClick={() => snoozeCall(item)}><Icon name="alarm-clock" />Snooze 15 min</button>
        </> : null}
        {isCap ? <button type="button" className="nt-link" onClick={() => openTarget(item)}><Icon name="list-checks" />{item.target.type === "cap" ? "Open CAP" : "Open CAPs"}</button> : null}
      </div>
    </div>
    <div className="nt-tools">
      <button type="button" className="nt-tool" aria-label={item.read ? "Mark as unread" : "Mark as read"} data-tip={item.read ? "Mark as unread" : "Mark as read"}
        onClick={() => (item.read ? markUnread(item.id) : markRead(item.id))}><Icon name={item.read ? "circle" : "check"} /></button>
      <button type="button" className="nt-tool" aria-label="Remove notification" data-tip="Remove" onClick={() => removeNotification(item.id)}><Icon name="x" /></button>
    </div>
  </li>;
}

function NotificationPanel({ pos, items, unread, onClose, panelRef }) {
  const [filter, setFilter] = useState(unread ? "unread" : "all");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const shown = filter === "unread" ? items.filter((item) => !item.read) : items;
  const groups = [];
  for (const item of shown) {
    const label = dayGroup(item.createdAt, now);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1).items.push(item);
  }

  return <section className="nt-panel" ref={panelRef} style={anchorStyle(pos)} role="dialog" aria-label="Notifications">
    <header className="nt-head">
      <div><b>Notifications</b><span>{unread ? `${plural(unread, "unread")}` : "All caught up"}</span></div>
      <button type="button" className="nt-tool" aria-label="Close notifications" onClick={onClose}><Icon name="x" /></button>
    </header>
    <div className="nt-bar">
      <div className="nt-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All <em>{items.length}</em></button>
        <button type="button" role="tab" aria-selected={filter === "unread"} className={filter === "unread" ? "on" : ""} onClick={() => setFilter("unread")}>Unread <em>{unread}</em></button>
      </div>
      <button type="button" className="nt-link" disabled={!unread} onClick={markAllRead}><Icon name="check-check" />Mark all read</button>
    </div>
    <div className="nt-list">
      {groups.length ? groups.map((group) => <div key={group.label}>
        <h4>{group.label}</h4>
        <ul>{group.items.map((item) => <NotificationItem key={item.id} item={item} now={now} />)}</ul>
      </div>) : <div className="nt-empty"><Icon name="bell-off" /><b>{filter === "unread" && items.length ? "No unread notifications" : "No notifications yet"}</b><span>New follow-ups and alerts will show up here.</span></div>}
    </div>
    {items.length ? <footer className="nt-foot"><button type="button" className="nt-link danger" onClick={clearNotifications}><Icon name="trash-2" />Clear all</button></footer> : null}
  </section>;
}

/** The incoming card: shows for a few seconds, then drops into the box. */
function IncomingCard({ item, pos, queued, boxRef, onLanded }) {
  const cardRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [dropping, setDropping] = useState(false);
  const landedRef = useRef(onLanded);

  useEffect(() => { landedRef.current = onLanded; });

  useEffect(() => {
    if (paused || dropping) return undefined;
    const timer = window.setTimeout(() => setDropping(true), queued ? QUEUED_SHOW_MS : SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [paused, dropping, queued]);

  useEffect(() => {
    if (!dropping) return undefined;
    const card = cardRef.current;
    const box = boxRef.current;
    if (!card || !box || !card.animate) { landedRef.current(); return undefined; }
    const from = card.getBoundingClientRect();
    const to = box.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const frames = reducedMotion()
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
        { transform: "none", opacity: 1, offset: 0 },
        { transform: `translate(${dx * 0.15}px, ${dy * 0.15 - 14}px) scale(.92)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${dx}px, ${dy}px) scale(.08)`, opacity: 0, offset: 1 },
      ];
    const animation = card.animate(frames, { duration: reducedMotion() ? 200 : DROP_MS, easing: "cubic-bezier(.55,0,.75,.2)", fill: "forwards" });
    animation.onfinish = () => landedRef.current();
    return () => { animation.onfinish = null; animation.cancel(); };
  }, [dropping, boxRef]);

  return <section ref={cardRef} className={`nt-card${item.tone ? ` ${item.tone}` : ""}`} style={anchorStyle(pos)} role="status"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    <span className="nt-ic"><Icon name={item.icon || "bell"} /></span>
    <div className="nt-main">
      <span className="nt-title">{item.title}</span>
      {item.subtitle ? <span className="nt-sub">{item.subtitle}</span> : null}
      {item.body ? <span className="nt-body">{item.body}</span> : null}
    </div>
    <button type="button" className="nt-tool" aria-label="Send to notifications" data-tip="Send to notifications" onClick={() => setDropping(true)}><Icon name="arrow-down" /></button>
    {!dropping && !paused ? <i className="nt-timer" style={{ animationDuration: `${queued ? QUEUED_SHOW_MS : SHOW_MS}ms` }} /> : null}
  </section>;
}

export default function NotificationHost() {
  const items = useNotificationStore((state) => state.items);
  const incoming = useNotificationStore((state) => state.incoming);
  const storedPos = useNotificationStore((state) => state.position);
  const panelOpen = useNotificationStore((state) => state.panelOpen);
  const [, setViewport] = useState(0);
  const [dragPos, setDragPos] = useState(null);
  const [caught, setCaught] = useState(0);
  const boxRef = useRef(null);
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  const pos = dragPos || clampPosition(storedPos);
  const unread = items.reduce((count, item) => count + (item.read ? 0 : 1), 0);
  const current = incoming[0];

  useEffect(() => {
    const onResize = () => setViewport((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // With the panel open the new item shows there straight away.
  useEffect(() => {
    if (panelOpen && current) deliverIncoming();
  }, [panelOpen, current]);

  useEffect(() => {
    if (!panelOpen) return undefined;
    const onPointer = (event) => {
      if (panelRef.current?.contains(event.target) || boxRef.current?.contains(event.target)) return;
      if (event.target.closest?.(".overlay")) return;
      setNotifyPanelOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== "Escape" || document.querySelector(".overlay.show")) return;
      setNotifyPanelOpen(false);
      boxRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [panelOpen]);

  function landed() {
    deliverIncoming();
    setCaught((n) => n + 1);
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, x: pos.x, y: pos.y, moved: false };
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) { drag.moved = true; setNotifyPanelOpen(false); }
    setDragPos(clampPosition({ x: drag.x + dx, y: drag.y + dy }));
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.moved) return;
    suppressClickRef.current = true;
    setNotifyPosition(dragPos || pos);
    setDragPos(null);
  }

  function onClick() {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    setNotifyPanelOpen(!panelOpen);
  }

  function onKeyDown(event) {
    const step = event.shiftKey ? 64 : 16;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setNotifyPosition(clampPosition({ x: pos.x + move[0], y: pos.y + move[1] }));
  }

  const jiggle = unread > 0 && !panelOpen && !dragPos && !current;
  const label = `Notifications${unread ? `, ${unread} unread` : ""}. Drag or use arrow keys to move.`;

  return <>
    <button type="button" ref={boxRef} className={`nt-box${jiggle ? " jiggle" : ""}${dragPos ? " dragging" : ""}${panelOpen ? " open" : ""}`}
      style={{ left: pos.x, top: pos.y }} aria-label={label} aria-expanded={panelOpen} aria-haspopup="dialog"
      data-tip={dragPos || panelOpen ? undefined : "Notifications · drag to move"}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onClick={onClick} onKeyDown={onKeyDown}>
      <span className="nt-box-face" key={caught} data-caught={caught ? "" : undefined}><Icon name={unread ? "bell-ring" : "bell"} /></span>
      {unread ? <span className="nt-badge" key={`b${unread}`} aria-hidden="true">{unread > 99 ? "99+" : unread}</span> : null}
    </button>
    {panelOpen ? <NotificationPanel pos={pos} items={items} unread={unread} panelRef={panelRef} onClose={() => setNotifyPanelOpen(false)} /> : null}
    {current && !panelOpen && !dragPos
      ? <IncomingCard key={current.id} item={current} pos={pos} queued={incoming.length > 1} boxRef={boxRef} onLanded={landed} />
      : null}
  </>;
}
