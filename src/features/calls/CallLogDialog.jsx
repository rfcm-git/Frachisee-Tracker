import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { BusyButton } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { CALL_OUTCOMES } from "../../config/constants.js";
import { followUpTimeInPast, hasOpenFollowUp } from "../../domain/calls.js";
import { storesOf } from "../../domain/context.js";
import { compareStores } from "../../lib/text.js";
import { localDateTimeInput } from "../../lib/format.js";
import { useDataContext } from "../../state/dataStore.js";
import { confirmAction } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { findDuplicateFranchisee } from "../franchisees/franchiseeSelectors.js";
import CallContacts from "./CallContacts.jsx";
import { saveCall } from "./callActions.js";

const MAX_TEXT = 4000;
const FUTURE_GRACE_MS = 10 * 60000;

/** Latest allowed call time (a few minutes ahead for clock differences). */
const latestCallTime = () => new Date(Date.now() + FUTURE_GRACE_MS);

function tomorrowAtNine() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

function quickFollowUpTime(kind) {
  const date = new Date();
  if (kind === "hour") date.setHours(date.getHours() + 1);
  if (kind === "tomorrow") date.setDate(date.getDate() + 1);
  if (kind === "days") { date.setDate(date.getDate() + 3); date.setHours(9, 0, 0, 0); }
  return localDateTimeInput(date);
}

/** Store choices for a franchisee: General, their stores, and the saved store when it moved. */
function storeOptions(ctx, franchiseeId, savedNum) {
  const stores = franchiseeId ? storesOf(ctx, franchiseeId).slice().sort(compareStores) : [];
  const options = [{ value: "", label: "General — no specific store" },
    ...stores.map((store) => ({ value: String(store.id), label: `${store.num} · ${[store.address, store.city].filter(Boolean).join(", ")}` }))];
  let selected = "";
  if (savedNum) {
    const match = stores.find((store) => String(store.num) === String(savedNum));
    if (match) selected = String(match.id);
    else { selected = `num:${savedNum}`; options.push({ value: selected, label: `${savedNum} (no longer on this franchisee)` }); }
  }
  return { stores, options, selected };
}

function FieldError({ id, message }) {
  return <div className={`fld-err${message ? " show" : ""}`} id={id} role="alert">{message}</div>;
}

/**
 * Log a call or edit one.
 * franchiseeId: fixed franchisee (from the franchisee page); callId: the call to edit.
 */
