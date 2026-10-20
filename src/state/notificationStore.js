/* In-app notification inbox: incoming cards, the floating box's unread count, and its position. */
import { create } from "zustand";
import { STORAGE_KEYS } from "../config/constants.js";
import { local } from "../lib/storage.js";

const MAX_ITEMS = 100;

/**
 * items:    delivered notifications, newest first
 *           { id, title, subtitle, body, icon, tone, target, createdAt, read }
 * incoming: notifications waiting to be shown as a card before they land in the box
 */
export const useNotificationStore = create(() => ({
  items: local.getJson(STORAGE_KEYS.notifications, []).filter((item) => item && item.id),
  incoming: [],
  position: local.getJson(STORAGE_KEYS.notifyPosition, null),
  panelOpen: false,
}));

useNotificationStore.subscribe((state, prev) => {
  if (state.items !== prev.items) local.setJson(STORAGE_KEYS.notifications, state.items);
  if (state.position !== prev.position) local.setJson(STORAGE_KEYS.notifyPosition, state.position);
});

let seq = 0;

/**
 * Adds a notification. It shows as a card first, then drops into the floating box.
 * tone: "" | "ok" | "warn" | "err"; target: what "Open" leads to, e.g. { type: "call", id }.
 */
export function notify({ title, subtitle = "", body = "", icon = "bell", tone = "", target = null }) {
  const item = {
    id: `${Date.now().toString(36)}-${(seq += 1)}`, title: String(title ?? ""), subtitle: String(subtitle ?? ""), body: String(body ?? ""),
    icon, tone, target, createdAt: Date.now(), read: false,
  };
  useNotificationStore.setState((state) => ({ incoming: [...state.incoming, item] }));
  return item.id;
}

/** Moves the card at the front of the queue into the box. */
export function deliverIncoming() {
  useNotificationStore.setState((state) => {
    const [next, ...rest] = state.incoming;
    if (!next) return state;
    return { incoming: rest, items: [next, ...state.items].slice(0, MAX_ITEMS) };
  });
}

const updateItems = (fn) => useNotificationStore.setState((state) => ({ items: fn(state.items) }));

export const markRead = (id) => updateItems((items) => items.map((item) => (item.id === id && !item.read ? { ...item, read: true } : item)));
export const markUnread = (id) => updateItems((items) => items.map((item) => (item.id === id && item.read ? { ...item, read: false } : item)));
export const markAllRead = () => updateItems((items) => (items.some((item) => !item.read) ? items.map((item) => ({ ...item, read: true })) : items));
export const removeNotification = (id) => updateItems((items) => items.filter((item) => item.id !== id));
export const clearNotifications = () => updateItems(() => []);

export const setNotifyPosition = (position) => useNotificationStore.setState({ position });
export const setNotifyPanelOpen = (panelOpen) => useNotificationStore.setState({ panelOpen });
