import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import RichTextEditor from "../../components/ui/RichTextEditor.jsx";
import { StatusButtons } from "../../components/ui/Choices.jsx";
import { ObPlatformTag, ObStatusBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { OB_PLATFORMS, OB_STATES } from "../../config/constants.js";
import { franchiseeName } from "../../domain/context.js";
import { obHistory, obIsOpen, obPlatformName, obVisible } from "../../domain/onboarding.js";
import { platformChipClass } from "../../domain/records.js";
import { toggleIn } from "../../lib/lists.js";
import { oneLine } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openOnboardingDetails, openOnboardingHistory } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { askDeleteOnboarding, createOnboarding, updateOnboarding } from "./onboardingActions.js";
import { platformsNotOnList } from "./onboardingSelectors.js";

/** Status a newly added platform starts with: Not enrolled, or Work in Progress when the store already has it in progress. */
const startStatus = (delivery) => (delivery === "Work in Progress" ? "Work in Progress" : OB_STATES[0]);
const order = (key) => OB_PLATFORMS.findIndex(([value]) => value === key);

/** The store's latest record per platform, in platform order. */
function storeRecords(ctx, storeNum) {
  const latest = new Map();
  ctx.onboarding.filter((record) => obVisible(record) && String(record.store_num) === String(storeNum))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .forEach((record) => { if (!latest.has(record.platform)) latest.set(record.platform, record); });
  return [...latest.values()].sort((a, b) => order(a.platform) - order(b.platform));
}

/**
 * Update one store's onboarding: change each platform's status, add one progress note to the platforms you pick,
 * and add the store's other platforms to onboarding. Every change also sets the store's Delivery Platforms.
 */
