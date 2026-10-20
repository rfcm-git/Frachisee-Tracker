import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import RichTextEditor from "../../components/ui/RichTextEditor.jsx";
import StorePicker from "../../components/ui/StorePicker.jsx";
import { StatusButtons } from "../../components/ui/Choices.jsx";
import { toggleIn } from "../../lib/lists.js";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { OB_PLATFORMS, OB_STATES } from "../../config/constants.js";
import { obPlatformName } from "../../domain/onboarding.js";
import { useDataContext } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import { createOnboarding } from "./onboardingActions.js";
import { planOnboarding } from "./onboardingSelectors.js";

/** Start onboarding for several stores and platforms at once (one record per store + platform). */
export default function NewOnboardingDialog() {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const [stores, setStores] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [status, setStatus] = useState("Pending");
  const [syncStores, setSyncStores] = useState(true);
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef(null);
  const editorRef = useRef(null);
  const plan = useMemo(() => planOnboarding(ctx, stores, platforms), [ctx, stores, platforms]);

  async function save() {
    const storeNums = pickerRef.current.commitTyped();
    const current = planOnboarding(ctx, storeNums, platforms);
    if (!storeNums.length) { toast("Add at least one store", "err"); return; }
    if (!platforms.length) { toast("Pick at least one platform", "err"); return; }
    if (!current.make.length) { toast("All picked store + platform items already have an open onboarding", "err"); return; }
    setSaving(true);
    const ok = await createOnboarding({ items: current.make, status, details: editorRef.current.getValue(), syncStores, skipped: current.skip.length });
    setSaving(false);
    if (ok) close();
  }

  const ready = stores.length > 0 && platforms.length > 0;
  return <Modal size="wide" icon="rocket" title="New onboarding" subtitle="Pick one or more stores and platforms — each store + platform gets its own record"
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="rocket" />Create onboarding</button></>}>
    <div className="field" style={{ marginBottom: 14 }}><label htmlFor="ob_store_in">Stores — type a store # or a franchisee name, or paste many store #s</label>
      <StorePicker ref={pickerRef} inputId="ob_store_in" value={stores} onChange={(next) => { setStores(next); setBusy(true); }} /></div>
    <div className="field" style={{ marginBottom: 14 }}><label>Platforms — pick one or more</label><div className="ob-picks" role="group" aria-label="Platforms">
      {OB_PLATFORMS.map(([key, name]) => {
        const on = platforms.includes(key);
        return <button type="button" key={key} className={`ob-pick${on ? " on" : ""}`} aria-pressed={on} onClick={() => setPlatforms(toggleIn(platforms, key))}>
          <span className="cbox"><Icon name="check" /></span><span className={`ob-plat p-${key}`}>{name}</span></button>;
      })}
    </div></div>
    <div className="field" style={{ marginBottom: 14 }}><label>Starting status</label><StatusButtons options={OB_STATES} value={status} onChange={setStatus} label="Starting status" /></div>
    <div className="field" style={{ marginBottom: 12 }}><label>Onboarding details (optional)</label>
      <RichTextEditor ref={editorRef} placeholder="e.g. New owner wants Uber Eats and DoorDash. Sent the onboarding links by email." minHeight={140} onInput={() => setBusy(true)} /></div>
    <label className="ob-syncrow"><input type="checkbox" checked={syncStores} onChange={(event) => setSyncStores(event.target.checked)} />
      <span>Also set these platforms to <b>Pending</b> in each store's Delivery Platforms (only where Not enrolled)</span></label>
    <div className={`ob-preview${ready ? " ok" : ""}`}>
      {ready ? <><Icon name="list-checks" /><span><b>{plan.make.length}</b> record{plan.make.length !== 1 ? "s" : ""} will be created ({stores.length} store{stores.length !== 1 ? "s" : ""} × {platforms.length} platform{platforms.length !== 1 ? "s" : ""})
        {plan.skip.length > 0 && <> · <b className="warn">{plan.skip.length} skipped</b> — already have an open onboarding: {plan.skip.slice(0, 6).map((item) => `${item.num} ${obPlatformName(item.platform)}`).join(", ")}{plan.skip.length > 6 ? "…" : ""}</>}</span></>
        : <><Icon name="info" /><span>Pick at least one store and one platform. One record is created for each store + platform.</span></>}
    </div>
  </Modal>;
}
