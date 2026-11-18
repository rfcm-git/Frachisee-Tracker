import { useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { ChipToggles } from "../../components/ui/Choices.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { DAY_NAMES, SCHEDULE_DEFAULTS, SCHEDULE_TARGETS, isTime, repeatSummary, scheduleSummary } from "../../domain/schedules.js";
import { askNotificationPermission } from "../calls/callReminders.js";
import { getSchedule, resetSchedule, saveSchedule } from "../../state/scheduleStore.js";
import { toast } from "../../state/toastStore.js";

const DAY_OPTIONS = DAY_NAMES.map((name, day) => [day, name]);

function FieldError({ message }) {
  return <div className={`fld-err${message ? " show" : ""}`} role="alert">{message}</div>;
}

/** Edit one scheduled reminder: on/off, days, times, confirmation and repeats, message. */
export default function ScheduleEditDialog({ scheduleId }) {
  const { close, setBusy } = useDialog();
  const [draft, setDraft] = useState(() => getSchedule(scheduleId));
  const [errors, setErrors] = useState({});
  if (!draft) return null;

  const base = SCHEDULE_DEFAULTS.find((item) => item.id === scheduleId);
  const patch = (changes) => { setDraft((d) => ({ ...d, ...changes })); setBusy(true); };
  const toggleDay = (day) => patch({ days: draft.days.includes(day) ? draft.days.filter((d) => d !== day) : [...draft.days, day].sort() });
  const setTime = (index, value) => patch({ times: draft.times.map((time, i) => (i === index ? value : time)) });
  const addTime = () => patch({ times: [...draft.times, draft.times.includes("12:00") ? "13:00" : "12:00"] });
  const removeTime = (index) => patch({ times: draft.times.filter((_, i) => i !== index) });
  const preview = { ...draft, times: [...new Set(draft.times.filter(isTime))].sort() };

  function save() {
    const validation = {};
    if (!draft.name.trim()) validation.name = "Give the reminder a name.";
    if (draft.enabled && !draft.days.length) validation.days = "Pick at least one day, or turn the reminder off.";
    if (draft.enabled && !preview.times.length) validation.times = "Add at least one time, or turn the reminder off.";
    if (draft.times.some((time) => !isTime(time))) validation.times = "Fill in every time, or remove the empty one.";
    setErrors(validation);
    if (Object.keys(validation).length) { toast("Please fix the highlighted fields", "err"); return; }
    const saved = saveSchedule(scheduleId, draft);
    setBusy(false);
    close();
    toast(saved.enabled ? `Saved · ${scheduleSummary(saved)}` : `${saved.name} turned off`, "ok");
    if (saved.enabled) askNotificationPermission();
  }

  function reset() {
    resetSchedule(scheduleId);
    setDraft(getSchedule(scheduleId));
    setErrors({});
    setBusy(false);
    toast("Reminder reset to its default", "ok");
  }

  return <Modal icon={draft.icon || "calendar-clock"} title="Edit reminder" subtitle={base?.name}
    footer={<>
      <button type="button" className="btn ghost" style={{ marginRight: "auto" }} onClick={reset}><Icon name="rotate-ccw" />Reset to default</button>
      <button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" onClick={save}><Icon name="save" />Save reminder</button>
    </>}>
    <label className="sc-switch">
      <input type="checkbox" checked={draft.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />
      <span><b>{draft.enabled ? "On" : "Off"}</b> — {draft.enabled ? `${scheduleSummary(preview)}. ${repeatSummary(draft)}.` : "you won't be reminded."}</span>
    </label>

    <fieldset className="sc-fields" disabled={!draft.enabled}>
      <div className="field"><label htmlFor="sc_name">Name *</label>
        <input id="sc_name" type="text" maxLength={60} value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
        <FieldError message={errors.name} /></div>

      <div className="field"><label>Days</label>
        <ChipToggles label="Days" options={DAY_OPTIONS} selected={draft.days} onToggle={toggleDay} />
        <div className="sc-quick">
          <button type="button" className="nt-link" onClick={() => patch({ days: [0, 1, 2, 3, 4, 5, 6] })}>Every day</button>
          <button type="button" className="nt-link" onClick={() => patch({ days: [1, 2, 3, 4, 5] })}>Weekdays</button>
        </div>
        <FieldError message={errors.days} /></div>

      <div className="field"><label>Times</label>
        <div className="sc-times">
          {draft.times.map((time, index) => <span className="sc-time" key={index}>
            <input type="time" aria-label={`Time ${index + 1}`} value={time} onChange={(event) => setTime(index, event.target.value)} />
            <button type="button" className="nt-tool" aria-label={`Remove time ${index + 1}`} data-tip="Remove" onClick={() => removeTime(index)}><Icon name="x" /></button>
          </span>)}
          <button type="button" className="mchip" onClick={addTime}><Icon name="plus" />Add time</button>
        </div>
        <FieldError message={errors.times} /></div>

      <div className="field">
        <label className="ckrow sc-ck"><input type="checkbox" checked={draft.confirm} onChange={(event) => patch({ confirm: event.target.checked })} />
          Ask me to confirm it's done</label>
        {draft.confirm ? <div className="sc-repeat">
          <span>Remind again every</span>
          <input type="number" className="fnum" min="0" max="240" step="5" aria-label="Minutes between reminders" value={draft.repeatMin}
            onChange={(event) => patch({ repeatMin: event.target.value })} />
          <span>min until</span>
          <input type="time" aria-label="Stop reminding at" value={draft.until} onChange={(event) => patch({ until: event.target.value || base.until })} />
          <span>(end of shift)</span>
        </div> : null}
        <div className="help">{draft.confirm ? "A window asks you to confirm. Until you do, the reminder comes back at this interval — set 0 to remind only once." : "The reminder shows once in your notifications."}</div>
      </div>

      <div className="field"><label htmlFor="sc_target">Button in the reminder</label>
        <select id="sc_target" value={draft.target} onChange={(event) => patch({ target: event.target.value })}>
          {SCHEDULE_TARGETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></div>

      <div className="field"><label htmlFor="sc_msg">Message</label>
        <textarea id="sc_msg" className="cl-ta" maxLength={300} value={draft.message} onChange={(event) => patch({ message: event.target.value })} /></div>
    </fieldset>
    <div className="help">Reminders show while the tracker is open in your browser, using this computer's clock. They're saved for this browser only.</div>
  </Modal>;
}
