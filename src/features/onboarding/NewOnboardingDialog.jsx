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
import { saveOnboardingPlan } from "./onboardingActions.js";
import { hasPlatformStatus, planOnboarding } from "./onboardingSelectors.js";

/** ["ue", "dd", "gh"] -> "Uber Eats, DoorDash and Grubhub" */
const platformList = (keys) => {
  const names = keys.map(obPlatformName);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
};

const MAX_STATUS_STORES = 10;

/** "Uber Eats: Work in Progress · on the onboarding list" */
const statusText = ({ key, delivery, onboarding }) => `${obPlatformName(key)}: ${onboarding ? obStatusLabel(onboarding) : delivery}${onboarding ? " · on the onboarding list" : ""}`;

/**
 * Current status of each picked store that already has one, on all supported platforms
 * (Delivery Platforms status, or the onboarding record when it is on the list), with the exempted and eligible platforms spelled out.
 */
function StoreStatusNotice({ stores, picked }) {
  const shown = stores.filter((store) => store.platforms.some((entry) => hasPlatformStatus(entry) || entry.onboarding));
  if (!shown.length) return null;
  const anyExempt = shown.some((store) => store.platforms.some((entry) => entry.delivery === "Exempted"));
  return <div className={`ob-status-note${anyExempt ? " exempt" : ""}`} role="status"><Icon name={anyExempt ? "circle-off" : "info"} /><div>
    <b>{shown.length === 1 ? `Store ${shown[0].num} already has` : `${shown.length} stores already have`} a status on some platforms</b>
    <ul>{shown.slice(0, MAX_STATUS_STORES).map(({ num, platforms }) => {
      const exempt = platforms.filter((entry) => entry.delivery === "Exempted").map((entry) => entry.key);
      const eligible = platforms.filter((entry) => entry.delivery !== "Exempted").map((entry) => entry.key);
      return <li key={num}><b>Store {num}</b>
        <span className="ob-status-chips">{platforms.map((entry) => <span key={entry.key} className={`chip ${platformChipClass(entry.onboarding || entry.delivery)}${picked.includes(entry.key) ? " picked" : ""}`}>{statusText(entry)}</span>)}</span>
        {exempt.length > 0 && <span className="ob-status-exempt">Exempted from onboarding for <b>{platformList(exempt)}</b>.{" "}
          {eligible.length ? <>Eligible: <b>{platformList(eligible)}</b>.</> : <>Not eligible on any platform.</>}</span>}
      </li>;
    })}</ul>
    {shown.length > MAX_STATUS_STORES && <span className="ob-status-help">…and {shown.length - MAX_STATUS_STORES} more. </span>}
    {anyExempt && <span className="ob-status-help">Exempted platforms can still be added. They are recorded as <b>Exempted</b> so they show up in reporting.</span>}
  </div></div>;
}

/** Confirmation text when picked items are already on the list, or already have a status in Delivery Platforms. */
function confirmText(plan, status) {
  return <>
    {plan.updates.length > 0 && <>
      <p><b>Already on the onboarding list.</b> These are not added again — their record is updated instead, and any details you wrote are added as a progress update:</p>
      <ul className="ob-confirm-list">{plan.updates.slice(0, 12).map((item) => <li key={`${item.num}-${item.platform}`}>
        <b>Store {item.num}</b> · {obPlatformName(item.platform)}: {obStatusLabel(item.record.status)}{item.record.status !== item.status ? ` → ${item.status}` : " (status unchanged)"}</li>)}</ul>
      {plan.updates.length > 12 && <p>…and {plan.updates.length - 12} more.</p>}
    </>}
    {plan.flagged.length > 0 && <>
      <p>These stores already have a status on the picked platforms:</p>
      <ul className="ob-confirm-list">{plan.flagged.slice(0, 12).map((item) => <li key={`${item.num}-${item.platform}`}>
        <b>Store {item.num}</b> · {statusText(item.current)}{item.exempt ? " — will be recorded as Exempted" : item.status ? ` — will be recorded as ${item.status}` : ` — will be set to ${status}`}</li>)}</ul>
      {plan.flagged.length > 12 && <p>…and {plan.flagged.length - 12} more.</p>}
    </>}
    <p>Continue?</p>
  </>;
}

/** "2 added · 1 already on the list updated" */
const resultText = ({ created, updated }) => [created && `${created} added`, updated && `${updated} already on the list updated`].filter(Boolean).join(" · ") || "Nothing was changed";

/**
 * Add one store (or several, or a franchisee's stores) to onboarding: one record per store + platform.
 * A store + platform already on the list is not added again; its record is updated when the status differs or details are written.
 * storeNums preselects stores; franchiseeId opens that franchisee's store list to tick from.
 */
