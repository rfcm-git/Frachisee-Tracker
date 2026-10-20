import { useState } from "react";
import Icon from "../ui/Icon.jsx";
import Modal from "../ui/Modal.jsx";
import { BusyButton } from "../ui/common.jsx";
import { useDialog } from "./dialogContext.js";
import { ADMIN_PASSWORD } from "../../config/constants.js";
import { loadAll } from "../../state/appActions.js";
import { DIALOG, closeDialogs } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";

/** Yes/no confirmation. onConfirm may be async; returning false keeps the dialog open. */
export function ConfirmDialog({ text, okLabel = "Delete", title = "Confirm delete", busyLabel, onConfirm }) {
  const { close } = useDialog();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const result = await onConfirm?.();
    setBusy(false);
    if (result !== false) close();
  }

  return <Modal size="small" icon="trash-2" title={title} showClose={false} role="alertdialog" onEscape={busy ? false : close}
    footer={<><button type="button" className="btn ghost" disabled={busy} onClick={close}>Cancel</button>
      <BusyButton className="btn danger" busy={busy} busyLabel={busyLabel || `${okLabel}…`} onClick={confirm} autoFocus>{okLabel}</BusyButton></>}>
    <p className="hint">{text}</p>
  </Modal>;
}

/** Asks for the admin password before a protected action. */
export function PasswordDialog({ label = "Password", onUnlock, onCancel }) {
  const { close } = useDialog();
  const [value, setValue] = useState("");

  function unlock() {
    if (value !== ADMIN_PASSWORD) { toast("Wrong password", "err"); return; }
    close();
    onUnlock?.();
  }
  const cancel = () => { close(); onCancel?.(); };

  return <Modal size="small" icon="lock" title="Enter password" onClose={cancel}
    footer={<><button type="button" className="btn ghost" onClick={cancel}>Cancel</button>
      <button type="button" className="btn" onClick={unlock}><Icon name="unlock" />Unlock</button></>}>
    <div className="field"><label htmlFor="imp_pw">{label}</label>
      <input id="imp_pw" type="password" placeholder="Password" autoComplete="off" spellCheck="false" autoFocus value={value}
        onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") unlock(); }} /></div>
  </Modal>;
}

/** Shown when a teammate saved the record first; nothing was overwritten. */
export function ConflictDialog({ what }) {
  const { close } = useDialog();
  const [loading, setLoading] = useState(false);

  async function reload() {
    setLoading(true);
    closeDialogs(DIALOG.franchiseeForm, DIALOG.updateIssue, DIALOG.groupUpdate, DIALOG.staffForm, DIALOG.staffDetail, DIALOG.updateOnboarding, DIALOG.callLog);
    await loadAll();
    setLoading(false);
    close();
    toast("Loaded the latest data", "ok");
  }

  return <Modal size="small" icon="users" iconStyle={{ color: "var(--warn)" }} title="Someone else changed this" showClose={false}
    footer={<><button type="button" className="btn ghost" onClick={close}>Close</button>
      <BusyButton busy={loading} busyLabel="Reloading…" onClick={reload}><Icon name="refresh-cw" />Reload latest</BusyButton></>}>
    <p className="hint">{what || "This record"} was changed or removed by a teammate while you were working on it. Your change was NOT saved, so nothing was overwritten. Reload to get the latest version, then make your change again.</p>
  </Modal>;
}
