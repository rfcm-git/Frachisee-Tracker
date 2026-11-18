import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { formatClock, repeatSummary } from "../../domain/schedules.js";
import { shortTime } from "../../lib/format.js";
import { openScheduleEdit } from "../../state/dialogs.js";
import { useScheduleStore } from "../../state/scheduleStore.js";
import { confirmSchedule, openScheduleTarget, targetLabel } from "./scheduleActions.js";

/** "Did you do it?" — shown when a scheduled reminder that needs confirming comes due. */
export default function ScheduleConfirmDialog({ scheduleId, occKey }) {
  const { close } = useDialog();
  const schedule = useScheduleStore((s) => s.schedules.find((item) => item.id === scheduleId));
  const entry = useScheduleStore((s) => s.state[occKey]);
  if (!schedule) return null;

  const time = occKey.split("|")[2];
  const done = Boolean(entry?.done);
  const later = schedule.repeatMin ? `Remind me in ${schedule.repeatMin} min` : "Not now";
  const open = targetLabel(schedule.target);

  return <Modal size="small" icon={schedule.icon || "calendar-clock"} title={schedule.name} subtitle={`Scheduled for ${formatClock(time)}`} role="alertdialog"
    footer={done
      ? <button type="button" className="btn" onClick={close} autoFocus>Close</button>
      : <>
        <button type="button" className="btn ghost" onClick={close}>{later}</button>
        {open ? <button type="button" className="btn outline" onClick={() => { close(); openScheduleTarget(schedule.target); }}><Icon name="arrow-right" />{open}</button> : null}
        <button type="button" className="btn" onClick={() => confirmSchedule(occKey)} autoFocus><Icon name="circle-check" />Yes, it's done</button>
      </>}>
    {done
      ? <div className="sc-ask-done" role="status">
        <span className="sc-done-ic"><Icon name="check" /></span>
        <div>
          <b>Marked as done at {shortTime(new Date(entry.done))}</b>
          <span>Saved to your notifications — it won't ask again, on any device.</span>
        </div>
      </div>
      : <>
        {schedule.message ? <p className="sc-ask-msg">{schedule.message}</p> : null}
        <div className="sc-ask-meta">
          <Icon name="repeat" />
          <span>{repeatSummary(schedule)}. <button type="button" className="nt-link sc-ask-edit"
            onClick={() => { close(); openScheduleEdit(schedule.id); }}>Change this reminder</button></span>
        </div>
      </>}
  </Modal>;
}
