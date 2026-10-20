import { useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import RichTextEditor from "../../components/ui/RichTextEditor.jsx";
import StorePicker from "../../components/ui/StorePicker.jsx";
import { ChipToggles, StatusButtons } from "../../components/ui/Choices.jsx";
import { toggleIn } from "../../lib/lists.js";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { ISSUE_PLATFORMS, ISSUE_STATES } from "../../config/constants.js";
import { toast } from "../../state/toastStore.js";
import { logMultiStoreIssue } from "./issueActions.js";

/** One issue logged to 2 or more stores. */
export default function MultiStoreIssueDialog() {
  const { close, setBusy } = useDialog();
  const [stores, setStores] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [status, setStatus] = useState(ISSUE_STATES[0]);
  const [warning, setWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef(null);
  const editorRef = useRef(null);

  function changeStores(next) {
    setStores(next);
    setBusy(true);
    if (next.length >= 2) setWarning(false);
  }

  async function save() {
    const storeNums = pickerRef.current.commitTyped();
    if (storeNums.length < 2) { setWarning(true); toast("Select 2 or more stores — or use Log issue for one store", "err"); return; }
    const title = editorRef.current.getValue();
    if (!title) { toast("Describe the issue first", "err"); return; }
    setSaving(true);
    const ok = await logMultiStoreIssue({ storeNums, title, status, platforms });
    setSaving(false);
    if (ok) close();
  }

  return <Modal size="wide" icon="layers" title="Multi-store issue" subtitle="One issue logged to 2 or more stores"
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="plus" />Log multi-store issue</button></>}>
    <div className="field" style={{ marginBottom: 13 }}><label htmlFor="m_store_in">Stores — type a store # or a franchisee name, or paste many store #s (comma, space or new line)</label>
      <StorePicker ref={pickerRef} inputId="m_store_in" value={stores} onChange={changeStores} /></div>
    <div className="field" style={{ marginBottom: 13 }}><label>What is the issue?</label>
      <RichTextEditor ref={editorRef} placeholder="e.g. DoorDash menu prices not matching the store menu" minHeight={200} onInput={() => setBusy(true)} /></div>
    <div className="field" style={{ marginBottom: 13 }}><label>Platform(s) affected — pick one or more</label>
      <ChipToggles options={ISSUE_PLATFORMS} selected={platforms} onToggle={(value) => setPlatforms(toggleIn(platforms, value))} label="Platforms" /></div>
    <div className="field"><label>Status (applies to all selected stores)</label><StatusButtons options={ISSUE_STATES} value={status} onChange={setStatus} label="Status" /></div>
    <div className={`warnbox${warning ? " show" : ""}`}><Icon name="info" /><div>A multi-store issue needs <b>2 or more stores</b>. For just one store, please use the <b>Log issue</b> button instead.</div></div>
  </Modal>;
}
