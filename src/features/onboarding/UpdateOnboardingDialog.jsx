import { useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import RichTextEditor from "../../components/ui/RichTextEditor.jsx";
import { StatusButtons } from "../../components/ui/Choices.jsx";
import { ObPlatformTag, ObStatusBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { OB_STATES } from "../../config/constants.js";
import { obHistory, obPlatformName, obSyncLabel } from "../../domain/onboarding.js";
import { richHtml } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openOnboardingHistory } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { updateOnboarding } from "./onboardingActions.js";

export default function UpdateOnboardingDialog({ onboardingId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const record = ctx.onboarding.find((item) => item.id === onboardingId);
  const [status, setStatus] = useState(() => record?.status || OB_STATES[0]);
  const [syncStore, setSyncStore] = useState(true);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  if (!record) return null;

  async function save() {
    const text = editorRef.current.getValue();
    if (status === record.status && !text) { toast("Change the status or write a progress update", "err"); return; }
    setSaving(true);
    const ok = await updateOnboarding(record, { status, text, syncStore });
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
    <label className="ob-syncrow"><input type="checkbox" checked={syncStore} onChange={(event) => setSyncStore(event.target.checked)} /><span>{obSyncLabel(record.platform, status)}</span></label>
    <div className="help"><button type="button" className="btn link" style={{ padding: 0 }} onClick={() => { close(); openOnboardingHistory(record.id); }}>
      <Icon name="history" />View all updates ({obHistory(record).length})</button></div>
  </Modal>;
}
