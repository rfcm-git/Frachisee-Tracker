import { useEffect, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { BusyButton } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { errorTitle } from "../../lib/errors.js";
import { hasDb } from "../../services/api.js";
import { downloadBackup, loadAll, readBackupFile, restoreBackup } from "../../state/appActions.js";
import { useDataStore } from "../../state/dataStore.js";
import { askPassword, confirmAction, openBulkImport, openBulkUpdate } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { setIdleMinutes, useUiStore } from "../../state/uiStore.js";
import { shortTime } from "../../lib/format.js";

const sectionStyle = { marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 15 };
const labelStyle = { display: "block", fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 600, marginBottom: 7 };

function notificationPermission() {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/** Asks for the password and a confirmation, then restores the backup. */
function startRestore(backup, closeSettings) {
  askPassword("Import password", () => confirmAction({
    title: "Confirm restore",
    okLabel: "Restore",
    busyLabel: "Restoring…",
    text: `Restore ${backup.franchisees.length} franchisees, ${backup.stores.length} stores, ${backup.staff.length} FBC/OM and ${backup.issues.length} issues into the shared database. Matching records are overwritten. Continue?`,
    onConfirm: async () => {
      let history;
      try {
        history = await restoreBackup(backup);
      } catch (error) {
        toast(errorTitle(error), "err");
        return false;
      }
      toast(`Backup restored · ${history.added} history record${history.added !== 1 ? "s" : ""} added, ${history.updated} updated${history.skipped ? `, ${history.skipped} duplicate${history.skipped !== 1 ? "s" : ""} skipped` : ""}`, "ok");
      closeSettings();
      loadAll();
      return true;
    },
  }));
}

export default function SettingsDialog() {
  const { close } = useDialog();
  const lastRefreshAt = useDataStore((state) => state.lastRefreshAt);
  const idleMinutes = useUiStore((state) => state.idleMinutes);
  const [idleDraft, setIdleDraft] = useState(String(idleMinutes));
  const [backingUp, setBackingUp] = useState(false);
  const [notification, setNotification] = useState(notificationPermission);
  const fileRef = useRef(null);

  useEffect(() => {
    function refreshPermission() { setNotification(notificationPermission()); }
    window.addEventListener("focus", refreshPermission);
    return () => window.removeEventListener("focus", refreshPermission);
  }, []);

  async function enableNotifications() {
    if (typeof Notification === "undefined") { setNotification("unsupported"); return; }
    try { setNotification(await Notification.requestPermission()); }
    catch { setNotification(Notification.permission); }
  }

  function saveIdle(value) {
    const saved = setIdleMinutes(value);
    setIdleDraft(String(saved));
    toast(saved ? `Auto-refresh after ${saved} min idle` : "Auto-refresh turned off", "ok");
  }

  async function runBackup() {
    setBackingUp(true);
    await downloadBackup();
    setBackingUp(false);
  }

  async function chooseBackup(file) {
    if (!hasDb()) { toast("Database is not available", "err"); return; }
    const backup = await readBackupFile(file);
    if (backup) startRestore(backup, close);
  }

  return <Modal size="small" icon="settings" title="Settings" footer={<button type="button" className="btn ghost" onClick={close}>Close</button>}>
    <div style={sectionStyle}>
      <label style={labelStyle} htmlFor="idleMin">Auto-refresh when idle</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="timer" style={{ color: "var(--green)" }} />
        <span style={{ fontSize: 13.5 }}>Refresh after</span>
        <input type="number" id="idleMin" min="0" max="120" step="1" className="fnum" style={{ width: 70 }} value={idleDraft}
          onChange={(event) => setIdleDraft(event.target.value)} onBlur={(event) => saveIdle(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") saveIdle(event.currentTarget.value); }} />
        <span style={{ fontSize: 13.5 }}>minute(s) of no activity</span>
      </div>
      <div className="help">Set to 0 to turn it off. It waits if you have a form open, so nothing you're typing is lost. {lastRefreshAt && `Last refreshed ${shortTime(lastRefreshAt)}.`}</div>
    </div>

    <div style={sectionStyle}>
      <label style={labelStyle}>Follow-up reminders</label>
      <div>{notification === "granted" ? <span className="badge cl-o-ans">Desktop notifications on</span>
        : notification === "denied" ? <><span className="badge cl-o-nva">Blocked by the browser</span> <span className="muted">— allow notifications for this page in the browser’s site settings</span></>
          : notification === "unsupported" ? <><span className="badge cl-o-nva">Not supported here</span> <span className="muted">— in-app reminders still work</span></>
            : <button type="button" className="btn sm outline round" onClick={enableNotifications}><Icon name="bell" />Allow desktop notifications</button>}</div>
      <div className="help">Reminders pop up in the app when a follow-up is due, while the app is open. Desktop notifications also show when this tab is in the background.</div>
    </div>

    <div style={sectionStyle}>
      <label style={labelStyle}>Franchisees &amp; stores</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn ghost" onClick={() => { close(); openBulkImport(); }}><Icon name="file-spreadsheet" />Bulk add from spreadsheet</button>
        <button type="button" className="btn ghost" onClick={() => { close(); openBulkUpdate(); }}><Icon name="database" />Update from spreadsheet</button>
      </div>
      <div className="help">Bulk add creates new franchisees and stores. Update changes existing ones — contacts, store details and owner transfers — and can add new ones too. Save a backup first.</div>
    </div>

    <div style={sectionStyle}>
      <label style={labelStyle}>Backup</label>
      <BusyButton className="btn ghost" spinner={false} busy={backingUp} busyLabel="Preparing backup…" onClick={runBackup}><Icon name="download" />Save database backup (.json)</BusyButton>
      <div className="help">Downloads every franchisee, store, FBC/OM and issue as one file. Do this before any database change so nothing is lost.</div>
      <button type="button" className="btn ghost" style={{ marginTop: 12 }} onClick={() => fileRef.current?.click()}><Icon name="upload" />Import backup (.json)</button>
      <input type="file" ref={fileRef} accept="application/json,.json" style={{ display: "none" }}
        onChange={(event) => { const file = event.target.files[0]; event.target.value = ""; if (file) chooseBackup(file); }} />
      <div className="help">Restores a saved backup file into the database. Overwrites matching records — use after data loss.</div>
    </div>
  </Modal>;
}