export default function StoreOnboardingDialog({ storeNum }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const records = useMemo(() => storeRecords(ctx, storeNum), [ctx, storeNum]);
  const [statuses, setStatuses] = useState(() => Object.fromEntries(records.map((record) => [record.id, record.status])));
  const [noteFor, setNoteFor] = useState(() => {
    const open = records.filter(obIsOpen).map((record) => record.id);
    return open.length ? open : records.map((record) => record.id);
  });
  const [addPlatforms, setAddPlatforms] = useState([]);
  const [hasNote, setHasNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  const store = ctx.storeByNum.get(String(storeNum));
  const owner = store ? franchiseeName(ctx, store.franchisee_id) : "";
  const others = platformsNotOnList(ctx, storeNum);

  if (!records.length) return <Modal icon="rocket" title={`Onboarding · Store ${storeNum}`} footer={<button type="button" className="btn ghost" onClick={close}>Close</button>}>
    <p className="muted">This store is no longer on the onboarding list.</p></Modal>;

  const statusOf = (record) => statuses[record.id] ?? record.status;
  const changedCount = records.filter((record) => statusOf(record) !== record.status).length;

  async function save() {
    const text = editorRef.current.getValue();
    const work = records.map((record) => ({ record, status: statusOf(record), text: text && noteFor.includes(record.id) ? text : "" }))
      .filter((item) => item.status !== item.record.status || item.text);
    if (text && !records.some((record) => noteFor.includes(record.id))) { toast("Pick at least one platform to add the progress update to", "err"); return; }
    if (!work.length && !addPlatforms.length) { toast("Change a status, write a progress update or tick a platform to add", "err"); return; }
    setSaving(true);
    let updated = 0;
    for (const item of work) {
      const fresh = ctx.onboarding.find((record) => record.id === item.record.id) || item.record;
      if (await updateOnboarding(fresh, { status: item.status, text: item.text, quiet: true })) updated += 1;
    }
    let added = 0;
    if (addPlatforms.length) {
      const items = addPlatforms.map((platform) => ({ num: String(storeNum), platform, exempt: false, status: startStatus(others.find((entry) => entry.key === platform)?.delivery) }));
      added = await createOnboarding({ items, status: OB_STATES[0], details: "", quiet: true });
    }
    setSaving(false);
    const failed = work.length - updated + (addPlatforms.length && !added ? addPlatforms.length : 0);
    const summary = [updated && `${updated} platform${updated !== 1 ? "s" : ""} updated`, added && `${added} added`].filter(Boolean).join(" · ");
    if (failed) { toast(`Store ${storeNum}: ${summary || "nothing saved"} — ${failed} not saved, try again`, "err"); return; }
    toast(`Store ${storeNum} · ${summary}`, "ok");
    close();
  }

  return <Modal size="wide" icon="refresh-cw" title={`Update onboarding · Store ${storeNum}`} subtitle={owner || undefined}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="save" />{saving ? "Saving…" : "Save update"}</button></>}>
    <div className="field" style={{ marginBottom: 6 }}><label>Platforms on the onboarding list</label></div>
    <div className="sob-list">
      {records.map((record) => {
        const steps = obHistory(record).length;
        const changed = statusOf(record) !== record.status;
        return <div className={`sob-row${changed ? " changed" : ""}`} key={record.id}>
          <div className="sob-head">
            <ObPlatformTag platform={record.platform} /><ObStatusBadge status={record.status} />
            {changed && <span className="sob-to"><Icon name="arrow-right" /><ObStatusBadge status={statusOf(record)} /></span>}
            <span className="sob-acts">
              <button type="button" className="upd-pill" data-tip={`View all ${obPlatformName(record.platform)} updates (${steps})`} onClick={() => openOnboardingHistory(record.id)}><Icon name="history" />{steps}</button>
              <button type="button" className="iconbtn mini" data-tip="Request details" aria-label={`${obPlatformName(record.platform)} request details`} onClick={() => openOnboardingDetails(record.id)}><Icon name="file-text" /></button>
              <button type="button" className="iconbtn mini del" data-tip={`Delete the ${obPlatformName(record.platform)} record`} aria-label={`Delete ${obPlatformName(record.platform)}`} onClick={() => askDeleteOnboarding(record.id)}><Icon name="trash-2" /></button>
            </span>
          </div>
          {record.last_update && <div className="sob-last muted">Latest: {oneLine(record.last_update, 120)}</div>}
          <StatusButtons options={OB_STATES} value={statusOf(record)} label={`${obPlatformName(record.platform)} status`}
            onChange={(value) => { setStatuses((current) => ({ ...current, [record.id]: value })); setBusy(true); }} />
        </div>;
      })}
    </div>

    <div className="field" style={{ marginTop: 14 }}><label>Progress update</label>
      <RichTextEditor ref={editorRef} placeholder="e.g. Sent the DoorDash and Grubhub links by text. Owner will sign today." minHeight={120}
        onInput={() => { setBusy(true); setHasNote(!!editorRef.current?.getValue()); }} /></div>
    {records.length > 1 && <div className="sob-notefor" role="group" aria-label="Add the progress update to">
      <span className="muted">Add the update to:</span>
      {records.map((record) => {
        const on = noteFor.includes(record.id);
        return <button type="button" key={record.id} className={`ob-pick sm${on ? " on" : ""}`} aria-pressed={on}
          onClick={() => { setNoteFor(toggleIn(noteFor, record.id)); setBusy(true); }}>
          <span className="cbox"><Icon name="check" /></span><span className={`ob-plat p-${record.platform}`}>{obPlatformName(record.platform)}</span></button>;
      })}
    </div>}
    <div className="help">{changedCount ? `${changedCount} status change${changedCount !== 1 ? "s" : ""} · ` : ""}{hasNote ? "progress update ready · " : ""}Statuses are also set in the store's Delivery Platforms.</div>

    <div className="ob-other"><div className="ob-other-h"><Icon name="layers" />Other platforms for this store
      {others.length > 0 && <span className="muted">tick to add them to onboarding</span>}</div>
      {others.length ? <div className="ob-picks" role="group" aria-label="Add platforms to onboarding">
        {others.map((entry) => {
          const done = entry.delivery === "Onboarded" || entry.delivery === "Exempted";
          const on = addPlatforms.includes(entry.key);
          return <button type="button" key={entry.key} className={`ob-pick${on ? " on" : ""}`} aria-pressed={on} disabled={done}
            data-tip={done ? `Already ${entry.delivery} in Delivery Platforms` : `Adds ${obPlatformName(entry.key)} to onboarding as ${startStatus(entry.delivery)}`}
            onClick={() => { setAddPlatforms(toggleIn(addPlatforms, entry.key)); setBusy(true); }}>
            <span className="cbox"><Icon name="check" /></span><span className={`ob-plat p-${entry.key}`}>{obPlatformName(entry.key)}</span>
            <span className={`chip ${platformChipClass(entry.delivery)}`}>{entry.delivery}</span></button>;
        })}
      </div> : <div className="muted ob-other-none">Every platform of this store is already on the onboarding list.</div>}
    </div>
  </Modal>;
}
