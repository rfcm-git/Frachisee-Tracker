import { useRef, useState } from "react";
import PreviewPicker from "./PreviewPicker.jsx";
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
const CC_KEYS = CC_FIELDS.map(([key]) => key);

/**
 * The messages being edited. Without `modes`, the one-store message (subject / body) and, with `multi`,
 * the several-stores message (multiSubject / multiBody).
 */
function messageModes({ modes, fields, previewOptions, initialPreviewId, buildPreview, emptyPreviewText, multi }) {
  if (modes) return modes;
  return [
    { key: "one", label: "One store", icon: "store", keys: { subject: "subject", body: "body" }, fields, previewOptions, initialPreviewId, buildPreview, emptyPreviewText },
    ...(multi ? [{ key: "multi", label: "Several stores", icon: "layers", multi: true, keys: { subject: "multiSubject", body: "multiBody" }, ...multi }] : []),
  ];
}

/**
 * Editor for an email template (subject, message with {{placeholders}}, CC rules) with a live preview for one store.
 * Used by the CAP, onboarding and Walmart emails.
 *   fields: [[name, description]] placeholders offered as chips
 *   initial / defaults: templates ({ subject, body, ccHouston, ccOther, ccAlways })
 *   previewOptions: [{ id, label }]; buildPreview(values, id) -> email from recipientsFor + composeEmail
 *   multi: the several-stores message, { fields, previewOptions, initialPreviewId, buildPreview, emptyPreviewText, help }
 *   modes: instead of the above, any list of messages, each
 *          { key, label, icon, multi (several stores), keys: { subject, body }, fields, previewOptions, initialPreviewId, buildPreview, emptyPreviewText, help }
 *   onSave(values) -> Promise<boolean>
 */
