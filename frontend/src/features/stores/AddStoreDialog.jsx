import { useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { territorySet } from "../../domain/records.js";
import { formatPhone } from "../../lib/format.js";
import { cleanStoreNumber, isPhone } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import { createStore } from "./storeActions.js";

export default function AddStoreDialog({ franchiseeId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const franchisee = ctx.frById.get(franchiseeId);
  const [form, setForm] = useState(() => ({ num: "", territory: [...territorySet(franchisee?.territory)][0] || "", address: "", city: "", state: "", zip: "", phone: "" }));
  const [saving, setSaving] = useState(false);
  const numRef = useRef(null);
  if (!franchisee) return null;

  const num = cleanStoreNumber(form.num);
  const taken = num ? ctx.storeByNum.get(num) : null;
  const takenOwner = taken ? ctx.frById.get(taken.franchisee_id) : null;
  const field = (name, transform = (value) => value) => ({
    value: form[name],
    onChange: (event) => { setForm({ ...form, [name]: transform(event.target.value) }); setBusy(true); },
  });

  async function save() {
    if (!num) { toast("Enter a store number", "err"); return; }
    if (taken) { toast(`Store ${num} already exists`, "err"); numRef.current?.focus(); return; }
    const phone = form.phone.trim();
    if (phone && !isPhone(phone)) { toast("Phone must look like (555) 123-4567", "err"); return; }
    setSaving(true);
    const row = await createStore({
      franchisee_id: franchisee.id, num, address: form.address.trim(), city: form.city.trim(), state: form.state.trim().toUpperCase(),
      zip: form.zip.trim(), phone, territory: form.territory.trim(),
    });
    setSaving(false);
    if (row) close();
  }

  return <Modal icon="store" title="Add store" subtitle={franchisee.name || ""}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="plus" />Add store</button></>}>
    <div className="ecard"><div className="ech"><Icon name="hash" />Store</div><div className="ecb"><div className="fgrid">
      <div className="field"><label htmlFor="as_num">Store number</label>
        <input id="as_num" ref={numRef} placeholder="e.g. 12345" inputMode="numeric" autoComplete="off" autoFocus className={taken ? "bad" : ""} {...field("num")} />
        <div className={`dupwarn${taken ? " show" : ""}`}><Icon name="circle-alert" />
          <span>{taken ? `Store ${num} already exists${takenOwner ? ` under "${takenOwner.name}"` : ""}.` : ""}</span></div></div>
      <div className="field"><label htmlFor="as_terr">Territory</label><input id="as_terr" placeholder="e.g. 540" {...field("territory")} /></div>
    </div></div></div>
    <div className="ecard"><div className="ech"><Icon name="map-pin" />Location</div><div className="ecb"><div className="fgrid">
      <div className="field full"><label htmlFor="as_addr">Address</label><input id="as_addr" placeholder="Street address" {...field("address")} /></div>
      <div className="field"><label htmlFor="as_city">City</label><input id="as_city" {...field("city")} /></div>
      <div className="field"><label htmlFor="as_state">State</label><input id="as_state" placeholder="CA" maxLength={2} style={{ textTransform: "uppercase" }} {...field("state")} /></div>
      <div className="field"><label htmlFor="as_zip">ZIP</label><input id="as_zip" {...field("zip")} /></div>
      <div className="field"><label htmlFor="as_phone">Store Phone Number</label><input id="as_phone" placeholder="(555) 123-4567" {...field("phone", formatPhone)} /></div>
    </div></div></div>
  </Modal>;
}
