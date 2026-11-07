import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { CAP_EMAIL_FIELDS, CAP_EMAIL_STATUS, DEFAULT_CAP_EMAIL, MAILTO_SAFE_LENGTH, badEmails, buildCapEmail, unknownPlaceholders } from "../../domain/capEmail.js";
import { capContact } from "../../domain/caps.js";
import { compareNumbers } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import { currentCapEmail, saveCapEmail, savedCapEmail } from "./capEmailActions.js";

const CC_FIELDS = [
  ["ccHouston", "CC for Houston stores", "Territory 540, or a Houston, TX address"],
  ["ccOther", "CC for every other store", "Any store not in Houston"],
  ["ccAlways", "Always CC", "Added to every email"],
];

/**
 * Edit the CAP email (subject, message and CC rules) with a live preview for one store.
 * previewCapId picks the store shown in the preview.
 */
export default function CapEmailDialog({ previewCapId = null }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const [values, setValues] = useState(() => {
    const { subject, body, ccHouston, ccOther, ccAlways } = currentCapEmail(ctx);
    return { subject, body, ccHouston, ccOther, ccAlways };
  });
  const [saving, setSaving] = useState(false);
  const records = useMemo(() => ctx.caps.slice().sort((a, b) => compareNumbers(a.store_num, b.store_num)), [ctx.caps]);
  const [previewId, setPreviewId] = useState(() => previewCapId ?? (records.find((record) => capContact(ctx, record).email) || records[0])?.id ?? null);
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const lastField = useRef("body");
  const neverSaved = savedCapEmail(ctx) === null;

  const change = (field, value) => { setValues((current) => ({ ...current, [field]: value })); setBusy(true); };

  /** Inserts {{name}} at the cursor of the subject or message (whichever was used last). */
  function insert(name) {
    const field = lastField.current;
    const element = (field === "subject" ? subjectRef : bodyRef).current;
    const token = `{{${name}}}`;
    const text = values[field];
    const start = element ? element.selectionStart ?? text.length : text.length;
    const end = element ? element.selectionEnd ?? text.length : text.length;
    change(field, text.slice(0, start) + token + text.slice(end));
    requestAnimationFrame(() => {
      if (!element) return;
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function resetToDefault() {
    setValues({ subject: DEFAULT_CAP_EMAIL.subject, body: DEFAULT_CAP_EMAIL.body, ccHouston: DEFAULT_CAP_EMAIL.ccHouston, ccOther: DEFAULT_CAP_EMAIL.ccOther, ccAlways: DEFAULT_CAP_EMAIL.ccAlways });
    setBusy(true);
  }

  const ccBad = Object.fromEntries(CC_FIELDS.map(([key]) => [key, badEmails(values[key])]));
  const anyCcBad = Object.values(ccBad).some((list) => list.length);
  const unknown = unknownPlaceholders(`${values.subject}\n${values.body}`);
  const record = records.find((item) => item.id === previewId) || null;
  const email = record ? buildCapEmail(ctx, record, values) : null;
  const tooLong = !!email?.href && email.href.length > MAILTO_SAFE_LENGTH;

  async function save() {
    if (!values.subject.trim()) { toast("Add a subject", "err"); subjectRef.current?.focus(); return; }
    if (!values.body.trim()) { toast("Add a message", "err"); bodyRef.current?.focus(); return; }
    if (anyCcBad) { toast("Fix the CC addresses marked in red", "err"); return; }
    setSaving(true);
    const ok = await saveCapEmail(values);
    setSaving(false);
    if (ok) close();
  }

  return <Modal icon="mail" title="CAP email message"
    subtitle={`Used by the email button on each store. Opens in Outlook and sets the status to ${CAP_EMAIL_STATUS}.`}
    modalStyle={{ maxWidth: 1040 }} bodyClass="cem-body"
    footer={<>
      <button type="button" className="btn link" style={{ marginRight: "auto" }} onClick={resetToDefault}><Icon name="rotate-ccw" />Reset to default</button>
      <button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="save" />{saving ? "Saving…" : "Save message"}</button></>}>
    {neverSaved && <div className="cem-note" role="status"><Icon name="info" />This is a starter message. Edit it and click <b>Save message</b> — then the email button on each store is ready to use.</div>}
    <div className="cem-grid">
      <div className="cem-edit">
        <div className="field"><label htmlFor="cem_subject">Subject</label>
          <input id="cem_subject" ref={subjectRef} value={values.subject} className={values.subject.trim() ? "" : "bad"}
            onFocus={() => { lastField.current = "subject"; }} onChange={(event) => change("subject", event.target.value)} /></div>
        <div className="field"><label htmlFor="cem_body">Message</label>
          <textarea id="cem_body" ref={bodyRef} className={`cem-ta${values.body.trim() ? "" : " bad"}`} value={values.body}
            onFocus={() => { lastField.current = "body"; }} onChange={(event) => change("body", event.target.value)} /></div>
        <div className="cem-fields" role="group" aria-label="Insert a store detail">
          <span className="cem-fields-h">Insert at the cursor:</span>
          {CAP_EMAIL_FIELDS.map(([name, tip]) => <button type="button" key={name} className="cem-chip" data-tip={`${tip} — inserts {{${name}}}`}
            onMouseDown={(event) => event.preventDefault()} onClick={() => insert(name)}>{name}</button>)}
        </div>
        {unknown.length > 0 && <div className="cem-warn"><Icon name="triangle-alert" />Not a store detail, so it is sent as typed: {unknown.map((name) => `{{${name}}}`).join(", ")}</div>}
        <div className="cem-help">Your Outlook signature is added by Outlook. The email is plain text — bold, links and pictures are not kept.</div>

        <fieldset className="cem-cc"><legend>CC</legend>
          <div className="cem-help" style={{ margin: "0 0 8px" }}>The store's <b>FBC</b> and <b>OM</b> are always CC'd from the staff list. Anyone listed twice is added once.</div>
          {CC_FIELDS.map(([key, label, hint]) => <div className="field" key={key}><label htmlFor={`cem_${key}`}>{label} <span className="cem-sub">· {hint}</span></label>
            <input id={`cem_${key}`} value={values[key]} className={ccBad[key].length ? "bad" : ""} placeholder="name@email.com, name@email.com"
              aria-invalid={ccBad[key].length > 0} onChange={(event) => change(key, event.target.value)} />
            {ccBad[key].length > 0 && <div className="cem-err"><Icon name="circle-alert" />Not an email address: {ccBad[key].join(", ")}</div>}</div>)}
        </fieldset>
      </div>

      <div className="cem-prev" aria-live="polite">
        <div className="field"><label htmlFor="cem_store">Preview for</label>
          {records.length ? <select id="cem_store" value={previewId ?? ""} onChange={(event) => setPreviewId(Number(event.target.value) || event.target.value)}>
            {records.map((item) => { const contact = capContact(ctx, item); return <option key={item.id} value={item.id}>
              Store {item.store_num}{contact.name ? ` · ${contact.name}` : ""}{contact.email ? "" : " · no email"}</option>; })}
          </select> : <div className="muted">Add a store to the CAP list to see a preview.</div>}</div>
        {email && <div className="cem-mail">
          <div className="cem-row"><span>To</span><b>{email.to || <span className="cem-miss">No email address on file</span>}{email.rajeev && <span className="cem-why">Marwaha store · owner in CC</span>}</b></div>
          <div className="cem-row"><span>CC</span><div>
            <span className={`cem-tag first${email.houston ? " hou" : ""}`}>{email.houston ? "Houston store" : "Other territory"}</span>
            {email.ccInfo.length ? <ul className="cem-cclist">{email.ccInfo.map((entry) => <li key={entry.email}>
              <span className="cem-addr" data-tip={entry.name || undefined}>{entry.email}</span>{entry.why.map((why) => <span key={why} className="cem-why">{why}</span>)}</li>)}</ul>
              : <span className="muted">Nobody</span>}
            {email.store && (!email.team.fbc || !email.team.om) && <div className="cem-miss-team">
              {[!email.team.fbc && "FBC", !email.team.om && "OM"].filter(Boolean).join(" and ")} not set (or has no email) for this store</div>}</div></div>
          <div className="cem-row"><span>Subject</span><b>{email.subject || <span className="cem-miss">Empty</span>}</b></div>
          <div className="cem-text">{email.body}</div>
        </div>}
        {email?.missing.length > 0 && <div className="cem-warn"><Icon name="triangle-alert" />Blank for this store: {email.missing.join(", ")}. Check the wording still reads well.</div>}
        {tooLong && <div className="cem-warn"><Icon name="triangle-alert" />This email is long — Outlook may cut off the end. Shorten the message to be safe.</div>}
      </div>
    </div>
  </Modal>;
}
