import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { CapStatusBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { errorTitle } from "../../lib/errors.js";
import { getContext, useDataContext } from "../../state/dataStore.js";
import { confirmAction } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { runCapsImport } from "./capsActions.js";
import { CAP_COLUMNS, downloadCapsList, downloadCapsTemplate, planCapsImport, readCapsFile } from "./capsImport.js";

const xlsxFailed = () => toast("Spreadsheet tool didn't load — check internet", "err");
const plural = (count, word) => `${count} ${word}${count !== 1 ? "s" : ""}`;

/** Add many stores to CAPs Monitoring from a spreadsheet, with a preview first. Existing stores are only updated when allowed. */
export default function CapsImportDialog() {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [failures, setFailures] = useState([]);
  const plan = useMemo(() => (parsed ? planCapsImport(ctx, parsed) : null), [ctx, parsed]);

  async function chooseFile(file) {
    setFileName(file.name);
    setParsed(null);
    setError("");
    setFailures([]);
    setOverwrite(false);
    try {
      const result = await readCapsFile(file);
      if (result.error) { setError(result.error); return; }
      setParsed(result);
      setBusy(true);
    } catch {
      xlsxFailed();
    }
  }

  async function save() {
    const current = planCapsImport(getContext(), parsed);
    setProgress({ done: 0, total: 1 });
    const result = await runCapsImport(current, overwrite, (done, total) => setProgress({ done, total }));
    setProgress(null);
    const summary = [result.added && `${plural(result.added, "store")} added`, result.updated && `${plural(result.updated, "store")} updated`].filter(Boolean).join(" · ") || "Nothing was changed";
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
    const parts = [plan.adds.length && `add ${plural(plan.adds.length, "store")}`, overwrite && plan.updates.length && `update ${plural(plan.updates.length, "existing store")}`].filter(Boolean);
    confirmAction({
      title: "Import into CAPs Monitoring?", okLabel: "Import", busyLabel: "Importing…", icon: "upload", okClass: "btn",
      text: `This will ${parts.join(" and ")}.${!overwrite && plan.updates.length ? ` ${plural(plan.updates.length, "store")} already in CAPs will be left unchanged.` : ""}`,
      onConfirm: save,
    });
  }

  const saving = !!progress;
  const count = plan ? plan.adds.length + (overwrite ? plan.updates.length : 0) : 0;
  const resultOf = (row) => {
    if (!row.ok) return <span className="bk-skip"><Icon name="circle-x" />Skipped: {row.msg}</span>;
    if (row.kind === "update" && row.changes.length && !overwrite) return <span className="cap-hold"><Icon name="lock" />{row.msg} — not updated unless you allow it</span>;
    return <span className={row.kind === "update" ? "bk-ok bu-transfer" : "bk-ok"}><Icon name={row.kind === "update" ? "refresh-cw" : "circle-check"} />{row.msg}</span>;
  };
  const ordered = plan ? plan.rows.slice().sort((a, b) => (a.ok - b.ok) || ((a.kind === "update") - (b.kind === "update")) || (a.row - b.row)) : [];

  return <Modal icon="upload" title="Import stores into CAPs Monitoring" subtitle="Upload a list of store numbers — franchisee, email and phone come from the store records" modalStyle={{ maxWidth: 960 }}
    onEscape={saving ? false : undefined}
    footer={<><button type="button" className="btn ghost" disabled={saving} onClick={close}>{failures.length ? "Close" : "Cancel"}</button>
      <button type="button" className="btn" disabled={!count || saving} onClick={askSave}><Icon name="upload" />
        <span>{saving ? `Importing… ${progress.done}/${progress.total}` : count ? `Import ${plural(count, "store")}` : "Import"}</span></button></>}>
    <div className="bk-steps bu-steps">
      <div className="bk-step"><h4><span className="n">1</span>Get the template</h4>
        <p>Only Store Number is needed. Franchisee, email and phone are filled in from the store records. Status is optional — blank means No Action Yet.</p>
        <div className="bk-cols">{CAP_COLUMNS.map((column) => <span key={column} className={column === "Store Number" ? "req" : ""}>{column}</span>)}</div>
        <div className="bu-btns">
          <button type="button" className="btn sm round" onClick={() => downloadCapsTemplate().catch(xlsxFailed)}><Icon name="file-spreadsheet" />Download template</button>
          {ctx.caps.length > 0 && <button type="button" className="btn sm outline round" onClick={() => downloadCapsList(ctx).catch(xlsxFailed)}><Icon name="download" />Current list</button>}
        </div>
      </div>
      <div className="bk-step"><h4><span className="n">2</span>Upload the filled file</h4>
        <p>Accepts .xlsx or .csv. Rows with problems are listed and skipped. Nothing is saved until you click Import.</p>
        <div className="bu-btns">
          <button type="button" className="btn sm round" disabled={saving} onClick={() => fileRef.current?.click()}><Icon name="upload" />Choose file</button>
        </div>
        <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" style={{ display: "none" }}
          onChange={(event) => { const file = event.target.files[0]; event.target.value = ""; if (file) chooseFile(file); }} />
        <div className="help">{fileName}</div>
      </div>
    </div>

    {error && <div className="warnbox show bu-error"><Icon name="circle-alert" /><div>{error}</div></div>}
    {failures.length > 0 && <div className="warnbox show bu-error"><Icon name="circle-alert" /><div>
      <b>Some rows were not saved.</b> Everything else was saved. Fix these and upload the file again:
      <ul>{failures.slice(0, 20).map((text) => <li key={text}>{text}</li>)}</ul>{failures.length > 20 && <>…and {failures.length - 20} more.</>}
    </div></div>}

    {plan && <>
      <div className="bk-sum">
        <div className={`s${plan.adds.length ? " ok" : ""}`}><b>{plan.adds.length}</b>New stores</div>
        <div className={`s${plan.updates.length ? " ok" : ""}`}><b>{plan.updates.length}</b>Already in CAPs, with changes</div>
        <div className="s"><b>{plan.unchanged.length}</b>Already in CAPs, no changes</div>
        <div className={`s${plan.skipped.length ? " bad" : ""}`}><b>{plan.skipped.length}</b>Rows skipped</div>
      </div>
      {plan.updates.length > 0 && <div className="warnbox show"><Icon name="triangle-alert" /><div>
        <b>{plural(plan.updates.length, "store")} already in CAPs Monitoring</b> {plan.updates.length === 1 ? "has" : "have"} a different status in the file. They are <b>not changed</b> unless you allow it.
        <label className="cap-overwrite"><input type="checkbox" checked={overwrite} disabled={saving} onChange={(event) => setOverwrite(event.target.checked)} />
          Update the status of stores already in CAPs (a blank Status keeps the saved one)</label>
        {overwrite && <div className="bk-table bu-table" style={{ marginTop: 8, maxHeight: 180 }}><table><thead><tr><th>Store</th><th>Change</th></tr></thead><tbody>
          {plan.updates.map((row) => <tr key={row.row}><td className="store">{row.num}</td><td>
            {row.changes.map((change) => <div key={change.label} className="bu-change"><b>{change.label}:</b> <span className="bu-old">{change.before}</span>
              <Icon name="arrow-right" /> <span className="bu-new">{change.after}</span></div>)}
          </td></tr>)}
        </tbody></table></div>}
      </div></div>}

      <div className="bu-h">Rows in the file</div>
      {plan.rows.length ? <div className="bk-table bu-table"><table><thead><tr><th>Row</th><th>Store #</th><th>Franchisee</th><th>Email</th><th>Phone</th><th>Status</th><th>Result</th></tr></thead><tbody>
        {ordered.map((row) => <tr key={row.row}>
          <td className="muted">{row.row}</td><td className="store">{row.num || "—"}</td>
          <td>{row.shown?.name || <span className="muted">—</span>}</td>
          <td>{row.shown?.email || <span className="muted">—</span>}</td>
          <td style={{ whiteSpace: "nowrap" }}>{row.shown?.phone || <span className="muted">—</span>}</td>
          <td>{row.shown ? <CapStatusBadge status={row.shown.status} /> : <span className="muted">—</span>}</td>
          <td>{resultOf(row)}</td>
        </tr>)}
      </tbody></table></div> : <p className="muted">No data rows found in the file.</p>}
      {plan.skipped.length > 0 && count > 0 && <div className="help">Skipped rows are not saved. Fix them in the file and upload again, or import the ready rows now.</div>}
    </>}
  </Modal>;
}
