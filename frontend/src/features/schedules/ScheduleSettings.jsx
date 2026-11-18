import { useEffect, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import { confirmedToday, formatClock, openOccurrence, repeatSummary, scheduleSummary } from "../../domain/schedules.js";
import { openScheduleConfirm, openScheduleEdit } from "../../state/dialogs.js";
import { saveSchedule, useScheduleStore } from "../../state/scheduleStore.js";
import { toast } from "../../state/toastStore.js";

/** Today's state of a reminder: waiting for confirmation, confirmed, or nothing yet. */
function TodayStatus({ schedule, state, now }) {
  if (!schedule.enabled) return null;
  const open = schedule.confirm ? openOccurrence(schedule, state, now) : null;
  if (open) {
    return <button type="button" className="badge cl-fu-due sc-badge" onClick={() => openScheduleConfirm(schedule.id, open.key)}>
      <Icon name="alarm-clock" />Waiting for confirmation · {formatClock(open.time)}</button>;
  }
  const done = confirmedToday(schedule, state, now);
  if (done) return <span className="badge cl-o-ans sc-badge"><Icon name="circle-check" />Confirmed today at {new Date(done.doneAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>;
  return null;
}

/** Settings section: the scheduled reminders, each with on/off, a summary and Edit. */
export default function ScheduleSettings({ sectionStyle, labelStyle }) {
  const schedules = useScheduleStore((s) => s.schedules);
  const state = useScheduleStore((s) => s.state);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function toggle(schedule, enabled) {
    if (enabled && (!schedule.days.length || !schedule.times.length)) { openScheduleEdit(schedule.id); return; }
    saveSchedule(schedule.id, { enabled });
    toast(`${schedule.name} ${enabled ? "turned on" : "turned off"}`, "ok");
  }

  return <div style={sectionStyle}>
    <label style={labelStyle}>Scheduled reminders</label>
    <ul className="sc-list">
      {schedules.map((schedule) => <li key={schedule.id} className={`sc-row${schedule.enabled ? "" : " off"}`}>
        <input type="checkbox" className="sc-toggle" checked={schedule.enabled} aria-label={`${schedule.name} on`}
          onChange={(event) => toggle(schedule, event.target.checked)} />
        <span className="sc-ic"><Icon name={schedule.icon || "calendar-clock"} /></span>
        <div className="sc-main">
          <b>{schedule.name}</b>
          <span>{schedule.enabled ? scheduleSummary(schedule) : "Off"}</span>
          {schedule.enabled ? <span className="sc-sub">{repeatSummary(schedule)}</span> : null}
          <TodayStatus schedule={schedule} state={state} now={now} />
        </div>
        <button type="button" className="btn sm ghost" onClick={() => openScheduleEdit(schedule.id)}><Icon name="pencil" />Edit</button>
      </li>)}
    </ul>
    <div className="help">Reminders come up at these times while the tracker is open. Ones that need confirming keep coming back until you confirm.</div>
  </div>;
}
