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
import { UPDATE_COLUMNS, downloadCurrentData, downloadUpdateTemplate, planBulkUpdate, readUpdateFile, runBulkUpdate } from "./bulkUpdate.js";

const xlsxFailed = () => toast("Spreadsheet tool didn't load — check internet", "err");
const plural = (count, word) => `${count} ${word}${count !== 1 ? "s" : ""}`;

/** Update franchisees (emails, phones) and stores (details, owner transfers) from a spreadsheet, with a preview first. */
export default function BulkUpdateDialog() {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [mode, setMode] = useState("replace");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [failures, setFailures] = useState([]);
  const plan = useMemo(() => (parsed ? planBulkUpdate(ctx, parsed, mode) : null), [ctx, parsed, mode]);
  /** "Also delete what is not in this file", one opt-in per kind; then only the ticked records (keys) are deleted. */
  const [delStoresOn, setDelStoresOn] = useState(false);
  const [delFrOn, setDelFrOn] = useState(false);
  const [delSel, setDelSel] = useState(() => new Set());
  const storeIds = plan && delStoresOn ? plan.removable.stores.filter((item) => delSel.has(item.key)).map((item) => item.id) : [];
  const franchiseeIds = plan && delFrOn ? plan.removable.franchisees.filter((item) => delSel.has(item.key)).map((item) => item.id) : [];
  const deleteCount = storeIds.length + franchiseeIds.length;
  const turn = (list, setOn) => (on) => {
    setOn(on);
    setDelSel((current) => {
      const next = new Set(current);
      list.forEach((item) => (on ? next.add(item.key) : next.delete(item.key)));
      return next;
    });
  };

  async function chooseFile(file) {
    setFileName(file.name);
    setParsed(null);
    setError("");
    setFailures([]);
    setDelStoresOn(false);
    setDelFrOn(false);
    setDelSel(new Set());
    try {
      const result = await readUpdateFile(file);
      if (result.error) { setError(result.error); return; }
      setParsed(result);
      setBusy(true);
    } catch {
      xlsxFailed();
    }
  }

  async function save() {
    const current = planBulkUpdate(getContext(), parsed, mode);
    // Only records still missing from the file are deleted (in case the data changed since the preview).
    const still = (list) => new Set(list.map((item) => item.id));
    const okStores = still(current.removable.stores);
    const okFr = still(current.removable.franchisees);
    setProgress({ done: 0, total: 1 });
    const result = await runBulkUpdate(current, (done, total) => setProgress({ done, total }),
      { storeIds: storeIds.filter((id) => okStores.has(id)), franchiseeIds: franchiseeIds.filter((id) => okFr.has(id)) });
    setProgress(null);
    const { counts } = result;
    const summary = [
      counts.stores && `${plural(counts.stores, "store")} updated${counts.transfers ? ` (${counts.transfers} transferred)` : ""}`,
      counts.newStores && `${plural(counts.newStores, "store")} added`,
      counts.franchisees && `${plural(counts.franchisees, "franchisee")} updated`,
      counts.newFranchisees && `${plural(counts.newFranchisees, "franchisee")} added`,
      counts.deletedStores && `${plural(counts.deletedStores, "store")} deleted`,
      counts.deletedFranchisees && `${plural(counts.deletedFranchisees, "franchisee")} deleted`,
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
      plan.storeUpdates.length && `update ${plural(plan.storeUpdates.length, "store")}`,
      plan.newStores.length && `add ${plural(plan.newStores.length, "store")}`,
      plan.franchiseeUpdates.length && `update ${plural(plan.franchiseeUpdates.length, "franchisee")}`,
      plan.newFranchisees.length && `add ${plural(plan.newFranchisees.length, "franchisee")}`,
      storeIds.length && `DELETE ${plural(storeIds.length, "store")} not in the file (with their issues and onboarding / Walmart records)`,
      franchiseeIds.length && `DELETE ${plural(franchiseeIds.length, "franchisee")} not in the file`,
    ].filter(Boolean);
    const confirm = () => confirmAction({
      title: deleteCount ? "Update and delete?" : "Update the database?", okLabel: deleteCount ? "Update and delete" : "Update", busyLabel: "Updating…",
      icon: deleteCount ? "trash-2" : "database", okClass: deleteCount ? "btn danger" : "btn",
      text: `This will ${parts.join(", ")}. It can't be undone from the app — download a backup first if you're unsure.`,
      onConfirm: save,
    });
    // Deleting needs the admin password, like deleting by hand.
    if (deleteCount) askPassword(`Password to delete ${[storeIds.length && plural(storeIds.length, "store"), franchiseeIds.length && plural(franchiseeIds.length, "franchisee")].filter(Boolean).join(" and ")}`, confirm);
    else confirm();
  }

  const ready = plan ? plan.rows.filter((row) => row.ok) : [];
  const skipped = plan ? plan.rows.filter((row) => !row.ok) : [];
  const changeCount = plan ? plan.storeUpdates.length + plan.newStores.length + plan.franchiseeUpdates.length + plan.newFranchisees.length + deleteCount : 0;
  const transfers = plan ? plan.storeUpdates.filter((update) => update.ownerKey).length : 0;
  const saving = !!progress;

  return <Modal icon="database" title="Update franchisees & stores" subtitle="Upload a spreadsheet to update contacts, store details and owners" modalStyle={{ maxWidth: 920 }}
    onEscape={saving ? false : undefined}
    footer={<><button type="button" className="btn ghost" disabled={saving} onClick={close}>{failures.length ? "Close" : "Cancel"}</button>
      <button type="button" className={`btn${deleteCount ? " danger" : ""}`} disabled={!changeCount || saving} onClick={askSave}><Icon name={deleteCount ? "trash-2" : "database"} />
        <span>{saving ? `Updating… ${progress.done}/${progress.total}` : changeCount ? `Update ${plural(changeCount, "record")}${deleteCount ? ` (${deleteCount} deleted)` : ""}` : "Update"}</span></button></>}>
    <div className="bk-steps bu-steps">
      <div className="bk-step"><h4><span className="n">1</span>Get the spreadsheet</h4>
        <p>Start from your current data (recommended) or an empty template. Blank cells leave saved values unchanged.</p>
        <div className="bk-cols">{UPDATE_COLUMNS.map((column) => <span key={column} className={column === "Store #" ? "req" : ""}>{column}</span>)}</div>
        <div className="bu-btns">
          <button type="button" className="btn sm round" onClick={() => downloadCurrentData(ctx).catch(xlsxFailed)}><Icon name="download" />Current data</button>
          <button type="button" className="btn sm outline round" onClick={() => downloadUpdateTemplate().catch(xlsxFailed)}><Icon name="file-spreadsheet" />Empty template</button>
        </div>
      </div>
      <div className="bk-step"><h4><span className="n">2</span>Upload the filled file</h4>
        <p>Accepts .xlsx or .csv. Extra columns like Source Tab are ignored. You'll see every change before anything is saved.</p>
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
      <div className="bu-mode" role="radiogroup" aria-label="Franchisee emails and phones">
        <span>Emails &amp; phones in the file:</span>
        <label><input type="radio" name="bu_mode" checked={mode === "replace"} onChange={() => setMode("replace")} /><b>Replace</b> the saved ones</label>
        <label><input type="radio" name="bu_mode" checked={mode === "add"} onChange={() => setMode("add")} /><b>Add</b> to the saved ones</label>
      </div>
      <div className="bk-sum">
        <div className={`s${plan.storeUpdates.length ? " ok" : ""}`}><b>{plan.storeUpdates.length}</b>Stores updated</div>
        <div className={`s${transfers ? " ok" : ""}`}><b>{transfers}</b>Transfers</div>
        <div className={`s${plan.newStores.length ? " ok" : ""}`}><b>{plan.newStores.length}</b>New stores</div>
        <div className={`s${plan.franchiseeUpdates.length ? " ok" : ""}`}><b>{plan.franchiseeUpdates.length}</b>Franchisees updated</div>
        <div className={`s${plan.newFranchisees.length ? " ok" : ""}`}><b>{plan.newFranchisees.length}</b>New franchisees</div>
        <div className={`s${skipped.length ? " bad" : ""}`}><b>{skipped.length}</b>Rows skipped</div>
        {(plan.removable.stores.length > 0 || plan.removable.franchisees.length > 0) && <div className={`s${deleteCount ? " bad" : ""}`}><b>{deleteCount}</b>To delete</div>}
      </div>

      <DeleteReview noun="store" nounPl="stores" disabled={saving} enabled={delStoresOn} onEnabled={turn(plan.removable.stores, setDelStoresOn)}
        selected={delSel} setSelected={setDelSel} note="store numbers on no row of this file"
        items={plan.removable.stores.map((item) => ({
          key: item.key, title: item.title, sub: item.sub,
          warn: [item.issues && plural(item.issues, "issue"), item.onboarding && plural(item.onboarding, "onboarding record"), item.walmart && "Walmart record"]
            .filter(Boolean).join(", ").replace(/^./, (first) => first.toUpperCase()) + ((item.issues || item.onboarding || item.walmart) ? " deleted with it" : ""),
        }))} />

      <DeleteReview noun="franchisee" nounPl="franchisees" disabled={saving} enabled={delFrOn} onEnabled={turn(plan.removable.franchisees, setDelFrOn)}
        selected={delSel} setSelected={setDelSel} note="owners named on no row of this file"
        items={plan.removable.franchisees.map((item) => ({
          key: item.key, title: item.name || "(no name)",
          warn: item.stores.length ? `Owns ${plural(item.stores.length, "store")} (${item.stores.slice(0, 6).join(", ")}${item.stores.length > 6 ? "…" : ""}) — also tick ${item.stores.length === 1 ? "it" : "them"} above, or the franchisee is kept` : "",
        }))} />
      {plan.emptied.length > 0 && <div className="warnbox show"><Icon name="triangle-alert" /><div>
        After the transfers, <b>{plan.emptied.join(", ")}</b> will have no stores left. They are kept in the list — close them in the Franchisees tab if they left.
      </div></div>}

      {plan.franchiseeUpdates.length > 0 && <>
        <div className="bu-h">Franchisee changes</div>
        <div className="bk-table bu-table"><table><thead><tr><th>Franchisee</th><th>Change</th></tr></thead><tbody>
          {plan.franchiseeUpdates.map((owner) => <tr key={owner.key}><td>{owner.name}</td><td>
            {owner.changes.map((change) => <div key={change.label} className="bu-change"><b>{change.label}:</b> <span className="bu-old">{change.before.join("; ") || "—"}</span>
              <Icon name="arrow-right" /> <span className="bu-new">{change.after.join("; ") || "—"}</span></div>)}
          </td></tr>)}
        </tbody></table></div>
      </>}

      <div className="bu-h">Rows in the file</div>
      {plan.rows.length ? <div className="bk-table bu-table"><table><thead><tr><th>Row</th><th>Store #</th><th>Owner / Franchisee</th><th>Result</th></tr></thead><tbody>
        {plan.rows.slice().sort((a, b) => (a.ok - b.ok) || (a.row - b.row)).map((row) => <tr key={row.row}>
          <td className="muted">{row.row}</td><td className="store">{row.num || "—"}</td><td>{row.owner || "—"}</td>
          <td>{row.ok ? <span className={row.transfer ? "bk-ok bu-transfer" : "bk-ok"}><Icon name={row.transfer ? "arrow-right-left" : "circle-check"} />{row.msg}</span>
            : <span className="bk-skip"><Icon name="circle-x" />Skipped: {row.msg}</span>}</td>
        </tr>)}
      </tbody></table></div> : <p className="muted">No data rows found in the file.</p>}
      {skipped.length > 0 && ready.length > 0 && <div className="help">Skipped rows are not saved. Fix them in the file and upload again, or update the ready rows now.</div>}
    </>}
  </Modal>;
}
