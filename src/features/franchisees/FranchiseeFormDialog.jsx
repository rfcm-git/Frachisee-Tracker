import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { storesOf } from "../../domain/context.js";
import { contactsOf } from "../../domain/records.js";
import { isEmail, isPhone } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import { showFranchisee, useUiStore } from "../../state/uiStore.js";
import ContactEditor from "./ContactEditor.jsx";
import { fromEditorRows, newContactRow, toEditorRows } from "./contactRows.js";
import { createFranchisee, updateFranchisee } from "./franchiseeActions.js";
import { findDuplicateFranchisee } from "./franchiseeSelectors.js";

const textareaStyle = { width: "100%", minHeight: 70, border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", fontFamily: "var(--font)", fontSize: 14, resize: "vertical" };

/** Add or edit a franchisee. */
export default function FranchiseeFormDialog({ franchiseeId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const existing = franchiseeId != null ? ctx.frById.get(franchiseeId) : null;
  const [form, setForm] = useState(() => ({
    name: existing?.name || "",
    territory: existing ? existing.territory || "" : useUiStore.getState().terrFilter || "",
    closed: !!existing?.closed,
    notes: existing?.notes || "",
  }));
  const [contacts, setContacts] = useState(() => toEditorRows(existing ? contactsOf(existing) : []));
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  const change = (patch) => { setForm((current) => ({ ...current, ...patch })); setBusy(true); };
  const duplicate = useMemo(() => findDuplicateFranchisee(ctx, form.name, existing?.id ?? null), [ctx, form.name, existing]);

  async function save() {
    const contactList = fromEditorRows(contacts);
    for (const contact of contactList) {
      if (contact.type === "email" && !isEmail(contact.value)) { toast("Check the email address format", "err"); return; }
      if (contact.type === "cell" && !isPhone(contact.value)) { toast("Phone must look like (555) 123-4567", "err"); return; }
    }
    const record = { name: form.name.trim().replace(/\s+/g, " "), territory: form.territory.trim(), closed: form.closed, notes: form.notes.trim(), contacts: contactList };
    if (!record.name) { toast("Enter the franchisee name", "err"); nameRef.current?.focus(); return; }
    if (duplicate) { toast("That franchisee already exists", "err"); return; }
    setSaving(true);
    if (existing) {
      const ok = await updateFranchisee(existing, record);
      setSaving(false);
      if (ok) {
        if (useUiStore.getState().selectedFr === existing.id) useUiStore.setState((state) => ({ pages: { ...state.pages, frst: 1 } }));
        close();
      }
      return;
    }
    const row = await createFranchisee(record);
    setSaving(false);
    if (row) { close(); showFranchisee(row); }
  }

  return <Modal icon="user-round-pen" title={existing ? "Edit franchisee" : "Add franchisee"} subtitle={existing ? existing.name || "" : "New franchisee"}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}>{existing ? <><Icon name="save" />Save</> : <><Icon name="user-plus" />Add franchisee</>}</button></>}>
    <div className="ecard"><div className="ech"><Icon name="user-round" />Franchisee</div><div className="ecb"><div className="fgrid">
      <div className="field full"><label htmlFor="fr_name">Franchisee name</label>
        <input id="fr_name" ref={nameRef} placeholder="Last, First" autoComplete="off" autoFocus={!existing} className={duplicate ? "bad" : ""}
          value={form.name} onChange={(event) => change({ name: event.target.value })} />
        <div className={`dupwarn${duplicate ? " show" : ""}`}><Icon name="circle-alert" />
          <span>{duplicate ? `Already exists: "${duplicate.name}" (${storesOf(ctx, duplicate.id).length} stores). Use the existing franchisee.` : ""}</span></div>
      </div>
      <div className="field"><label htmlFor="fr_territory">Territory</label><input id="fr_territory" placeholder="540, 584" value={form.territory} onChange={(event) => change({ territory: event.target.value })} /></div>
      <div className="field"><label htmlFor="fr_closed">Status</label>
        <select id="fr_closed" value={String(form.closed)} onChange={(event) => change({ closed: event.target.value === "true" })}><option value="false">Active</option><option value="true">Closed</option></select></div>
    </div></div></div>
    <div className="ecard"><div className="ech"><Icon name="mail" />Contacts</div><div className="ecb">
      <ContactEditor rows={contacts} onChange={(rows) => { setContacts(rows); setBusy(true); }} />
      <button type="button" className="btn outline round sm" onClick={() => setContacts([...contacts, newContactRow()])}><Icon name="plus" />Add contact</button>
    </div></div>
    <div className="ecard"><div className="ech"><Icon name="sticky-note" />Notes</div><div className="ecb">
      <textarea placeholder="Anything the team should know" style={textareaStyle} value={form.notes} aria-label="Notes" onChange={(event) => change({ notes: event.target.value })} />
    </div></div>
  </Modal>;
}
