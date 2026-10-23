import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import RichTextEditor from "../../components/ui/RichTextEditor.jsx";
import StorePicker from "../../components/ui/StorePicker.jsx";
import { StatusButtons } from "../../components/ui/Choices.jsx";
import { toggleIn } from "../../lib/lists.js";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { OB_PLATFORMS, OB_STATES } from "../../config/constants.js";
import { obPlatformName, obStatusLabel } from "../../domain/onboarding.js";
import { platformChipClass } from "../../domain/records.js";
import { useDataContext } from "../../state/dataStore.js";
import { confirmAction } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { createOnboarding } from "./onboardingActions.js";
import { hasPlatformStatus, planOnboarding } from "./onboardingSelectors.js";

/** ["ue", "dd", "gh"] -> "Uber Eats, DoorDash and Grubhub" */
const platformList = (keys) => {
  const names = keys.map(obPlatformName);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
};

const MAX_STATUS_STORES = 10;

/** "Uber Eats: Active · last onboarding Onboarded" */
const statusText = ({ key, delivery, onboarding }) => `${obPlatformName(key)}: ${delivery}${onboarding ? ` · last onboarding ${obStatusLabel(onboarding)}` : ""}`;

/**
 * Current status of each picked store that already has one, on all supported platforms
 * (Delivery Platforms status + latest onboarding), with the exempted and eligible platforms spelled out.
 */
function StoreStatusNotice({ stores, picked }) {
  const shown = stores.filter((store) => store.platforms.some(hasPlatformStatus));
  if (!shown.length) return null;
  const anyExempt = shown.some((store) => store.platforms.some((entry) => entry.delivery === "Exempted"));
  return <div className={`ob-status-note${anyExempt ? " exempt" : ""}`} role="status"><Icon name={anyExempt ? "circle-off" : "info"} /><div>
    <b>{shown.length === 1 ? `Store ${shown[0].num} already has` : `${shown.length} stores already have`} a status on some platforms</b>
    <ul>{shown.slice(0, MAX_STATUS_STORES).map(({ num, platforms }) => {
      const exempt = platforms.filter((entry) => entry.delivery === "Exempted").map((entry) => entry.key);
      const eligible = platforms.filter((entry) => entry.delivery !== "Exempted").map((entry) => entry.key);
      return <li key={num}><b>Store {num}</b>
        <span className="ob-status-chips">{platforms.map((entry) => <span key={entry.key} className={`chip ${platformChipClass(entry.delivery)}${picked.includes(entry.key) ? " picked" : ""}`}>{statusText(entry)}</span>)}</span>
        {exempt.length > 0 && <span className="ob-status-exempt">Exempted from onboarding for <b>{platformList(exempt)}</b>.{" "}
          {eligible.length ? <>Eligible: <b>{platformList(eligible)}</b>.</> : <>Not eligible on any platform.</>}</span>}
      </li>;
    })}</ul>
    {shown.length > MAX_STATUS_STORES && <span className="ob-status-help">…and {shown.length - MAX_STATUS_STORES} more. </span>}
    {anyExempt && <span className="ob-status-help">Exempted platforms can still be added. They are recorded as <b>Exempted</b> so they show up in reporting.</span>}
  </div></div>;
}

/** Text of the "already has a status" confirmation. */
function confirmText(flagged) {
  return <>
    <p>These stores already have a status on the picked platforms:</p>
    <ul className="ob-confirm-list">{flagged.slice(0, 12).map((item) => <li key={`${item.num}-${item.platform}`}>
      <b>Store {item.num}</b> · {statusText(item.current)}{item.exempt ? " — will be recorded as Exempted" : ""}</li>)}</ul>
    {flagged.length > 12 && <p>…and {flagged.length - 12} more.</p>}
    <p>Create the onboarding records anyway?</p>
  </>;
}

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
    const details = editorRef.current.getValue();
    const create = () => createOnboarding({ items: current.make, status, details, syncStores, skipped: current.skip.length });
    if (current.flagged.length) {
      confirmAction({
        title: "Store already has a status", okLabel: "Create anyway", busyLabel: "Creating…", icon: "circle-alert", okClass: "btn", text: confirmText(current.flagged),
        onConfirm: async () => { const ok = await create(); if (ok) close(); return ok; },
      });
      return;
    }
    setSaving(true);
    const ok = await create();
    setSaving(false);
    if (ok) close();
  }

  const ready = stores.length > 0 && platforms.length > 0;
  return <Modal size="wide" icon="rocket" title="New onboarding" subtitle="Pick one or more stores and platforms — each store + platform gets its own record"
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="rocket" />Create onboarding</button></>}>
    <div className="field" style={{ marginBottom: 14 }}><label htmlFor="ob_store_in">Stores — type a store # or a franchisee name, or paste many store #s</label>
      <StorePicker ref={pickerRef} inputId="ob_store_in" value={stores} onChange={(next) => { setStores(next); setBusy(true); }} />
      <StoreStatusNotice stores={plan.stores} picked={platforms} /></div>
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
        {plan.skip.length > 0 && <> · <b className="warn">{plan.skip.length} skipped</b> — already have an open onboarding: {plan.skip.slice(0, 6).map((item) => `${item.num} ${obPlatformName(item.platform)}`).join(", ")}{plan.skip.length > 6 ? "…" : ""}</>}
        {plan.exempt.length > 0 && <> · <b className="warn">{plan.exempt.length} exempted</b> — recorded as Exempted: {plan.exempt.slice(0, 6).map((item) => `${item.num} ${obPlatformName(item.platform)}`).join(", ")}{plan.exempt.length > 6 ? "…" : ""}</>}</span></>
        : <><Icon name="info" /><span>Pick at least one store and one platform. One record is created for each store + platform.</span></>}
    </div>
  </Modal>;
}
