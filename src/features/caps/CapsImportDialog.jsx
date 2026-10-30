import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { CapStatusBadge } from "../../components/ui/common.jsx";
import { formatDueDate } from "../../domain/caps.js";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { errorTitle } from "../../lib/errors.js";
import { getContext, useDataContext } from "../../state/dataStore.js";
import { confirmAction } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { runCapsImport } from "./capsActions.js";
import { CAP_COLUMNS, downloadCapsList, downloadCapsTemplate, planCapsImport, readCapsFile } from "./capsImport.js";

const xlsxFailed = () => toast("Spreadsheet tool didn't load — check internet", "err");
const plural = (count, word) => `${count} ${word}${count !== 1 ? "s" : ""}`;

/** Result of the store check for one row: new, already in CAPs, not in the database, or another problem. */
function CheckTag({ row }) {
  if (row.reason === "notFound") return <span className="cap-tag bad"><Icon name="circle-x" />Not in database</span>;
  if (!row.ok) return <span className="cap-tag bad"><Icon name="circle-alert" />Problem</span>;
  if (row.kind === "update") return <span className="cap-tag warn"><Icon name="copy" />Already added</span>;
  return <span className="cap-tag ok"><Icon name="circle-check" />New</span>;
}

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
      const checked = planCapsImport(getContext(), result);
      const notes = [checked.existing.length && `${plural(checked.existing.length, "store")} already in CAPs`, checked.notFound.length && `${plural(checked.notFound.length, "store")} not in the database`].filter(Boolean);
      if (notes.length) toast(`Checked: ${notes.join(" · ")} — see the preview`, checked.notFound.length ? "err" : "ok");
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
        <p>Only Store Number is needed. Franchisee, email and phone are filled in from the store records. Status (blank = No Action Yet) and Due Date are optional.</p>
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
        <div className={`s${plan.adds.length ? " ok" : ""}`}><b>{plan.adds.length}</b>New stores to add</div>
        <div className={`s${plan.existing.length ? " warn" : ""}`}><b>{plan.existing.length}</b>Already in CAPs</div>
        <div className={`s${plan.notFound.length ? " bad" : ""}`}><b>{plan.notFound.length}</b>Not in database</div>
        <div className={`s${plan.problems.length ? " bad" : ""}`}><b>{plan.problems.length}</b>Other problems</div>
      </div>

      {plan.notFound.length > 0 && <div className="warnbox show cap-check bad"><Icon name="circle-x" /><div>
        <b>{plural(plan.notFound.length, "store")} {plan.notFound.length === 1 ? "is" : "are"} not in the database</b> and will be skipped. Check the store number, or add the store in All Stores first.
        <div className="cap-nums">{plan.notFound.slice(0, 40).map((row) => <span key={row.row}>{row.num}</span>)}{plan.notFound.length > 40 && <em>+{plan.notFound.length - 40} more</em>}</div>
      </div></div>}

      {plan.existing.length > 0 && <div className="warnbox show cap-check"><Icon name="triangle-alert" /><div>
        <b>{plural(plan.existing.length, "store")} {plan.existing.length === 1 ? "is" : "are"} already in CAPs Monitoring</b> and won't be added again.
        <div className="cap-nums">{plan.existing.slice(0, 40).map((row) => <span key={row.row}>{row.num}</span>)}{plan.existing.length > 40 && <em>+{plan.existing.length - 40} more</em>}</div>
        {plan.updates.length > 0 && <>
          <div style={{ marginTop: 8 }}>{plural(plan.updates.length, "of them")} {plan.updates.length === 1 ? "has" : "have"} a different status or due date in the file. They are <b>not changed</b> unless you allow it.</div>
          <label className="cap-overwrite"><input type="checkbox" checked={overwrite} disabled={saving} onChange={(event) => setOverwrite(event.target.checked)} />
            Update stores already in CAPs (blank Status or Due Date keeps the saved one)</label>
          {overwrite && <div className="bk-table bu-table" style={{ marginTop: 8, maxHeight: 180 }}><table><thead><tr><th>Store</th><th>Change</th></tr></thead><tbody>
            {plan.updates.map((row) => <tr key={row.row}><td className="store">{row.num}</td><td>
              {row.changes.map((change) => <div key={change.label} className="bu-change"><b>{change.label}:</b> <span className="bu-old">{change.before}</span>
                <Icon name="arrow-right" /> <span className="bu-new">{change.after}</span></div>)}
            </td></tr>)}
          </tbody></table></div>}
        </>}
      </div></div>}

      <div className="bu-h">Rows in the file</div>
      {plan.rows.length ? <div className="bk-table bu-table"><table><thead><tr><th>Row</th><th>Store #</th><th>Check</th><th>From store records</th><th>Status</th>{ctx.capsDueReady && <th>Due Date</th>}<th>Result</th></tr></thead><tbody>
        {ordered.map((row) => <tr key={row.row}>
          <td className="muted">{row.row}</td><td className="store">{row.num || "—"}</td>
          <td><CheckTag row={row} /></td>
          <td className="cap-imp-contact">{row.shown ? <><b>{row.shown.name || "—"}</b>
            <span className="muted">{[row.shown.email, row.shown.phone].filter(Boolean).join(" · ") || "No email or phone saved"}</span></> : <span className="muted">—</span>}</td>
          <td>{row.shown ? <CapStatusBadge status={row.shown.status} /> : <span className="muted">—</span>}</td>
          {ctx.capsDueReady && <td style={{ whiteSpace: "nowrap" }}>{row.shown?.due ? formatDueDate(row.shown.due) : <span className="muted">—</span>}</td>}
          <td>{resultOf(row)}</td>
        </tr>)}
      </tbody></table></div> : <p className="muted">No data rows found in the file.</p>}
      {plan.skipped.length > 0 && count > 0 && <div className="help">Skipped rows are not saved. Fix them in the file and upload again, or import the ready rows now.</div>}
    </>}
  </Modal>;
}
