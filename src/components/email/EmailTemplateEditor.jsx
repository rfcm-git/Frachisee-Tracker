import { useRef, useState } from "react";
import Icon from "../ui/Icon.jsx";
import Modal from "../ui/Modal.jsx";
import { useDialog } from "../dialogs/dialogContext.js";
import { MAILTO_SAFE_LENGTH, badEmails, unknownPlaceholders } from "../../domain/capEmail.js";
import { toast } from "../../state/toastStore.js";

const CC_FIELDS = [
  ["ccHouston", "CC for Houston stores", "Territory 540, or a Houston, TX address"],
  ["ccOther", "CC for every other store", "Any store not in Houston"],
  ["ccAlways", "Always CC", "Added to every email"],
];
const TEMPLATE_KEYS = ["subject", "body", ...CC_FIELDS.map(([key]) => key)];
const pick = (template) => Object.fromEntries(TEMPLATE_KEYS.map((key) => [key, template[key] ?? ""]));

/**
 * Editor for an email template (subject, message with {{placeholders}}, CC rules) with a live preview for one store.
 * Used by the CAP email and the onboarding email.
 *   fields: [[name, description]] placeholders offered as chips
 *   initial / defaults: templates ({ subject, body, ccHouston, ccOther, ccAlways })
 *   previewOptions: [{ id, label }]; buildPreview(values, id) -> email from recipientsFor + composeEmail
 *   onSave(values) -> Promise<boolean>
 */
export default function EmailTemplateEditor({ title, subtitle, fields, initial, defaults, neverSaved, starterText, previewOptions, initialPreviewId, buildPreview, emptyPreviewText, onSave }) {
  const { close, setBusy } = useDialog();
  const [values, setValues] = useState(() => pick(initial));
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState(() => initialPreviewId ?? previewOptions[0]?.id ?? null);
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const lastField = useRef("body");

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
    setValues(pick(defaults));
    setBusy(true);
  }

  const ccBad = Object.fromEntries(CC_FIELDS.map(([key]) => [key, badEmails(values[key])]));
  const anyCcBad = Object.values(ccBad).some((list) => list.length);
  const unknown = unknownPlaceholders(`${values.subject}\n${values.body}`, fields);
  const email = previewId != null && previewOptions.some((option) => option.id === previewId) ? buildPreview(values, previewId) : null;
  const tooLong = !!email?.href && email.href.length > MAILTO_SAFE_LENGTH;

  async function save() {
    if (!values.subject.trim()) { toast("Add a subject", "err"); subjectRef.current?.focus(); return; }
    if (!values.body.trim()) { toast("Add a message", "err"); bodyRef.current?.focus(); return; }
    if (anyCcBad) { toast("Fix the CC addresses marked in red", "err"); return; }
    setSaving(true);
    const ok = await onSave(values);
    setSaving(false);
    if (ok) close();
  }

  return <Modal icon="mail" title={title} subtitle={subtitle} modalStyle={{ maxWidth: 1040 }} bodyClass="cem-body"
    footer={<>
      <button type="button" className="btn link" style={{ marginRight: "auto" }} onClick={resetToDefault}><Icon name="rotate-ccw" />Reset to default</button>
      <button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="save" />{saving ? "Saving…" : "Save message"}</button></>}>
    {neverSaved && <div className="cem-note" role="status"><Icon name="info" />{starterText}</div>}
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
          {fields.map(([name, tip]) => <button type="button" key={name} className="cem-chip" data-tip={`${tip} — inserts {{${name}}}`}
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
          {previewOptions.length ? <select id="cem_store" value={previewId ?? ""} onChange={(event) => setPreviewId(previewOptions.find((option) => String(option.id) === event.target.value)?.id ?? null)}>
            {previewOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select> : <div className="muted">{emptyPreviewText}</div>}</div>
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
