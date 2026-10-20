import { useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import RichTextEditor from "../../components/ui/RichTextEditor.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { useDataContext } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import { addStoreNote } from "./storeActions.js";

export default function AddNoteDialog({ storeId }) {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const editorRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const store = ctx.stores.find((item) => item.id === storeId);
  if (!store) return null;

  async function save() {
    const text = editorRef.current.getValue();
    if (!text) { toast("Type a note first", "err"); return; }
    setSaving(true);
    const ok = await addStoreNote(store, text);
    setSaving(false);
    if (ok) close();
  }

  return <Modal size="wide" icon="sticky-note" title={`Add note · Store #${store.num || ""}`}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn yellow" disabled={saving} onClick={save}><Icon name="plus" />Add note</button></>}>
    <div className="field"><label>Note</label>
      <RichTextEditor ref={editorRef} placeholder="Type your note…" minHeight={220} autoFocus onInput={() => setBusy(true)} />
      <div className="help">A date &amp; time stamp is added automatically.</div></div>
  </Modal>;
}
