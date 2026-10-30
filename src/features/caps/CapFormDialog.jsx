import { useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { StatusButtons } from "../../components/ui/Choices.jsx";
import { CapDueBadge, CapStatusBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { CAP_DUE_SOON_DAYS, CAP_STATES } from "../../config/constants.js";
import { capContact, capDueDate, normalizeCapStatus, storeContactDefaults } from "../../domain/caps.js";
import { addDays, formatPhone, formatTimestamp, localDateInput, phone10 } from "../../lib/format.js";
import { cleanStoreNumber, isEmail } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { openCapForm } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { createCap, findCap, updateCap } from "./capsActions.js";

const FIELDS = ["name", "email", "phone"];
const DUE_SHORTCUTS = [7, 14, 30];

/** Add a store to CAPs Monitoring (capId null) or edit one. Name, email and phone come from the store records until changed. */
export default function CapFormDialog({ capId = null }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const record = capId != null ? ctx.caps.find((item) => item.id === capId) : null;
  const editing = !!record;
  const [num, setNum] = useState(() => (record ? String(record.store_num) : ""));
  const [values, setValues] = useState(() => {
    const shown = record ? capContact(ctx, record) : { name: "", email: "", phone: "" };
    return { name: shown.name, email: shown.email, phone: shown.phone };
  });
  const [touched, setTouched] = useState({});
  const [status, setStatus] = useState(() => (record ? normalizeCapStatus(record.status) : CAP_STATES[0]));
  const [notes, setNotes] = useState(() => record?.notes || "");
  const [dueDate, setDueDate] = useState(() => capDueDate(record));
  const [saving, setSaving] = useState(false);
  if (capId != null && !record) return null;

  const storeNum = cleanStoreNumber(num);
  const defaults = storeContactDefaults(ctx, storeNum);
  const store = ctx.storeByNum.get(storeNum);
  const duplicate = !editing && storeNum ? findCap(ctx, storeNum) : null;
  const emailBad = !!values.email.trim() && !isEmail(values.email.trim());
  const phoneBad = !!values.phone.trim() && !phone10(values.phone);

  function changeNum(value) {
    setNum(value);
    setBusy(true);
    const next = storeContactDefaults(ctx, cleanStoreNumber(value));
    // Fields the user has not typed in follow the store records.
    setValues((current) => Object.fromEntries(FIELDS.map((field) => [field, touched[field] ? current[field] : next[field]])));
  }

  function changeField(field, value) {
    setValues((current) => ({ ...current, [field]: field === "phone" ? formatPhone(value) : value }));
    setTouched((current) => ({ ...current, [field]: true }));
    setBusy(true);
  }

  function useStoreRecords() {
    setValues({ name: defaults.name, email: defaults.email, phone: defaults.phone });
    setTouched({});
    setBusy(true);
  }

  async function save() {
    if (!storeNum) { toast("Enter the store number", "err"); return; }
    if (duplicate) { toast(`Store ${storeNum} is already in CAPs Monitoring`, "err"); return; }
    if (emailBad) { toast("Email address is not valid", "err"); return; }
    if (phoneBad) { toast("Phone number must be 10 digits", "err"); return; }
    const contact = { name: values.name.trim(), email: values.email.trim(), phone: values.phone.trim() ? phone10(values.phone) : "" };
    setSaving(true);
    const ok = editing ? await updateCap(record, { ...contact, status, notes, dueDate }) : await createCap({ num: storeNum, ...contact, notes, dueDate });
    setSaving(false);
    if (ok) close();
  }

  const fromStore = (field) => defaults.found && values[field].trim().toLowerCase() === String(defaults[field] || "").toLowerCase() && !!defaults[field];
  const differs = defaults.found && FIELDS.some((field) => values[field].trim().toLowerCase() !== String(defaults[field] || "").toLowerCase());
  const fieldHint = (field) => (fromStore(field) ? <span className="cap-src"><Icon name="store" />from store records</span> : null);

  return <Modal icon={editing ? "pencil" : "plus"} title={editing ? `Edit CAP · Store ${record.store_num}` : "Add store to CAPs Monitoring"}
    subtitle={editing ? `Added ${formatTimestamp(record.created_at)}${record.updated_at && record.updated_at !== record.created_at ? ` · last updated ${formatTimestamp(record.updated_at)}` : ""}` : "Contact details are filled from the store records — change them if needed"}
    modalStyle={{ maxWidth: 620 }}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving || !!duplicate} onClick={save}><Icon name="save" />{saving ? "Saving…" : editing ? "Save changes" : "Add store"}</button></>}>
    <div className="field" style={{ marginBottom: 6 }}><label htmlFor="cap_num">Store Number</label>
      <input id="cap_num" value={num} disabled={editing} autoFocus={!editing} autoComplete="off" placeholder="e.g. 12345" className={duplicate ? "bad" : ""}
        onChange={(event) => changeNum(event.target.value)} /></div>
    <div className="cap-storeinfo" role="status">
      {!storeNum ? <span className="muted">Type a store number to look up its contact details.</span>
        : duplicate ? <span className="cap-err"><Icon name="circle-alert" />Store {storeNum} is already in CAPs Monitoring.
          <button type="button" className="btn link" onClick={() => { close(); openCapForm(duplicate.id); }}>Edit it instead</button></span>
          : store ? <span><Icon name="store" />Store {storeNum}{defaults.name ? ` · ${defaults.name}` : ""}{store.city ? ` · ${store.city}${store.state ? `, ${store.state}` : ""}` : ""}</span>
            : <span className="cap-warn"><Icon name="triangle-alert" />Store {storeNum} is not in the store list. You can still add it — fill in the contact details.</span>}
    </div>

    <div className="field" style={{ marginBottom: 12 }}><label htmlFor="cap_name">Franchisee {fieldHint("name")}</label>
      <input id="cap_name" value={values.name} placeholder="Franchisee name" onChange={(event) => changeField("name", event.target.value)} /></div>
    <div className="grid2" style={{ marginBottom: 6 }}>
      <div className="field"><label htmlFor="cap_email">Email Address {fieldHint("email")}</label>
        <input id="cap_email" type="email" value={values.email} className={emailBad ? "bad" : ""} placeholder="name@email.com" onChange={(event) => changeField("email", event.target.value)} /></div>
      <div className="field"><label htmlFor="cap_phone">Phone Number {fieldHint("phone")}</label>
        <input id="cap_phone" value={values.phone} className={phoneBad ? "bad" : ""} placeholder="(555) 123-4567" onChange={(event) => changeField("phone", event.target.value)} /></div>
    </div>
    {differs && <div className="help" style={{ marginTop: 0, marginBottom: 12 }}>Changed details are saved on this CAP record only — the store records are not changed.{" "}
      <button type="button" className="btn link" style={{ padding: 0 }} onClick={useStoreRecords}><Icon name="rotate-ccw" />Use store records</button></div>}

    <div className="field" style={{ marginBottom: 12 }}><label>Status</label>
      {editing ? <StatusButtons options={CAP_STATES} value={status} onChange={(value) => { setStatus(value); setBusy(true); }} label="Status" />
        : <div className="cap-newstatus"><CapStatusBadge status={CAP_STATES[0]} /><span className="muted">New stores always start at {CAP_STATES[0]}. Change it from the list once you act on it.</span></div>}
    </div>
    {ctx.capsDueReady && <div className="field" style={{ marginBottom: 12 }}><label htmlFor="cap_due">Submission Due Date <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
      <div className="cap-due-row">
        <input id="cap_due" type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); setBusy(true); }} />
        {DUE_SHORTCUTS.map((days) => <button type="button" key={days} className="btn sm outline round" data-tip={`Set the due date ${days} days from today`}
          onClick={() => { setDueDate(localDateInput(addDays(new Date(), days))); setBusy(true); }}>+{days} days</button>)}
        {dueDate && <button type="button" className="btn link" onClick={() => { setDueDate(""); setBusy(true); }}><Icon name="x" />Clear</button>}
      </div>
      {dueDate && <div className="help" style={{ marginTop: 6 }}><CapDueBadge record={{ due_date: dueDate, status }} /> You'll get a reminder {CAP_DUE_SOON_DAYS} days before, on the day, and if it is overdue.</div>}
    </div>}
    <div className="field"><label htmlFor="cap_notes">Notes</label>
      <textarea id="cap_notes" className="cl-ta" value={notes} placeholder="Updates, follow-ups or remarks" onChange={(event) => { setNotes(event.target.value); setBusy(true); }} /></div>
  </Modal>;
}
