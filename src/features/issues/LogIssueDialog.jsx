import { useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import RichTextEditor from "../../components/ui/RichTextEditor.jsx";
import StoreLookup from "../../components/ui/StoreLookup.jsx";
import { ChipToggles, StatusButtons } from "../../components/ui/Choices.jsx";
import { toggleIn } from "../../lib/lists.js";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { ISSUE_PLATFORMS, ISSUE_STATES } from "../../config/constants.js";
import { useDataContext } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import { logIssue } from "./issueActions.js";

/** Log an issue for one store (storeId fixes the store), or for a franchisee — one of their stores or General (franchiseeId fixes the franchisee). */
export default function LogIssueDialog({ storeId, franchiseeId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const fixedStore = storeId != null ? ctx.stores.find((store) => store.id === storeId) : null;
  const [target, setTarget] = useState({ franchiseeId: franchiseeId ?? null, storeNum: null });
  const [platforms, setPlatforms] = useState([]);
  const [status, setStatus] = useState(ISSUE_STATES[0]);
  const [saving, setSaving] = useState(false);
  const [targetError, setTargetError] = useState(false);
  const editorRef = useRef(null);
  const lookupRef = useRef(null);

  async function save() {
    let storeNum = fixedStore ? String(fixedStore.num || "") : null;
    let owner = fixedStore ? fixedStore.franchisee_id : null;
    if (!fixedStore) {
      const picked = lookupRef.current?.commitTyped() || target;
      if (picked.storeNum == null) {
        setTargetError(true);
        toast(picked.franchiseeId ? "Pick the store, or General" : "Pick the store or franchisee first", "err");
        lookupRef.current?.focus(); return;
      }
      storeNum = picked.storeNum;
      owner = picked.franchiseeId;
    }
    const title = editorRef.current.getValue();
    if (!title) { toast("Describe the issue first", "err"); return; }
    setSaving(true);
    const ok = await logIssue({ storeNum, franchiseeId: owner, title, status, platforms });
    setSaving(false);
    if (ok) close();
  }

  const owner = target.franchiseeId != null ? ctx.frById.get(target.franchiseeId) : null;
  const heading = fixedStore ? `Log issue · Store #${fixedStore.num || ""}` : franchiseeId != null && owner ? `Log issue · ${owner.name}` : "Log issue";

  return <Modal size="wide" icon="triangle-alert" title={heading}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="plus" />Log issue</button></>}>
    {!fixedStore && <div className="field" style={{ marginBottom: 13 }}><label htmlFor="log_store">{franchiseeId != null ? "Store" : "Store or franchisee"}</label>
      <StoreLookup ref={lookupRef} inputId="log_store" value={target} allowGeneral lockFranchisee={franchiseeId != null} invalid={targetError}
        onChange={(next) => { setTarget(next); setTargetError(false); setBusy(true); }} />
    </div>}
    <div className="field" style={{ marginBottom: 13 }}><label>What is the issue?</label>
      <RichTextEditor ref={editorRef} placeholder="e.g. Uber Eats tablet offline since this morning — orders not coming through" minHeight={200}
        autoFocus={!!fixedStore || franchiseeId != null} onInput={() => setBusy(true)} /></div>
    <div className="field" style={{ marginBottom: 13 }}><label>Platform(s) affected — pick one or more</label>
      <ChipToggles options={ISSUE_PLATFORMS} selected={platforms} onToggle={(value) => setPlatforms(toggleIn(platforms, value))} label="Platforms" /></div>
    <div className="field"><label>Status</label><StatusButtons options={ISSUE_STATES} value={status} onChange={setStatus} label="Status" /></div>
  </Modal>;
}