export default function CallLogDialog({ franchiseeId, callId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const existing = callId ? ctx.callLogs.find((call) => call.id === callId) : null;
  const fixedId = existing ? existing.franchisee_id : franchiseeId;
  const fixed = !!(existing || franchiseeId);

  const [initial] = useState(() => {
    const options = storeOptions(ctx, fixedId, existing?.store_num || "");
    return {
      franchiseeId: fixedId ?? null, franchiseeText: "", when: localDateTimeInput(existing ? new Date(existing.call_at) : new Date()),
      store: options.selected, reason: existing?.reason || "", result: existing?.result || "", outcome: existing?.outcome || "", followUp: !!existing && hasOpenFollowUp(existing),
      nextFollowUp: localDateTimeInput(existing?.next_follow_up_at ? new Date(existing.next_follow_up_at) : tomorrowAtNine()), note: "",
      savedNum: existing?.store_num || "",
    };
  });
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const franchiseeRef = useRef(null);
  const whenRef = useRef(null);
  const reasonRef = useRef(null);
  const resultRef = useRef(null);
  const noteRef = useRef(null);
  const followUpRef = useRef(null);
  const [maxWhen] = useState(() => localDateTimeInput(latestCallTime()));

  const franchisee = form.franchiseeId ? ctx.frById.get(form.franchiseeId) : null;
  const completed = form.outcome === "Completed";
  const options = useMemo(() => storeOptions(ctx, form.franchiseeId, form.franchiseeId === initial.franchiseeId ? initial.savedNum : ""), [ctx, form.franchiseeId, initial]);
  const dirty = JSON.stringify({ ...form, savedNum: 0 }) !== JSON.stringify({ ...initial, savedNum: 0 });

  const change = (patch) => { setForm((current) => ({ ...current, ...patch })); setBusy(true); };
  const setError = (key, message) => setErrors((current) => ({ ...current, [key]: message }));

  /** Resolves the typed franchisee name (exact match, ignoring case and spaces). */
  function resolveFranchisee(text, showError) {
    const match = findDuplicateFranchisee(ctx, text.trim(), null);
    if (match?.id !== form.franchiseeId) change({ franchiseeId: match ? match.id : null, store: "" });
    if (showError) setError("franchiseeText", text.trim() && !match ? "No franchisee with that exact name — pick one from the list." : "");
  }

  function requestClose() {
    if (!dirty) { close(); return; }
    confirmAction({ title: "Confirm delete", okLabel: "Discard", text: "Discard this call log? What you typed will not be saved.", onConfirm: () => { close(); } });
  }

  async function save() {
    if (saving) return;
    setSaveError("");
    const next = {};
    const when = form.when ? new Date(form.when) : null;
    const reason = form.reason.trim();
    const result = form.result.trim();
    if (!fixed && !form.franchiseeId) next.franchiseeText = "Pick the franchisee you called.";
    if (fixed && !form.franchiseeId && !existing) { toast("Franchisee missing", "err"); return; }
    if (!when || Number.isNaN(when.getTime())) next.when = "Enter the date and time of the call.";
    else if (when > latestCallTime()) next.when = "The call time can't be in the future.";
    if (!reason) next.reason = "Enter the reason for this call.";
    else if (reason.length > MAX_TEXT) next.reason = "Please keep the reason under 4,000 characters.";
    if (!result) next.result = "Enter the result of the call.";
    else if (result.length > MAX_TEXT) next.result = "Please keep the result under 4,000 characters.";
    const note = form.note.trim();
    if (note.length > MAX_TEXT) next.note = "Please keep the update under 4,000 characters.";
    let nextFollowUpAt = null;
    if (form.followUp) {
      // An unchanged follow-up time is kept even when it has already passed.
      const unchanged = existing?.next_follow_up_at && form.nextFollowUp === localDateTimeInput(new Date(existing.next_follow_up_at));
      nextFollowUpAt = unchanged ? new Date(existing.next_follow_up_at) : form.nextFollowUp ? new Date(form.nextFollowUp) : null;
      if (!nextFollowUpAt || Number.isNaN(nextFollowUpAt.getTime())) next.nextFollowUp = "Pick the date and time for the next follow-up.";
      else if (!unchanged && followUpTimeInPast(nextFollowUpAt)) next.nextFollowUp = "Pick a time in the future for the reminder.";
    }
    setErrors(next);
    const first = ["franchiseeText", "when", "reason", "result", "note", "nextFollowUp"].find((key) => next[key]);
    if (first) {
      const ref = ({ franchiseeText: franchiseeRef, when: whenRef, reason: reasonRef, result: resultRef, note: noteRef })[first];
      if (ref) ref.current?.focus(); else document.getElementById("cl_next_follow")?.focus();
      toast("Please fix the highlighted fields", "err"); return;
    }

    let storeId = null;
    let storeNum = null;
    if (form.store.startsWith("num:")) storeNum = form.store.slice(4);
    else if (form.store) {
      const store = ctx.stores.find((item) => item.id === +form.store);
      if (!store || store.franchisee_id !== form.franchiseeId) { toast("That store doesn't belong to this franchisee", "err"); return; }
      storeId = store.id;
      storeNum = String(store.num);
    }
    const record = {
      franchisee_id: form.franchiseeId, store_id: storeId, store_num: storeNum, call_at: when.toISOString(),
      reason, result, outcome: form.outcome || null, follow_up: form.followUp,
      next_follow_up_at: form.followUp ? nextFollowUpAt.toISOString() : null,
    };
    setSaving(true);
    const outcome = await saveCall(existing, record, franchisee, form.followUp && existing ? note : "");
    setSaving(false);
    if (outcome.ok) close();
    else setSaveError(`${outcome.message} Your entries are still here — fix the problem and try again.`);
  }

  const invalid = (key) => (errors[key] ? { className: "bad", "aria-invalid": "true" } : {});
  const storeHint = form.franchiseeId
    ? (options.stores.length ? `${options.stores.length} store${options.stores.length !== 1 ? "s" : ""} for this franchisee — optional` : "This franchisee has no stores — the call is logged as general")
    : "Pick the franchisee first";
  const fixedMeta = franchisee
    ? `Territory ${franchisee.territory || "—"} · ${storesOf(ctx, franchisee.id).length} store${storesOf(ctx, franchisee.id).length !== 1 ? "s" : ""}`
    : existing ? "Franchisee record no longer exists — name kept from the call" : "";

  return <Modal size="wide" icon="phone-call" title={existing ? "Edit call" : "Log call"} subtitle="Fields marked * are required" labelledBy="cl_title"
    onClose={requestClose}
    footer={<><button type="button" className="btn ghost" onClick={requestClose}>Cancel</button>
      <BusyButton busy={saving} onClick={save}><Icon name="save" />{existing ? "Save changes" : "Save Call"}</BusyButton></>}>
    <div onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(); } }}>
      {fixed ? <div className="cl-fr-ro" style={{ display: "flex" }}><span className="sf-av"><Icon name="user-round" /></span>
        <div><div className="lbl">Franchisee</div><b>{franchisee ? franchisee.name : existing?.franchisee_name || "—"}</b><div className="muted" style={{ fontSize: 12 }}>{fixedMeta}</div></div>
        <span className="cl-lock" data-tip="Filled in from the franchisee you picked. To log a call for someone else, close this and use their phone button."><Icon name="lock" /></span></div>
        : <div className="field" style={{ marginBottom: 14 }}><label htmlFor="cl_fr_in">Franchisee *</label>
          <input id="cl_fr_in" ref={franchiseeRef} list="cl_frlist2" placeholder="Type a franchisee name…" autoComplete="off" autoFocus aria-describedby="cl_fr_in_err"
            value={form.franchiseeText} {...invalid("franchiseeText")}
            onChange={(event) => { change({ franchiseeText: event.target.value }); if (findDuplicateFranchisee(ctx, event.target.value.trim(), null)) resolveFranchisee(event.target.value, true); }}
            onBlur={(event) => resolveFranchisee(event.target.value, true)} />
          <datalist id="cl_frlist2">{ctx.franchisees.map((item) => item.name).filter(Boolean).map((name) => <option key={name} value={name} />)}</datalist>
          <FieldError id="cl_fr_in_err" message={errors.franchiseeText} /></div>}

      <div className={`cl-frcon${form.franchiseeId ? " show" : ""}`} aria-live="polite">
        {form.franchiseeId && <><span className="lbl"><Icon name="contact" />Contact</span>
          <CallContacts ctx={ctx} franchiseeId={form.franchiseeId} emptyText="No phone or email saved for this franchisee — add them with Edit on the franchisee page." /></>}
      </div>

      <div className="fgrid" style={{ marginBottom: 14 }}>
        <div className="field"><label htmlFor="cl_when">Date and time of call *</label>
          <input id="cl_when" ref={whenRef} type="datetime-local" aria-describedby="cl_when_err cl_when_hint" max={maxWhen}
            value={form.when} {...invalid("when")} onChange={(event) => change({ when: event.target.value })} />
          <div className="help" id="cl_when_hint" style={{ marginTop: 4 }}>Now by default — change it to log an earlier call</div>
          <FieldError id="cl_when_err" message={errors.when} /></div>
        <div className="field"><label htmlFor="cl_store">Store number (optional)</label>
          <select id="cl_store" aria-describedby="cl_store_hint" disabled={!form.franchiseeId} value={form.store} onChange={(event) => change({ store: event.target.value })}>
            {options.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <div className="help" id="cl_store_hint" style={{ marginTop: 4 }}>{storeHint}</div></div>
      </div>

      <div className="field" style={{ marginBottom: 14 }}><label htmlFor="cl_reason">Reason for call *</label>
        <textarea id="cl_reason" ref={reasonRef} className={`cl-ta${errors.reason ? " bad" : ""}`} maxLength={MAX_TEXT} placeholder="Enter the reason for this call..." aria-describedby="cl_reason_err"
          autoFocus={fixed} value={form.reason} onChange={(event) => change({ reason: event.target.value })} />
        <FieldError id="cl_reason_err" message={errors.reason} /></div>
      <div className="field" style={{ marginBottom: 14 }}><label htmlFor="cl_result">Result of call *</label>
        <textarea id="cl_result" ref={resultRef} className={`cl-ta${errors.result ? " bad" : ""}`} maxLength={MAX_TEXT} placeholder="Enter the call outcome, response, or next steps..."
          aria-describedby="cl_result_err cl_result_hint" value={form.result} onChange={(event) => change({ result: event.target.value })} />
        <div className="help" id="cl_result_hint" style={{ marginTop: 4 }}>e.g. Franchisee answered and confirmed the details · No answer, voicemail left · Follow-up required · Requested more information · Call completed</div>
        <FieldError id="cl_result_err" message={errors.result} /></div>
      <div className="field" style={{ marginBottom: 10 }}><label>Outcome</label>
        <div className="chips" role="group" aria-label="Outcome">{CALL_OUTCOMES.map((outcome) => {
          const on = form.outcome === outcome;
          return <button type="button" key={outcome} className={`mchip${on ? " sel" : ""}`} aria-pressed={on}
            onClick={() => {
              const selected = on ? "" : outcome;
              change({ outcome: selected, ...(selected === "Completed" ? { followUp: false } : !on && outcome === "Follow-up required" ? { followUp: true } : {}) });
            }}>{outcome}</button>;
        })}</div>
        <div className="help" style={{ marginTop: 4 }}>Tick <b>Needs follow-up</b> to set a reminder. Add follow-up updates later from the list.</div></div>
      <label className="ob-syncrow"><input type="checkbox" checked={form.followUp} disabled={completed}
        onChange={(event) => {
          const checked = event.target.checked;
          change({ followUp: checked, ...(checked && !form.nextFollowUp ? { nextFollowUp: localDateTimeInput(tomorrowAtNine()) } : {}) });
          if (checked) {
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            setTimeout(() => {
              followUpRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
              (existing ? noteRef.current : document.getElementById("cl_next_follow"))?.focus({ preventScroll: true });
            }, 250);
          }
        }} />
        <span><b>Needs follow-up</b> — stays open until the call is Completed</span></label>
      <div className="help" style={{ margin: "2px 0 0 25px" }}>{completed ? "Completed calls don’t need a follow-up." : ""}</div>
      {form.followUp && <div className="cl-upd show" ref={followUpRef}>
        {existing && <div className="field" style={{ marginBottom: 12 }}><label htmlFor="cl_upd">Update</label>
          <textarea id="cl_upd" ref={noteRef} className={`cl-ta${errors.note ? " bad" : ""}`} maxLength={MAX_TEXT} aria-describedby="cl_upd_hint cl_upd_err"
            placeholder="What happened, and what is the next step? e.g. Left voicemail — will call back Thursday."
            value={form.note} onChange={(event) => change({ note: event.target.value })} />
          <div className="help" id="cl_upd_hint" style={{ marginTop: 4 }}>Optional — add a note about this change.</div>
          <FieldError id="cl_upd_err" message={errors.note} /></div>}
        <div className="field"><label htmlFor="cl_next_follow">Next follow-up — date and time *</label>
          <div className="cl-nextrow"><input id="cl_next_follow" type="datetime-local" value={form.nextFollowUp} aria-describedby="cl_next_follow_err"
            onChange={(event) => change({ nextFollowUp: event.target.value })} />
            <button type="button" className="mchip" onClick={() => change({ nextFollowUp: quickFollowUpTime("hour") })}>In 1 hour</button>
            <button type="button" className="mchip" data-tip="Same time as now, tomorrow" onClick={() => change({ nextFollowUp: quickFollowUpTime("tomorrow") })}>Tomorrow</button>
            <button type="button" className="mchip" onClick={() => change({ nextFollowUp: quickFollowUpTime("days") })}>In 3 days</button></div>
          <div className="help">You’ll get a reminder at this time while the app is open in your browser.</div>
          <FieldError id="cl_next_follow_err" message={errors.nextFollowUp} /></div>
      </div>}
      <div className={`cl-err${saveError ? " show" : ""}`} role="alert"><Icon name="circle-alert" /><span>{saveError}</span></div>
    </div>
  </Modal>;
}