export default function NewOnboardingDialog({ storeNums = [], franchiseeId = null, platforms: fixedPlatforms = null }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const [stores, setStores] = useState(() => storeNums.filter((num) => ctx.storeByNum.has(String(num))).map(String));
  const fixed = Array.isArray(fixedPlatforms) && fixedPlatforms.length > 0;
  const [platforms, setPlatforms] = useState(() => (fixed ? fixedPlatforms : []));
  const listName = fixed && fixedPlatforms.length === 1 ? `the ${obPlatformName(fixedPlatforms[0])} list` : "the onboarding list";
  const [status, setStatus] = useState(OB_STATES[0]);
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef(null);
  const editorRef = useRef(null);
  const plan = useMemo(() => planOnboarding(ctx, stores, platforms, { status, details, onlyPicked: fixed }), [ctx, stores, platforms, status, details, fixed]);

  async function run(current, text) {
    const result = await saveOnboardingPlan(current, { status, details: text });
    if (result.failures.length) { toast(`${resultText(result)} — ${result.failures.join(" · ")}`, "err"); return result.created + result.updated > 0; }
    toast(resultText(result), "ok");
    return true;
  }

  async function save() {
    const storeNums = pickerRef.current.commitTyped();
    const text = editorRef.current.getValue();
    const current = planOnboarding(ctx, storeNums, platforms, { status, details: text, onlyPicked: fixed });
    if (!storeNums.length) { toast("Add at least one store", "err"); return; }
    if (!platforms.length) { toast("Pick at least one platform", "err"); return; }
    if (!current.make.length && !current.updates.length) {
      toast(`Already on ${listName} with this status. Change the status or write details to update it.`, "err");
      return;
    }
    if (current.updates.length || current.flagged.length) {
      confirmAction({
        title: current.updates.length ? "Already on the onboarding list" : "Store already has a status",
        okLabel: current.make.length ? "Add and update" : "Update", busyLabel: "Saving…", icon: "circle-alert", okClass: "btn", text: confirmText(current, status),
        onConfirm: async () => { const ok = await run(current, text); if (ok) close(); return ok; },
      });
      return;
    }
    setSaving(true);
    const ok = await run(current, text);
    setSaving(false);
    if (ok) close();
  }

  const ready = stores.length > 0 && platforms.length > 0;
  const itemList = (items) => `${items.slice(0, 6).map((item) => `${item.num} ${obPlatformName(item.platform)}`).join(", ")}${items.length > 6 ? "…" : ""}`;
  return <Modal size="wide" icon="store" title={fixed ? `Add stores to ${fixedPlatforms.map(obPlatformName).join(", ")}` : "Add a store"}
    subtitle={fixed ? "Search a store # or a franchisee, or paste many store #s" : "Search a store # or a franchisee and pick the platforms — each store + platform gets its own record"}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="plus" />{fixed ? `Add to ${fixedPlatforms.map(obPlatformName).join(", ")}` : "Add to onboarding"}</button></>}>
    <div className="field" style={{ marginBottom: 14 }}><label htmlFor="ob_store_in">Stores — type a store # or a franchisee name, or paste many store #s</label>
      <StorePicker ref={pickerRef} inputId="ob_store_in" value={stores} initialFranchisee={franchiseeId} onChange={(next) => { setStores(next); setBusy(true); }} />
      <StoreStatusNotice stores={plan.stores} picked={platforms} /></div>
    {!fixed && <div className="field" style={{ marginBottom: 14 }}><label>Platforms — pick one or more</label><div className="ob-picks" role="group" aria-label="Platforms">
      {OB_PLATFORMS.map(([key, name]) => {
        const on = platforms.includes(key);
        return <button type="button" key={key} className={`ob-pick${on ? " on" : ""}`} aria-pressed={on} onClick={() => setPlatforms(toggleIn(platforms, key))}>
          <span className="cbox"><Icon name="check" /></span><span className={`ob-plat p-${key}`}>{name}</span></button>;
      })}
    </div></div>}
    <div className="field" style={{ marginBottom: 14 }}><label>Starting status</label><StatusButtons options={OB_STATES} value={status} onChange={setStatus} label="Starting status" /></div>
    <div className="field" style={{ marginBottom: 12 }}><label>Onboarding details (optional)</label>
      <RichTextEditor ref={editorRef} placeholder={fixed ? "e.g. Owner is interested in catering. Sent the sign-up link by email." : "e.g. New owner wants Uber Eats and DoorDash. Sent the onboarding links by email."} minHeight={140}
        onInput={() => { setBusy(true); setDetails(editorRef.current?.getValue() || ""); }} /></div>
    <div className="help" style={{ marginBottom: 10 }}>The status is also set in each store's Delivery Platforms.</div>
    <div className={`ob-preview${ready ? " ok" : ""}`} aria-live="polite">
      {ready ? <><Icon name="list-checks" /><span><b>{plan.make.length}</b> new record{plan.make.length !== 1 ? "s" : ""}
        {plan.updates.length > 0 && <> · <b className="warn">{plan.updates.length} already on the list</b> — will be updated: {itemList(plan.updates)}</>}
        {plan.skip.length > 0 && <> · <b className="warn">{plan.skip.length} already on the list</b> with this status — no change: {itemList(plan.skip)}</>}
        {plan.exempt.length > 0 && <> · <b className="warn">{plan.exempt.length} exempted</b> — recorded as Exempted: {itemList(plan.exempt)}</>}</span></>
        : <><Icon name="info" /><span>{fixed ? "Pick at least one store." : "Pick at least one store and one platform. One record is created for each store + platform."}</span></>}
    </div>
  </Modal>;
}
