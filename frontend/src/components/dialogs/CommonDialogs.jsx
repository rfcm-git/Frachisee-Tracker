import { useState } from "react";
import Icon from "../ui/Icon.jsx";
import Modal from "../ui/Modal.jsx";
import { BusyButton } from "../ui/common.jsx";
import { useDialog } from "./dialogContext.js";
import { loadAll } from "../../state/appActions.js";
import { DIALOG, closeDialogs } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";

/** Yes/no confirmation. onConfirm may be async; returning false keeps the dialog open. text may be a string or JSX. */
export function ConfirmDialog({ text, okLabel = "Delete", title = "Confirm delete", busyLabel, onConfirm, icon = "trash-2", okClass = "btn danger" }) {
  const { close } = useDialog();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const result = await onConfirm?.();
    setBusy(false);
    if (result !== false) close();
  }

  return <Modal size="small" icon={icon} title={title} showClose={false} role="alertdialog" onEscape={busy ? false : close}
    footer={<><button type="button" className="btn ghost" disabled={busy} onClick={close}>Cancel</button>
      <BusyButton className={okClass} busy={busy} busyLabel={busyLabel || `${okLabel}…`} onClick={confirm} autoFocus>{okLabel}</BusyButton></>}>
    {typeof text === "string" ? <p className="hint">{text}</p> : <div className="hint">{text}</div>}
  </Modal>;
}

/** Shown when a teammate saved the record first; nothing was overwritten. */
export function ConflictDialog({ what }) {
  const { close } = useDialog();
  const [loading, setLoading] = useState(false);

  async function reload() {
    setLoading(true);
    closeDialogs(DIALOG.franchiseeForm, DIALOG.updateIssue, DIALOG.groupUpdate, DIALOG.staffForm, DIALOG.staffDetail, DIALOG.updateOnboarding, DIALOG.storeOnboarding, DIALOG.callLog);
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
