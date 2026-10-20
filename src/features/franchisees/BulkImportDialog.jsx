import { useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { errorTitle } from "../../lib/errors.js";
import { loadAll } from "../../state/appActions.js";
import { getContext } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import { BULK_COLUMNS, BULK_REQUIRED, downloadBulkTemplate, planBulkImport, readBulkFile, runBulkImport } from "./bulkImport.js";

const xlsxFailed = () => toast("Spreadsheet tool didn't load — check internet", "err");

export default function BulkImportDialog() {
  const { close, setBusy } = useDialog();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  async function chooseFile(file) {
    setFileName(file.name);
    setPlan(null);
    setError("");
    try {
      const result = await readBulkFile(file);
      if (result.error) { setError(result.error); return; }
      setPlan(planBulkImport(getContext(), result.rows));
      setBusy(true);
    } catch {
      xlsxFailed();
    }
  }

  async function runImport() {
    if (!plan) return;
    setImporting(true);
    const result = await runBulkImport(plan);
    setImporting(false);
    if (result.error) {
      const partial = result.franchisees || result.stores ? ` — ${result.franchisees} franchisees, ${result.stores} stores were added before the stop` : "";
      toast(`${errorTitle(result.error)}${partial}`, "err");
    } else {
      close();
      toast(`Added ${result.franchisees} franchisee${result.franchisees !== 1 ? "s" : ""} and ${result.stores} store${result.stores !== 1 ? "s" : ""}`, "ok");
    }
    await loadAll();
  }

  const ready = plan ? plan.rows.filter((row) => row.ok) : [];
  const skipped = plan ? plan.rows.filter((row) => !row.ok) : [];
  const usedExisting = new Set(ready.filter((row) => !row.isNew).map((row) => row.franchiseeId)).size;

  return <Modal icon="file-spreadsheet" title={<>Bulk add franchisees &amp; stores</>} subtitle="Upload a spreadsheet using the template" modalStyle={{ maxWidth: 860 }}
    footer={<><button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="button" className="btn" disabled={!ready.length || importing} onClick={runImport}><Icon name="database" />
        <span>{importing ? "Importing…" : ready.length ? `Import ${ready.length} row${ready.length > 1 ? "s" : ""}` : "Import"}</span></button></>}>
    <div className="bk-steps">
      <div className="bk-step"><h4><span className="n">1</span>Download the template</h4>
        <p>One row = one store. Leave Store Number blank to add a franchisee only. Don't rename or move the columns.</p>
        <div className="bk-cols">{BULK_COLUMNS.map((column) => <span key={column} className={BULK_REQUIRED.includes(column) ? "req" : ""}>{column}{BULK_REQUIRED.includes(column) ? " *" : ""}</span>)}</div>
        <button type="button" className="btn sm outline round" onClick={() => downloadBulkTemplate().catch(xlsxFailed)}><Icon name="download" />Download template</button>
      </div>
      <div className="bk-step"><h4><span className="n">2</span>Upload your filled file</h4>
        <p>Accepts .xlsx or .csv. You'll see a preview first — nothing is saved until you click Import.</p>
        <button type="button" className="btn sm round" onClick={() => fileRef.current?.click()}><Icon name="upload" />Choose file</button>
        <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" style={{ display: "none" }}
          onChange={(event) => { const file = event.target.files[0]; event.target.value = ""; if (file) chooseFile(file); }} />
        <div className="help">{fileName}</div>
      </div>
    </div>
    {error && <div className="warnbox show" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}><Icon name="circle-alert" /><div>{error}</div></div>}
    {plan && <>
      <div className="bk-sum">
        <div className="s ok"><b>{plan.newFranchisees.size}</b>New franchisees</div>
        <div className="s ok"><b>{ready.filter((row) => row.store).length}</b>New stores</div>
        <div className="s"><b>{usedExisting}</b>Existing franchisees used</div>
        <div className={`s${skipped.length ? " bad" : ""}`}><b>{skipped.length}</b>Rows skipped</div>
      </div>
      {plan.rows.length ? <div className="bk-table"><table><thead><tr><th>Row</th><th>Franchisee</th><th>Store #</th><th>Result</th></tr></thead><tbody>
        {plan.rows.slice().sort((a, b) => (a.ok - b.ok) || (a.row - b.row)).map((row) => <tr key={row.row}>
          <td className="muted">{row.row}</td><td>{row.name || "—"}</td><td className="store">{row.num || "—"}</td>
          <td>{row.ok ? <span className="bk-ok"><Icon name="circle-check" />{row.msg}</span> : <span className="bk-skip"><Icon name="circle-x" />Skipped: {row.msg}</span>}</td>
        </tr>)}
      </tbody></table></div> : <p className="muted">No data rows found in the file.</p>}
      {skipped.length > 0 && ready.length > 0 && <div className="help">Skipped rows are not imported. Fix them in the file and upload again, or import the ready rows now.</div>}
    </>}
  </Modal>;
}
