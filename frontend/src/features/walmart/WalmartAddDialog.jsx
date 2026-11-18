import { useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import StorePicker from "../../components/ui/StorePicker.jsx";
import { StatusButtons } from "../../components/ui/Choices.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { WM_NEXT_STEP, WM_STAGES } from "../../config/constants.js";
import { wmPlatformStatus } from "../../domain/walmart.js";
import { useDataContext } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import { createWalmart } from "./walmartActions.js";
import { findWalmart } from "./walmartSelectors.js";

/** Add one or more stores to the Walmart tab at a stage. storeNums preselects stores; franchiseeId opens that franchisee's store list. */
export default function WalmartAddDialog({ storeNums = [], franchiseeId = null }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const [stores, setStores] = useState(() => storeNums.map(String).filter((num) => ctx.storeByNum.has(num)));
  const [stage, setStage] = useState(WM_STAGES[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef(null);

  const already = stores.filter((num) => findWalmart(ctx, num));
  const fresh = stores.filter((num) => !findWalmart(ctx, num));

  async function save() {
    const nums = pickerRef.current?.commitTyped() || stores;
    if (!nums.length) { toast("Add at least one store", "err"); return; }
    if (!nums.some((num) => !findWalmart(ctx, num))) { toast("Those stores are already on the Walmart tab", "err"); return; }
    setSaving(true);
    const ok = await createWalmart({ nums, stage, note });
    setSaving(false);
    if (ok) close();
  }

  return <Modal icon="shopping-cart" title="Add stores to Walmart" subtitle="Type a store #, paste several, or type a franchisee name and tick their stores" modalStyle={{ maxWidth: 640 }}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={saving} onClick={save}><Icon name="plus" />
        {saving ? "Adding…" : fresh.length > 1 ? `Add ${fresh.length} stores` : "Add store"}</button></>}>
    <div className="field" style={{ marginBottom: 12 }}><label htmlFor="wm_store_in">Stores</label>
      <StorePicker ref={pickerRef} inputId="wm_store_in" value={stores} initialFranchisee={franchiseeId} onChange={(next) => { setStores(next); setBusy(true); }} />
      {already.length > 0 && <div className="help cap-warn"><Icon name="triangle-alert" />Already on the Walmart tab, not added again: {already.join(", ")}. Change their stage from the list.</div>}
    </div>
    <div className="field" style={{ marginBottom: 6 }}><label>Stage</label>
      <StatusButtons options={WM_STAGES} value={stage} onChange={(value) => { setStage(value); setBusy(true); }} label="Stage" /></div>
    <div className="help" style={{ marginTop: 0, marginBottom: 12 }}>{WM_NEXT_STEP[stage]} The store's Walmart status becomes <b>{wmPlatformStatus(stage)}</b>.</div>
    <div className="field"><label htmlFor="wm_note">Note <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
      <textarea id="wm_note" className="cl-ta" maxLength={2000} value={note} placeholder="e.g. Owner asked for the application link again"
        onChange={(event) => { setNote(event.target.value); setBusy(true); }} /></div>
  </Modal>;
}
