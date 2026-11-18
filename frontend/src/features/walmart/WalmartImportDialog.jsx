import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { WM_STAGES } from "../../config/constants.js";
import { WmStageBadge } from "../../components/ui/common.jsx";
import { errorTitle } from "../../lib/errors.js";
import { formatNumber } from "../../lib/format.js";
import { downloadBackup } from "../../state/appActions.js";
import { getContext, useDataContext } from "../../state/dataStore.js";
import { confirmAction } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { runWalmartImport } from "./walmartActions.js";
import { WM_COLUMNS, planCount, planWalmartImport, readWalmartFile } from "./walmartImport.js";

const xlsxFailed = () => toast("Spreadsheet tool didn't load — check internet", "err");
const plural = (count, word) => `${count} ${word}${count !== 1 ? "s" : ""}`;

/** Store numbers in a box, up to 40. */
const StoreNums = ({ items }) => <div className="cap-nums">{items.slice(0, 40).map((item) => <span key={item.num}>{item.num}</span>)}{items.length > 40 && <em>+{items.length - 40} more</em>}</div>;

/** Result of one row: new, stage change, unchanged or skipped, plus the store status change and owner warnings. */
function RowResult({ row }) {
  if (!row.ok) return <span className="bk-skip"><Icon name="circle-x" />Skipped: {row.msg}</span>;
  return <div className="wm-res">
    {row.kind === "new" ? <span className="bk-ok"><Icon name="circle-check" />New · <WmStageBadge stage={row.stage} /></span>
      : row.kind === "change" ? <span className="bk-ok bu-transfer"><Icon name="arrow-right-left" /><WmStageBadge stage={row.before} /><Icon name="arrow-right" /><WmStageBadge stage={row.stage} /></span>
        : <span className="muted"><Icon name="check" />Already {row.stage}</span>}
    {row.storeBefore !== row.storeAfter && <span className="wm-sync">Store's Walmart status: {row.storeBefore} → <b>{row.storeAfter}</b></span>}
    {row.warnings.map((text) => <span key={text} className="wm-warn"><Icon name="triangle-alert" />{text}</span>)}
  </div>;
}

/** Import Walmart's report: only Marwaha rows, with a preview of every change first. The imported stage wins. */
export default function WalmartImportDialog() {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [failures, setFailures] = useState([]);
  const plan = useMemo(() => (parsed ? planWalmartImport(ctx, parsed) : null), [ctx, parsed]);

  async function chooseFile(file) {
    setFileName(file.name);
    setParsed(null);
    setError("");
    setFailures([]);
    try {
      const result = await readWalmartFile(file);
      if (result.error) { setError(result.error); return; }
      const checked = planWalmartImport(getContext(), result);
      if (!checked.rows.length) { setError(`No Marwaha rows found in ${file.name} — check that the DFP/BD column says "Marwaha".`); return; }
      setParsed(result);
      setBusy(true);
    } catch {
      xlsxFailed();
    }
  }

  async function save() {
    const current = planWalmartImport(getContext(), parsed);
    setProgress({ done: 0, total: 1 });
    const result = await runWalmartImport(current, (done, total) => setProgress({ done, total }));
    setProgress(null);
    const summary = [result.added && `${plural(result.added, "store")} added`, result.changed && `${plural(result.changed, "stage")} changed`,
      result.synced && `${plural(result.synced, "store")}' Walmart status updated`].filter(Boolean).join(" · ") || "Nothing was changed";
    if (result.error || result.failures.length) {
      setFailures([...(result.error ? [`Stopped: ${errorTitle(result.error)}`] : []), ...result.failures]);
      setParsed(null);
      toast(`${summary} — some rows failed, see the list`, "err");
      return;
    }
    close();
    toast(summary, "ok");
  }

  function askSave() {
    const sameSync = plan.storeSync.filter((row) => row.kind === "same").length;
    const parts = [plan.adds.length && `add ${plural(plan.adds.length, "store")}`, plan.changes.length && `change the stage of ${plural(plan.changes.length, "store")}`,
      plan.storeSync.length && `set the Walmart status of ${plural(plan.storeSync.length, "store")} to match${sameSync ? "" : " the new stage"}`].filter(Boolean);
    const last = parts.pop();
    confirmAction({
      title: "Import into the Walmart tab?", okLabel: "Import", busyLabel: "Importing…", icon: "upload", okClass: "btn",
      text: `This will ${parts.length ? `${parts.join(", ")} and ${last}` : last}. The imported stage replaces what is saved.`,
      onConfirm: save,
    });
  }

  const saving = !!progress;
  const count = plan ? planCount(plan) : 0;
  const ordered = plan ? plan.rows.slice().sort((a, b) => (a.ok - b.ok) || ((a.kind === "same") - (b.kind === "same")) || (b.warnings.length - a.warnings.length) || (a.row - b.row)) : [];
  const stageCounts = plan ? WM_STAGES.map((stage) => [stage, plan.rows.filter((row) => row.ok && row.stage === stage).length]) : [];

  return <Modal icon="upload" title="Import Walmart report" subtitle="Only Marwaha rows are read · Restaurant # = Store # · Primary Owner Name = Franchisee" modalStyle={{ maxWidth: 960 }}
    onEscape={saving ? false : undefined}
    footer={<><button type="button" className="btn ghost" disabled={saving} onClick={close}>{failures.length ? "Close" : "Cancel"}</button>
      <button type="button" className="btn" disabled={!count || saving} onClick={askSave}><Icon name="upload" />
        <span>{saving ? `Importing… ${progress.done}/${progress.total}` : count ? `Import ${plural(count, "change")}` : "Import"}</span></button></>}>
    <div className="bk-steps bu-steps">
      <div className="bk-step"><h4><span className="n">1</span>Use Walmart's report as it is</h4>
        <p>Only these columns are read — everything else (MFP, emails, address…) is ignored. Rows whose DFP/BD isn't <b>Marwaha</b> are skipped.</p>
        <div className="bk-cols">{WM_COLUMNS.map((column) => <span key={column} className="req">{column}</span>)}</div>
        <p style={{ marginBottom: 0 }}>Stages: {WM_STAGES.join(" · ")}. <b>The imported stage wins</b> — it replaces the saved stage and the store's Walmart status.</p>
      </div>
      <div className="bk-step"><h4><span className="n">2</span>Upload the file</h4>
        <p>Accepts .xlsx or .csv. You'll see every change before anything is saved.</p>
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
      <b>Some changes were not saved.</b> Everything else was saved. Fix these and import again:
      <ul>{failures.slice(0, 20).map((text) => <li key={text}>{text}</li>)}</ul>{failures.length > 20 && <>…and {failures.length - 20} more.</>}
    </div></div>}

    {plan && <>
      <div className="help wm-read">Read {formatNumber(plan.total)} rows · <b>{formatNumber(plan.rows.length)} Marwaha</b>{plan.others ? ` · ${formatNumber(plan.others)} from other DFP/BD groups ignored` : ""}
        {" · "}{stageCounts.map(([stage, n]) => `${stage} ${n}`).join(" · ")}</div>
      <div className="bk-sum">
        <div className={`s${plan.adds.length ? " ok" : ""}`}><b>{plan.adds.length}</b>New stores</div>
        <div className={`s${plan.changes.length ? " ok" : ""}`}><b>{plan.changes.length}</b>Stage changes</div>
        <div className="s"><b>{plan.same.length}</b>Unchanged</div>
        <div className={`s${plan.storeSync.length ? " ok" : ""}`}><b>{plan.storeSync.length}</b>Store statuses updated</div>
        <div className={`s${plan.warned.length ? " warn" : ""}`}><b>{plan.warned.length}</b>Owner warnings</div>
        <div className={`s${plan.skipped.length ? " bad" : ""}`}><b>{plan.skipped.length}</b>Rows skipped</div>
      </div>

      {plan.notInFile.length > 0 && <div className="warnbox show"><Icon name="info" /><div>
        <b>{plural(plan.notInFile.length, "store")} on the Walmart tab {plan.notInFile.length === 1 ? "is" : "are"} not in this file.</b> {plan.notInFile.length === 1 ? "It stays" : "They stay"} on the tab with {plan.notInFile.length === 1 ? "its" : "their"} current stage.
        <StoreNums items={plan.notInFile} /></div></div>}

      <div className="bu-h">Marwaha rows</div>
      <div className="bk-table bu-table wm-table"><table><thead><tr><th>Row</th><th>Store #</th><th>Franchisee</th><th>Result</th></tr></thead><tbody>
        {ordered.map((row) => <tr key={row.row}>
          <td className="muted">{row.row}</td><td className="store">{row.num || "—"}</td>
          <td>{row.franchisee || row.owner || "—"}</td>
          <td><RowResult row={row} /></td>
        </tr>)}
      </tbody></table></div>
      {plan.skipped.length > 0 && count > 0 && <div className="help">Skipped rows are not saved. Fix them in the report and import again, or import the ready rows now.</div>}
    </>}
  </Modal>;
}
