import { useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import RichTextEditor from "../../components/ui/RichTextEditor.jsx";
import { ChipToggles, StatusButtons } from "../../components/ui/Choices.jsx";
import { toggleIn } from "../../lib/lists.js";
import { StoreStatusBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { ISSUE_PLATFORMS, ISSUE_STATES } from "../../config/constants.js";
import { franchiseeName } from "../../domain/context.js";
import { storeStatus } from "../../domain/records.js";
import { cleanStoreNumber } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import { logIssue } from "./issueActions.js";

/** Live check of the typed store number. */
function StoreCheck({ ctx, num }) {
  if (!num) return <div className="st-check" />;
  const store = ctx.storeByNum.get(num);
  if (!store) return <div className="st-check show bad"><Icon name="circle-x" /><span>Store <b>{num}</b> doesn't exist. Check the number or pick one from the list.</span></div>;
  const location = store.city ? `${store.city}${store.state ? `, ${store.state}` : ""}` : "";
  return <div className="st-check show ok"><Icon name="circle-check" />
    <span><b>Store {num}</b> · {franchiseeName(ctx, store.franchisee_id) || "—"}{location && ` · ${location}`}</span>
    <StoreStatusBadge status={storeStatus(store)} /></div>;
}

/** Log an issue for one store (storeId fixes the store). */
export default function LogIssueDialog({ storeId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const fixedStore = storeId != null ? ctx.stores.find((store) => store.id === storeId) : null;
  const [storeText, setStoreText] = useState("");
  const [platforms, setPlatforms] = useState([]);
  const [status, setStatus] = useState(ISSUE_STATES[0]);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  const storeRef = useRef(null);
  const typedNum = cleanStoreNumber(storeText);

  async function save() {
    const storeNum = fixedStore ? String(fixedStore.num || "") : typedNum;
    if (!fixedStore) {
      if (!storeNum) { toast("Enter the store number", "err"); storeRef.current?.focus(); return; }
      if (!ctx.storeByNum.has(storeNum)) { toast(`Store ${storeNum} doesn't exist — check the number`, "err"); storeRef.current?.focus(); return; }
    }
    const title = editorRef.current.getValue();
    if (!title) { toast("Describe the issue first", "err"); return; }
    setSaving(true);
    const ok = await logIssue({ storeNum, title, status, platforms });
    setSaving(false);
    if (ok) close();
  }

  const checkState = typedNum ? (ctx.storeByNum.has(typedNum) ? "good" : "bad") : "";

  return <Modal size="wide" icon="triangle-alert" title={fixedStore ? `Log issue · Store #${fixedStore.num || ""}` : "Log issue"}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="plus" />Log issue</button></>}>
    {!fixedStore && <div className="field" style={{ marginBottom: 13 }}><label htmlFor="log_store">Store #</label>
      <datalist id="log_store_list">{ctx.stores.map((store) => <option key={store.id} value={String(store.num)} />)}</datalist>
      <input id="log_store" ref={storeRef} list="log_store_list" placeholder="e.g. 12345" autoComplete="off" inputMode="numeric" autoFocus className={checkState}
        value={storeText} onChange={(event) => { setStoreText(event.target.value); setBusy(true); }} />
      <StoreCheck ctx={ctx} num={typedNum} />
    </div>}
    <div className="field" style={{ marginBottom: 13 }}><label>What is the issue?</label>
      <RichTextEditor ref={editorRef} placeholder="e.g. Uber Eats tablet offline since this morning — orders not coming through" minHeight={200}
        autoFocus={!!fixedStore} onInput={() => setBusy(true)} /></div>
    <div className="field" style={{ marginBottom: 13 }}><label>Platform(s) affected — pick one or more</label>
      <ChipToggles options={ISSUE_PLATFORMS} selected={platforms} onToggle={(value) => setPlatforms(toggleIn(platforms, value))} label="Platforms" /></div>
    <div className="field"><label>Status</label><StatusButtons options={ISSUE_STATES} value={status} onChange={setStatus} label="Status" /></div>
  </Modal>;
}
