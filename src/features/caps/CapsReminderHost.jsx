import { useEffect } from "react";
import { CAP_DUE_SOON_DAYS, STORAGE_KEYS } from "../../config/constants.js";
import { capContact, capDueDate, capDueState, capDueText, formatDueDate } from "../../domain/caps.js";
import { local } from "../../lib/storage.js";
import { plural } from "../../lib/format.js";
import { useDataContext, useDataStore } from "../../state/dataStore.js";
import { openCapForm } from "../../state/dialogs.js";
import { notify } from "../../state/notificationStore.js";
import { showCaps } from "../../state/uiStore.js";

/** Due states that raise a reminder, most urgent first. */
const STAGES = ["overdue", "today", "soon"];
const TITLES = { overdue: "CAP submission overdue", today: "CAP submission due today", soon: "CAP submission due soon" };
/** More new reminders than this at once are combined into one notification. */
const MAX_SEPARATE = 3;
const CHECK_MS = 5 * 60_000;

/**
 * Open CAPs whose due state reached a new stage (due soon → due today → overdue) since the last reminder.
 * Each record is reminded once per stage and due date; changing the due date starts over.
 */
function newlyDue(caps, now) {
  const reminded = local.getJson(STORAGE_KEYS.capReminded, {}) || {};
  const due = [];
  const keep = {};
  caps.forEach((record) => {
    const stage = capDueState(record, now);
    if (!STAGES.includes(stage)) return;
    const key = `${record.id}|${capDueDate(record)}|${stage}`;
    keep[key] = reminded[key] || now.getTime();
    if (!reminded[key]) due.push({ record, stage });
  });
  // Only keep keys of records that still need one, so the list does not grow forever.
  local.setJson(STORAGE_KEYS.capReminded, keep);
  return due.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage));
}

function desktop(title, body, tag, onClick) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const notification = new Notification(title, { body, tag });
      notification.onclick = () => { window.focus(); onClick(); notification.close(); };
    }
  } catch { /* The in-app notification is still there if desktop notifications fail. */ }
}

function remindOne(ctx, { record, stage }) {
  const { name } = capContact(ctx, record);
  const who = `${name || "Unknown franchisee"} · Store ${record.store_num}`;
  const when = `${capDueText(record)} (${formatDueDate(record.due_date)})`;
  notify({
    title: TITLES[stage], subtitle: who, body: `${when} · status ${record.status}`,
    icon: stage === "overdue" ? "triangle-alert" : "alarm-clock", tone: stage === "overdue" ? "err" : "warn",
    target: { type: "cap", id: record.id },
  });
  desktop(`${TITLES[stage]} · Store ${record.store_num}`, `${name ? `${name} — ` : ""}${when}`, `cap-${record.id}-${stage}`, () => openCapForm(record.id));
}

function remindMany(items) {
  const count = (stage) => items.filter((item) => item.stage === stage).length;
  const parts = [count("overdue") && `${count("overdue")} overdue`, count("today") && `${count("today")} due today`, count("soon") && `${count("soon")} due in the next ${CAP_DUE_SOON_DAYS} days`].filter(Boolean);
  const due = count("overdue") ? "overdue" : "week";
  const stores = items.slice(0, 8).map((item) => item.record.store_num).join(", ");
  notify({
    title: `${plural(items.length, "CAP submission")} need attention`, subtitle: parts.join(" · "), body: `Stores ${stores}${items.length > 8 ? "…" : ""}`,
    icon: "triangle-alert", tone: count("overdue") ? "err" : "warn", target: { type: "caps", due },
  });
  desktop(`${plural(items.length, "CAP submission")} need attention`, parts.join(" · "), "caps-due", () => showCaps("", due));
}

/** Watches CAP submission due dates and raises a notification when one is due soon, due today or overdue. */
export default function CapsReminderHost() {
  const ctx = useDataContext();
  // Only after a load: the empty data shown before it would clear the list of reminders already sent.
  const loaded = useDataStore((state) => state.phase === "ready");

  useEffect(() => {
    if (!loaded || !ctx.capsReady || !ctx.capsDueReady) return undefined;
    const check = () => {
      const items = newlyDue(ctx.caps, new Date());
      if (items.length > MAX_SEPARATE) remindMany(items);
      else items.forEach((item) => remindOne(ctx, item));
    };
    check();
    const timer = window.setInterval(check, CHECK_MS);
    return () => window.clearInterval(timer);
  }, [ctx, loaded]);

  return null;
}
