import { useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { BusyButton, CallOutcomeBadge, FollowUpBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { CALL_OUTCOMES } from "../../config/constants.js";
import { callFranchiseeName, callHistory, followUpTimeInPast, hasOpenFollowUp, latestCallUpdate } from "../../domain/calls.js";
import { formatCallTime, formatTimestamp, localDateTimeInput, nowIso } from "../../lib/format.js";
import { oneLine } from "../../lib/richText.js";
import { useDataContext, replaceRow } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import { guardedUpdate, TABLES } from "../../services/api.js";
import { saveSucceeded } from "../../state/feedback.js";
import { errorTitle } from "../../lib/errors.js";
import { askNotificationPermission, clearCallSnooze } from "./callReminders.js";

const MAX_TEXT = 4000;

function tomorrowAtNine() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

function suggestedTime(kind) {
  const date = new Date();
  if (kind === "hour") date.setHours(date.getHours() + 1);
  if (kind === "tomorrow") date.setDate(date.getDate() + 1);
  if (kind === "days") { date.setDate(date.getDate() + 3); date.setHours(9, 0, 0, 0); }
  return localDateTimeInput(date);
}

function FieldError({ id, message }) {
  return <div className={`fld-err${message ? " show" : ""}`} id={id} role="alert">{message}</div>;
}

/** Shows whether saving keeps the follow-up open or closes it. */
function FollowUpState({ outcome }) {
  if (!outcome) return <div className="cfu-state"><Icon name="info" /><span>Pick the outcome of this follow-up.</span></div>;
  if (outcome === "Completed") return <div className="cfu-state closed"><Icon name="circle-check" /><span><b>The follow-up will be closed.</b> The call is Completed.</span></div>;
  return <div className="cfu-state open"><Icon name="repeat" /><span><b>The follow-up stays open</b> because the call is not Completed yet. Set when to follow up next — you’ll get a reminder.</span></div>;
}

export default function CallFollowUpDialog({ callId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const call = ctx.callLogs.find((item) => item.id === callId);
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [next, setNext] = useState(() => localDateTimeInput(tomorrowAtNine()));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  if (!call) return null;
  const completed = outcome === "Completed";
  const when = formatCallTime(call.call_at);
  const latest = latestCallUpdate(call);

  async function save() {
    if (saving) return;
    const text = note.trim();
    const validation = {};
    if (!outcome) validation.outcome = "Pick the outcome.";
    if (!completed && !text) validation.note = "Write an update — it's required for every outcome except Completed.";
    else if (text.length > MAX_TEXT) validation.note = "Please keep it under 4,000 characters.";
    let nextDate = null;
    if (outcome && !completed) {
      nextDate = next ? new Date(next) : null;
      if (!nextDate || Number.isNaN(nextDate.getTime())) validation.next = "Pick the date and time for the next follow-up.";
      else if (followUpTimeInPast(nextDate)) validation.next = "Pick a time in the future for the reminder.";
    }
    setErrors(validation);
    if (Object.keys(validation).length) { toast("Please fix the highlighted fields", "err"); return; }

    const ts = nowIso();
    const entry = { ts, kind: "follow-up", prev: call.outcome || null, outcome, note: text, closed: completed,
      next: completed ? null : nextDate.toISOString(), follow_up: true };
    const patch = { outcome, follow_up: true, follow_up_done_at: completed ? ts : null,
      next_follow_up_at: completed ? null : nextDate.toISOString(), history: [...callHistory(call), entry] };
    setSaving(true); setBusy(true);
    let result;
    try { result = await guardedUpdate(TABLES.callLogs, call, patch); }
    catch (error) { setSaving(false); toast(errorTitle(error), "err"); return; }
    setSaving(false);
    if (!saveSucceeded(result, "This call log")) return;
    replaceRow("callLogs", result.row);
    clearCallSnooze(call.id);
    setBusy(false);
    close();
    toast(completed ? "Follow-up closed — call Completed" : `Update saved — next follow-up ${formatTimestamp(entry.next)}`, "ok");
    if (!completed) askNotificationPermission();
  }

  return <Modal size="wide" icon="repeat" title={call.follow_up_done_at ? "Reopen follow-up" : "Follow-up update"}
    subtitle={`${callFranchiseeName(ctx, call)}${call.store_num ? ` · Store ${call.store_num}` : ""}`} labelledBy="cfu_title"
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <BusyButton busy={saving} busyLabel="Saving update…" onClick={save}><Icon name={completed ? "circle-check" : "save"} />{completed ? "Save and close follow-up" : "Save update"}</BusyButton></>}>
    <div className="cfu-ctx">
      <div><span className="k">Call</span>{when.date} · {when.time} — {oneLine(call.reason, 110)}</div>
      <div><span className="k">Outcome now</span><CallOutcomeBadge outcome={call.outcome} emptyText="Not set" /> <FollowUpBadge call={call} /></div>
      {latest && <div><span className="k">Latest update</span>{oneLine(latest.note, 160)} <span className="muted">({formatTimestamp(latest.ts)})</span></div>}
      {call.next_follow_up_at && hasOpenFollowUp(call) && <div><span className="k">Follow-up was due</span>{formatTimestamp(call.next_follow_up_at)}</div>}
    </div>
    <div className="field" style={{ marginBottom: 12 }}><label>Outcome now *</label>
      <div className="chips" role="group" aria-label="Outcome">{CALL_OUTCOMES.map((item) => <button type="button" key={item}
        className={`mchip${outcome === item ? " sel" : ""}`} aria-pressed={outcome === item} onClick={() => { setOutcome(item); setBusy(true); }}>{item}</button>)}</div>
      <FieldError id="cfu_out_err" message={errors.outcome} /></div>
    <FollowUpState outcome={outcome} />
    <div className="field" style={{ marginBottom: 12 }}><label htmlFor="cfu_note">Update {!completed && <span className="req">*</span>}</label>
      <textarea id="cfu_note" className="cl-ta" maxLength={MAX_TEXT} value={note} autoFocus aria-describedby="cfu_note_err"
        onChange={(event) => { setNote(event.target.value); setBusy(true); }}
        placeholder="What happened on this follow-up? e.g. Reached owner, will send menu photos tomorrow." />
      <FieldError id="cfu_note_err" message={errors.note} /></div>
    {!completed && <div className="field"><label htmlFor="cfu_next">Next follow-up — date and time *</label>
      <div className="cl-nextrow"><input id="cfu_next" type="datetime-local" value={next} aria-describedby="cfu_next_err" onChange={(event) => { setNext(event.target.value); setBusy(true); }} />
        <button type="button" className="mchip" onClick={() => setNext(suggestedTime("hour"))}>In 1 hour</button>
        <button type="button" className="mchip" onClick={() => setNext(suggestedTime("tomorrow"))} data-tip="Same time as now, tomorrow">Tomorrow</button>
        <button type="button" className="mchip" onClick={() => setNext(suggestedTime("days"))}>In 3 days</button></div>
      <div className="help">You’ll get a reminder at this time while the app is open in your browser.</div>
      <FieldError id="cfu_next_err" message={errors.next} /></div>}
  </Modal>;
}