export default function EmailTemplateEditor({ title, subtitle, fields, initial, defaults, neverSaved, starterText, previewOptions, initialPreviewId, buildPreview, emptyPreviewText, multi, modes: modesProp, initialMode, onSave }) {
  const { close, setBusy } = useDialog();
  const modes = messageModes({ modes: modesProp, fields, previewOptions, initialPreviewId, buildPreview, emptyPreviewText, multi });
  const templateKeys = [...modes.flatMap((item) => [item.keys.subject, item.keys.body]), ...CC_KEYS];
  const pick = (template) => Object.fromEntries(templateKeys.map((key) => [key, template[key] ?? ""]));
  const [values, setValues] = useState(() => pick(initial));
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState(() => (modes.some((item) => item.key === initialMode) ? initialMode : modes[0].key));
  const [previewIds, setPreviewIds] = useState(() => Object.fromEntries(modes.map((item) => [item.key, item.initialPreviewId ?? item.previewOptions[0]?.id ?? null])));
  /** The message being edited: its keys, placeholders and preview. */
  const view = modes.find((item) => item.key === mode) || modes[0];
  const previewId = previewIds[mode];
  const setPreviewId = (id) => setPreviewIds((current) => ({ ...current, [mode]: id }));
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const lastField = useRef("body");

  const change = (field, value) => { setValues((current) => ({ ...current, [field]: value })); setBusy(true); };

  /** Inserts {{name}} at the cursor of the subject or message (whichever was used last). */
  function insert(name) {
    const which = lastField.current;
    const field = view.keys[which];
    const element = (which === "subject" ? subjectRef : bodyRef).current;
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
  const subjectKey = view.keys.subject;
  const bodyKey = view.keys.body;
  const unknown = unknownPlaceholders(`${values[subjectKey]}\n${values[bodyKey]}`, view.fields);
  const email = previewId != null && view.previewOptions.some((option) => option.id === previewId) ? view.buildPreview(values, previewId) : null;
  const tooLong = !!email?.href && email.href.length > MAILTO_SAFE_LENGTH;

  async function save() {
    const label = (item) => (modes.length > 1 ? ` for the ${item.label} message` : "");
    for (const item of modes) {
      if (!values[item.keys.subject].trim()) { setMode(item.key); toast(`Add a subject${label(item)}`, "err"); return; }
      if (!values[item.keys.body].trim()) { setMode(item.key); toast(`Add a message${label(item)}`, "err"); return; }
    }
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
        {modes.length > 1 && <div className={`cem-mode${modes.length > 3 ? " cem-mode-grid" : ""}`} role="tablist" aria-label="Which message">
          {modes.map((item) => <button type="button" key={item.key} role="tab" aria-selected={mode === item.key}
            className={`cem-mode-btn${mode === item.key ? " on" : ""}`} onClick={() => setMode(item.key)}><Icon name={item.icon || "mail"} />{item.label}</button>)}
        </div>}
        {view.help && <div className="cem-help" style={{ margin: "0 0 8px" }}>{view.help}</div>}
        <div className="field"><label htmlFor="cem_subject">Subject</label>
          <input id="cem_subject" ref={subjectRef} value={values[subjectKey]} className={values[subjectKey].trim() ? "" : "bad"}
            onFocus={() => { lastField.current = "subject"; }} onChange={(event) => change(subjectKey, event.target.value)} /></div>
        <div className="field"><label htmlFor="cem_body">Message</label>
          <textarea id="cem_body" ref={bodyRef} className={`cem-ta${values[bodyKey].trim() ? "" : " bad"}`} value={values[bodyKey]}
            onFocus={() => { lastField.current = "body"; }} onChange={(event) => change(bodyKey, event.target.value)} /></div>
        <div className="cem-fields" role="group" aria-label="Insert a store detail">
          <span className="cem-fields-h">Insert at the cursor:</span>
          {view.fields.map(([name, tip]) => <button type="button" key={name} className="cem-chip" data-tip={`${tip} — inserts {{${name}}}`}
            onMouseDown={(event) => event.preventDefault()} onClick={() => insert(name)}>{name}</button>)}
        </div>
        {unknown.length > 0 && <div className="cem-warn"><Icon name="triangle-alert" />Not a store detail, so it is sent as typed: {unknown.map((name) => `{{${name}}}`).join(", ")}</div>}
        <div className="cem-help">Your Outlook signature is added by Outlook. The email is plain text — bold, links and pictures are not kept.</div>

        <fieldset className="cem-cc"><legend>CC</legend>
          <div className="cem-help" style={{ margin: "0 0 8px" }}>One-store emails CC the store's <b>FBC</b> and <b>OM</b> from the staff list. Several-stores emails leave them out;
            when any of the stores is in Houston they always CC <b>Moises</b> and <b>Christophe</b>. Anyone listed twice is added once.</div>
          {CC_FIELDS.map(([key, label, hint]) => <div className="field" key={key}><label htmlFor={`cem_${key}`}>{label} <span className="cem-sub">· {hint}</span></label>
            <input id={`cem_${key}`} value={values[key]} className={ccBad[key].length ? "bad" : ""} placeholder="name@email.com, name@email.com"
              aria-invalid={ccBad[key].length > 0} onChange={(event) => change(key, event.target.value)} />
            {ccBad[key].length > 0 && <div className="cem-err"><Icon name="circle-alert" />Not an email address: {ccBad[key].join(", ")}</div>}</div>)}
        </fieldset>
      </div>

      <div className="cem-prev" aria-live="polite">
        <div className="field"><label htmlFor="cem_store">Preview for</label>
          {view.previewOptions.length ? <PreviewPicker id="cem_store" options={view.previewOptions} value={previewId} onChange={setPreviewId} />
            : <div className="muted">{view.emptyPreviewText}</div>}</div>
        {email && <div className="cem-mail">
          <div className="cem-row"><span>To</span><b>{email.to || <span className="cem-miss">No email address on file</span>}{email.rajeev && <span className="cem-why">Marwaha store · owner in CC</span>}</b></div>
          <div className="cem-row"><span>CC</span><div>
            <span className={`cem-tag first${email.houston ? " hou" : ""}`}>{email.mixed ? "Houston and other stores" : email.houston ? "Houston store" : "Other territory"}</span>
            {email.ccInfo.length ? <ul className="cem-cclist">{email.ccInfo.map((entry) => <li key={entry.email}>
              <span className="cem-addr" data-tip={entry.name || undefined}>{entry.email}</span>{entry.why.map((why) => <span key={why} className="cem-why">{why}</span>)}</li>)}</ul>
              : <span className="muted">Nobody</span>}
            {email.store && email.teamCc !== false && (!email.team.fbc || !email.team.om) && <div className="cem-miss-team">
              {[!email.team.fbc && "FBC", !email.team.om && "OM"].filter(Boolean).join(" and ")} not set (or has no email) for {view.multi ? "some of these stores" : "this store"}</div>}</div></div>
          <div className="cem-row"><span>Subject</span><b>{email.subject || <span className="cem-miss">Empty</span>}</b></div>
          <div className="cem-text">{email.body}</div>
        </div>}
        {email?.missing.length > 0 && <div className="cem-warn"><Icon name="triangle-alert" />Blank for this store: {email.missing.join(", ")}. Check the wording still reads well.</div>}
        {tooLong && <div className="cem-warn"><Icon name="triangle-alert" />This email is long — Outlook may cut off the end. Shorten the message to be safe.</div>}
      </div>
    </div>
  </Modal>;
}
