import { useState } from "react";
import Modal from "../../components/ui/Modal.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { STAFF_ROLES } from "../../config/constants.js";
import { emailOf } from "../../domain/records.js";
import { useDataContext } from "../../state/dataStore.js";
import { saveStaff } from "./staffActions.js";

/** Add or edit an FBC / OM. */
export default function StaffFormDialog({ staffId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const existing = staffId ? ctx.staffById.get(staffId) : null;
  const [form, setForm] = useState(() => ({
    role: existing && STAFF_ROLES.includes(existing.role) ? existing.role : "FBC",
    name: existing?.name || "",
    email: existing ? emailOf(existing) : "",
  }));
  const [saving, setSaving] = useState(false);
  const field = (name) => ({ value: form[name], onChange: (event) => { setForm({ ...form, [name]: event.target.value }); setBusy(true); } });

  async function save() {
    setSaving(true);
    const ok = await saveStaff(existing, form);
    setSaving(false);
    if (ok) close();
  }

  return <Modal size="small" icon="user-round-plus" title={existing ? `Edit ${existing.role || ""}` : "Add FBC / OM"}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button><button type="button" className="btn" disabled={saving} onClick={save}>Save</button></>}>
    <div className="fgrid" style={{ marginBottom: 13 }}>
      <div className="field"><label htmlFor="sf_name">Name</label><input id="sf_name" placeholder="e.g. Chrystal" autoFocus {...field("name")} /></div>
      <div className="field"><label htmlFor="sf_role">Role</label><select id="sf_role" {...field("role")}>{STAFF_ROLES.map((role) => <option key={role}>{role}</option>)}</select></div>
    </div>
    <div className="field"><label htmlFor="sf_email">Email</label><input id="sf_email" type="email" placeholder="name@marwahagroup.com" {...field("email")} /></div>
    <div className="help">Assign stores from each store's Support Team card.</div>
  </Modal>;
}
