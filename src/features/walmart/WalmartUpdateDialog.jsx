import { useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { StatusButtons } from "../../components/ui/Choices.jsx";
import { WmStageBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { WM_NEXT_STEP, WM_STAGES } from "../../config/constants.js";
import { franchiseeName } from "../../domain/context.js";
import { platformStatus } from "../../domain/records.js";
import { normalizeWmStage, wmHistory, wmPlatformStatus } from "../../domain/walmart.js";
import { formatTimestamp } from "../../lib/format.js";
import { useDataContext } from "../../state/dataStore.js";
import { openStore } from "../../state/dialogs.js";
import { askDeleteWalmart, updateWalmart } from "./walmartActions.js";
import { sendWalmartEmail } from "./walmartEmailActions.js";
import { wmCanEmail } from "../../domain/walmartEmail.js";

/** One change-log entry: added, stage change and/or note, and whether it came from an import. */
function LogEntry({ entry }) {
  const by = entry.source === "import" ? " · by import" : "";
  return <li className={entry.kind === "created" ? "created" : ""}>
    <div className="cap-log-t"><b>{entry.kind === "created" ? `Added${by}` : entry.kind === "email" ? "Email opened in Outlook" : entry.to ? `Stage changed${by}` : "Note added"}</b><time>{formatTimestamp(entry.ts)}</time></div>
    {entry.kind === "email" && entry.stage && <div className="cap-log-c">{entry.stage} email</div>}
    {entry.kind === "created" && entry.stage && <div className="cap-log-c">Stage: <WmStageBadge stage={entry.stage} /></div>}
    {entry.to && <div className="cap-log-c wm-logchg"><WmStageBadge stage={entry.from} /><Icon name="arrow-right" /><WmStageBadge stage={entry.to} /></div>}
    {entry.note && <div className="cap-log-c wm-lognote">{entry.note}</div>}
  </li>;
}

/** Change a store's stage and/or add a note, with its change log. The store's Walmart status follows the stage. */
export default function WalmartUpdateDialog({ recordId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const record = ctx.walmart.find((item) => item.id === recordId);
  const [stage, setStage] = useState(() => normalizeWmStage(record?.stage));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  if (!record) return null;

  const store = ctx.storeByNum.get(String(record.store_num));
  const before = normalizeWmStage(record.stage);
  const log = wmHistory(record).slice().reverse();
  const storeStatusNow = store ? platformStatus(store, "wm") : "";

  async function save() {
    setSaving(true);
    const ok = await updateWalmart(record, { stage, note });
    setSaving(false);
    if (ok) close();
  }

  return <Modal icon="shopping-cart" title={`Walmart · Store ${record.store_num}`}
    subtitle={`${store ? franchiseeName(ctx, store.franchisee_id) || "No franchisee" : "Not in the store list"} · added ${formatTimestamp(record.created_at)}`} modalStyle={{ maxWidth: 640 }}
    footer={<>
      <button type="button" className="btn outline danger" style={{ marginRight: "auto" }} onClick={() => askDeleteWalmart(record.id, close)}><Icon name="trash-2" />Remove</button>
      <button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving || (stage === before && !note.trim())} onClick={save}><Icon name="save" />{saving ? "Saving…" : "Save update"}</button>
    </>}>
    <div className="cap-storeinfo wm-now" role="status">
      <span>Now <WmStageBadge stage={before} /></span>
      {store && <span className="muted">Store's Walmart status: {storeStatusNow}</span>}
      {record.last_email_at && <span className="muted">Emailed {formatTimestamp(record.last_email_at)}</span>}
      {store && <button type="button" className="btn link" onClick={() => openStore(store.id)}><Icon name="store" />Store information</button>}
      {wmCanEmail(record) && <button type="button" className="btn link" onClick={() => sendWalmartEmail(record.id)}><Icon name="mail" />Email the owner</button>}
    </div>
    <div className="field" style={{ marginBottom: 6 }}><label>Stage</label>
      <StatusButtons options={WM_STAGES} value={stage} onChange={(value) => { setStage(value); setBusy(true); }} label="Stage" /></div>
    <div className="help" style={{ marginTop: 0, marginBottom: 12 }}>{WM_NEXT_STEP[stage]}
      {stage !== before && <> The store's Walmart status becomes <b>{wmPlatformStatus(stage)}</b>.</>}</div>
    <div className="field" style={{ marginBottom: 14 }}><label htmlFor="wm_upd_note">Note <span className="muted" style={{ fontWeight: 400 }}>(optional — saved in the change log)</span></label>
      <textarea id="wm_upd_note" className="cl-ta" maxLength={2000} value={note} autoFocus placeholder="What happened? e.g. Called the owner, will submit the application today"
        onChange={(event) => { setNote(event.target.value); setBusy(true); }} /></div>
    <div className="bu-h">Change log</div>
    {log.length ? <ol className="wm-log">{log.map((entry, index) => <LogEntry key={`${entry.ts}-${index}`} entry={entry} />)}</ol>
      : <p className="muted">No changes recorded yet.</p>}
  </Modal>;
}
