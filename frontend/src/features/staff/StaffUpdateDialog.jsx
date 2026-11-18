import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import DeleteReview from "../../components/ui/DeleteReview.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { errorTitle } from "../../lib/errors.js";
import { downloadBackup, loadAll } from "../../state/appActions.js";
import { getContext, useDataContext } from "../../state/dataStore.js";
import { askPassword, confirmAction } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { STAFF_COLUMNS, downloadStaffData, downloadStaffTemplate, planStaffUpdate, readStaffFile, runStaffUpdate } from "./staffUpdate.js";

const xlsxFailed = () => toast("Spreadsheet tool didn't load — check internet", "err");
const plural = (count, word) => `${count} ${word}${count !== 1 ? "s" : ""}`;

function Change({ change }) {
  return <div className="bu-change"><b>{change.label}:</b> <span className="bu-old">{change.before || "—"}</span>
    <Icon name="arrow-right" /> <span className="bu-new">{change.after || "None"}</span></div>;
}

function Result({ row }) {
  return row.ok
    ? <span className="bk-ok"><Icon name="circle-check" />{row.msg || "Ready"}</span>
    : <span className="bk-skip"><Icon name="circle-x" />Skipped: {row.msg}</span>;
}

/** Update the FBC / OM list (people, roles, emails) and each store's FBC and OM from a spreadsheet, with a preview first. */
export default function StaffUpdateDialog() {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [failures, setFailures] = useState([]);
  const plan = useMemo(() => (parsed ? planStaffUpdate(ctx, parsed) : null), [ctx, parsed]);
  /** People not in the file are deleted (the file is the source of truth); kept = the ones the user unticked. */
  const [kept, setKept] = useState(() => new Set());
  const deleteIds = plan ? plan.removable.filter((item) => !kept.has(item.key)).map((item) => item.id) : [];

  async function chooseFile(file) {
    setFileName(file.name);
    setParsed(null);
    setError("");
    setFailures([]);
    setKept(new Set());
    try {
      const result = await readStaffFile(file);
      if (result.error) { setError(result.error); return; }
      setParsed(result);
      setBusy(true);
    } catch {
      xlsxFailed();
    }
  }

  async function save() {
    const current = planStaffUpdate(getContext(), parsed);
    // Only people still missing from the file are deleted (in case the data changed since the preview).
    const stillRemovable = new Set(current.removable.map((item) => item.id));
    setProgress({ done: 0, total: 1 });
    const result = await runStaffUpdate(current, (done, total) => setProgress({ done, total }), deleteIds.filter((id) => stillRemovable.has(id)));
    setProgress(null);
    const { counts } = result;
    const summary = [
      counts.newStaff && `${plural(counts.newStaff, "FBC / OM")} added`,
      counts.staff && `${plural(counts.staff, "FBC / OM")} updated`,
      counts.stores && `${plural(counts.stores, "store")} reassigned`,
      counts.deleted && `${plural(counts.deleted, "FBC / OM")} deleted`,
    ].filter(Boolean).join(" · ") || "Nothing was changed";
    await loadAll();
    if (result.error || result.failures.length) {
      setFailures([...(result.error ? [`Stopped: ${errorTitle(result.error)}`] : []), ...result.failures]);
      setParsed(null);
      toast(`${summary} — some changes failed, see the list`, "err");
      return;
    }
    close();
    toast(summary, "ok");
  }

  function askSave() {
    const parts = [
      plan.newStaff.length && `add ${plural(plan.newStaff.length, "FBC / OM")}`,
      plan.staffUpdates.length && `update ${plural(plan.staffUpdates.length, "FBC / OM")}`,
      plan.storeUpdates.length && `change the FBC / OM of ${plural(plan.storeUpdates.length, "store")}`,
      deleteIds.length && `DELETE ${plural(deleteIds.length, "FBC / OM")} not in the file (their stores will show "Not assigned")`,
    ].filter(Boolean);
    const confirm = () => confirmAction({
      title: deleteIds.length ? "Update and delete?" : "Update the database?", okLabel: deleteIds.length ? "Update and delete" : "Update", busyLabel: "Updating…",
      icon: deleteIds.length ? "trash-2" : "database", okClass: deleteIds.length ? "btn danger" : "btn",
      text: `This will ${parts.join(", ")}. It can't be undone from the app — download a backup first if you're unsure.`,
      onConfirm: save,
    });
    // Deleting needs the admin password, like deleting by hand.
    if (deleteIds.length) askPassword(`Password to delete ${plural(deleteIds.length, "FBC / OM")}`, confirm); else confirm();
  }

  const skipped = plan ? [...plan.staffResults, ...plan.storeResults].filter((row) => !row.ok).length : 0;
  const changeCount = plan ? plan.newStaff.length + plan.staffUpdates.length + plan.storeUpdates.length + deleteIds.length : 0;
  const saving = !!progress;
  const sortRows = (rows) => rows.slice().sort((a, b) => (a.ok - b.ok) || (a.row - b.row));

  return <Modal icon="users" title="Update FBC / OM list" subtitle="Upload a spreadsheet to update FBC / OM people and who covers each store" modalStyle={{ maxWidth: 920 }}
    onEscape={saving ? false : undefined}
    footer={<><button type="button" className="btn ghost" disabled={saving} onClick={close}>{failures.length ? "Close" : "Cancel"}</button>
      <button type="button" className={`btn${deleteIds.length ? " danger" : ""}`} disabled={!changeCount || saving} onClick={askSave}><Icon name={deleteIds.length ? "trash-2" : "database"} />
        <span>{saving ? `Updating… ${progress.done}/${progress.total}` : changeCount ? `Update ${plural(changeCount, "record")}${deleteIds.length ? ` (${deleteIds.length} deleted)` : ""}` : "Update"}</span></button></>}>
    <div className="bk-steps bu-steps">
      <div className="bk-step"><h4><span className="n">1</span>Get the spreadsheet</h4>
        <p>Start from your current data (recommended) or an empty template. Blank cells leave saved values unchanged. With a Staff sheet, FBC / OM who aren't in the file are deleted to match it — you see the list first and can untick anyone.</p>
        <div className="bk-cols"><span className="req">Staff:</span>{STAFF_COLUMNS.map((column) => <span key={column}>{column}</span>)}</div>
        <div className="bk-cols"><span className="req">Stores:</span><span>Store #</span><span>FBC</span><span>OM</span></div>
        <div className="bu-btns">
          <button type="button" className="btn sm round" onClick={() => downloadStaffData(ctx).catch(xlsxFailed)}><Icon name="download" />Current data</button>
          <button type="button" className="btn sm outline round" onClick={() => downloadStaffTemplate().catch(xlsxFailed)}><Icon name="file-spreadsheet" />Empty template</button>
        </div>
      </div>
      <div className="bk-step"><h4><span className="n">2</span>Upload the filled file</h4>
        <p>Accepts .xlsx or .csv, with the Staff sheet, the Stores sheet or both. You'll see every change before anything is saved.</p>
        <div className="bu-btns">
          <button type="button" className="btn sm round" disabled={saving} onClick={() => fileRef.current?.click()}><Icon name="upload" />Choose file</button>
          <button type="button" className="btn sm outline round" onClick={downloadBackup}><Icon name="shield-check" />Backup first</button>
        </div>
        <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" style={{ display: "none" }}
          onChange={(event) => { const file = event.target.files[0]; event.target.value = ""; if (file) chooseFile(file); }} />
        <div className="help">{fileName}</div>
      </div>
    </div>

    {error && <div className="warnbox show bu-error"><Icon name="circle-alert" /><div>{error}</div></div>}
    {failures.length > 0 && <div className="warnbox show bu-error"><Icon name="circle-alert" /><div>
      <b>Some changes were not saved.</b> Everything else was saved. Fix these and upload the file again:
      <ul>{failures.slice(0, 20).map((text) => <li key={text}>{text}</li>)}</ul>{failures.length > 20 && <>…and {failures.length - 20} more.</>}
    </div></div>}

    {plan && <>
      <div className="bk-sum">
        <div className={`s${plan.newStaff.length ? " ok" : ""}`}><b>{plan.newStaff.length}</b>New FBC / OM</div>
        <div className={`s${plan.staffUpdates.length ? " ok" : ""}`}><b>{plan.staffUpdates.length}</b>FBC / OM updated</div>
        <div className={`s${plan.storeUpdates.length ? " ok" : ""}`}><b>{plan.storeUpdates.length}</b>Stores reassigned</div>
        <div className={`s${skipped ? " bad" : ""}`}><b>{skipped}</b>Rows skipped</div>
        {plan.removable.length > 0 && <div className={`s${deleteIds.length ? " bad" : ""}`}><b>{deleteIds.length}</b>To delete</div>}
      </div>

      <DeleteReview noun="FBC / OM" nounPl="FBCs / OMs" disabled={saving} kept={kept} setKept={setKept}
        note="people on neither sheet of this file"
        items={plan.removable.map((item) => ({
          key: item.key, title: item.name || "(no name)", sub: [item.role, item.email].filter(Boolean).join(" · "),
          warn: item.stores ? `${plural(item.stores, "store")} will show "Not assigned"` : "",
        }))} />

      {(plan.newStaff.length > 0 || plan.staffUpdates.length > 0) && <>
        <div className="bu-h">FBC / OM changes</div>
        <div className="bk-table bu-table"><table><thead><tr><th>FBC / OM</th><th>Change</th></tr></thead><tbody>
          {plan.newStaff.map((entry) => <tr key={entry.key}><td>{entry.name}</td><td><span className="bk-ok"><Icon name="user-plus" />New {entry.role}{entry.email ? ` · ${entry.email}` : ""}</span></td></tr>)}
          {plan.staffUpdates.map((entry) => <tr key={entry.key}><td>{entry.existing.name}</td><td>{entry.changes.map((change) => <Change key={change.label} change={change} />)}</td></tr>)}
        </tbody></table></div>
      </>}

      {plan.staffResults.length > 0 && <>
        <div className="bu-h">Staff sheet rows</div>
        <div className="bk-table bu-table"><table><thead><tr><th>Row</th><th>Name</th><th>Result</th></tr></thead><tbody>
          {sortRows(plan.staffResults).map((row) => <tr key={`${row.sheet}-${row.row}`}><td className="muted">{row.row}</td><td>{row.name || "—"}</td><td><Result row={row} /></td></tr>)}
        </tbody></table></div>
      </>}

      {plan.storeResults.length > 0 && <>
        <div className="bu-h">Stores sheet rows</div>
        <div className="bk-table bu-table"><table><thead><tr><th>Row</th><th>Store #</th><th>Result</th></tr></thead><tbody>
          {sortRows(plan.storeResults).map((row) => <tr key={`${row.sheet}-${row.row}`}><td className="muted">{row.row}</td><td className="store">{row.num || "—"}</td>
            <td>{row.ok && row.changes.length ? row.changes.map((change) => <Change key={change.label} change={change} />) : <Result row={row} />}</td></tr>)}
        </tbody></table></div>
      </>}
      {skipped > 0 && changeCount > 0 && <div className="help">Skipped rows are not saved. Fix them in the file and upload again, or update the ready rows now.</div>}
    </>}
  </Modal>;
}
