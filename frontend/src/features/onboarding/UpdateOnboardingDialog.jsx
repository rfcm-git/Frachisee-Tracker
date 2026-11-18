import { useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import RichTextEditor from "../../components/ui/RichTextEditor.jsx";
import { StatusButtons } from "../../components/ui/Choices.jsx";
import { ObPlatformTag, ObStatusBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { OB_STATES } from "../../config/constants.js";
import { obHistory, obPlatformName } from "../../domain/onboarding.js";
import { platformChipClass } from "../../domain/records.js";
import { toggleIn } from "../../lib/lists.js";
import { richHtml } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openOnboardingHistory } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { createOnboarding, updateOnboarding } from "./onboardingActions.js";
import { platformsNotOnList } from "./onboardingSelectors.js";

/** Status a newly added platform starts with: Not enrolled, or Work in Progress when the store already has it in progress. */
const startStatus = (delivery) => (delivery === "Work in Progress" ? "Work in Progress" : OB_STATES[0]);

/**
 * The store's other platforms that are not on the onboarding list. Ones the store is not onboarded on can be ticked to add them;
 * Onboarded and Exempted ones are shown for reference only.
 */
function OtherPlatforms({ entries, picked, onToggle }) {
  if (!entries.length) return <div className="ob-other"><div className="ob-other-h"><Icon name="layers" />Other platforms for this store</div>
    <div className="muted ob-other-none">Every platform of this store is already on the onboarding list.</div></div>;
  return <div className="ob-other"><div className="ob-other-h"><Icon name="layers" />Other platforms for this store
    <span className="muted">tick to add them to onboarding</span></div>
    <div className="ob-picks" role="group" aria-label="Add platforms to onboarding">
      {entries.map((entry) => {
        const done = entry.delivery === "Onboarded" || entry.delivery === "Exempted";
        const on = picked.includes(entry.key);
        return <button type="button" key={entry.key} className={`ob-pick${on ? " on" : ""}`} aria-pressed={on} disabled={done}
          data-tip={done ? `Already ${entry.delivery} in Delivery Platforms` : `Adds ${obPlatformName(entry.key)} to onboarding as ${startStatus(entry.delivery)}`}
          onClick={() => onToggle(entry.key)}>
          <span className="cbox"><Icon name="check" /></span><span className={`ob-plat p-${entry.key}`}>{obPlatformName(entry.key)}</span>
          <span className={`chip ${platformChipClass(entry.delivery)}`}>{entry.delivery}</span></button>;
      })}
    </div></div>;
}

export default function UpdateOnboardingDialog({ onboardingId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const record = ctx.onboarding.find((item) => item.id === onboardingId);
  const [status, setStatus] = useState(() => record?.status || OB_STATES[0]);
  const [addPlatforms, setAddPlatforms] = useState([]);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  if (!record) return null;
  // ezCater has its own tab, so its records don't offer the Onboarding tab's other platforms.
  const ez = record.platform === "ez";
  const others = ez ? [] : platformsNotOnList(ctx, record.store_num);

  async function save() {
    const text = editorRef.current.getValue();
    const changed = status !== record.status || !!text;
    if (!changed && !addPlatforms.length) { toast("Change the status, write a progress update or tick a platform to add", "err"); return; }
    setSaving(true);
    let ok = true;
    if (changed) ok = await updateOnboarding(record, { status, text });
    if (ok && addPlatforms.length) {
      const items = addPlatforms.map((platform) => {
        const entry = others.find((item) => item.key === platform);
        return { num: String(record.store_num), platform, exempt: false, status: startStatus(entry?.delivery) };
      });
      ok = (await createOnboarding({ items, status: OB_STATES[0], details: "", quiet: true })) > 0;
      if (ok) toast(`Store ${record.store_num} · added ${addPlatforms.map(obPlatformName).join(", ")} to onboarding`, "ok");
    }
    setSaving(false);
    if (ok) close();
  }

  return <Modal size="wide" icon="refresh-cw" title={`Update onboarding · Store ${record.store_num} · ${obPlatformName(record.platform)}`}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="save" />Save update</button></>}>
    <div className="field" style={{ marginBottom: 12 }}><label>Request</label>
      <div className="ic-top"><ObPlatformTag platform={record.platform} /><ObStatusBadge status={record.status} /></div>
      {record.details ? <div className="rt" style={{ fontSize: 13.5 }} dangerouslySetInnerHTML={{ __html: richHtml(record.details) }} /> : <span className="muted">Onboarding request</span>}</div>
    {record.last_update && <div className="field" style={{ marginBottom: 12 }}><label>Latest update</label>
      <div className="muted rt" style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: richHtml(record.last_update) }} /></div>}
    <div className="field" style={{ marginBottom: 13 }}><label>Status</label>
      <StatusButtons options={OB_STATES} value={status} onChange={(value) => { setStatus(value); setBusy(true); }} label="Status" /></div>
    <div className="field"><label>Progress update</label>
      <RichTextEditor ref={editorRef} placeholder="e.g. Sent the DoorDash onboarding link by text. Owner will sign today." minHeight={150} autoFocus onInput={() => setBusy(true)} /></div>
    <div className="help">The status is also set in the store's Delivery Platforms.</div>
    {!ez && <OtherPlatforms entries={others} picked={addPlatforms} onToggle={(key) => { setAddPlatforms(toggleIn(addPlatforms, key)); setBusy(true); }} />}
    <div className="help"><button type="button" className="btn link" style={{ padding: 0 }} onClick={() => { close(); openOnboardingHistory(record.id); }}>
      <Icon name="history" />View all updates ({obHistory(record).length})</button></div>
  </Modal>;
}
