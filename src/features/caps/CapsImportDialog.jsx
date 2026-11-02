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
import { CAP_COLUMNS, FILE_STATUS_LABELS, downloadCapsList, downloadCapsTemplate, planCapsImport, readCapsFile } from "./capsImport.js";

const xlsxFailed = () => toast("Spreadsheet tool didn't load — check internet", "err");
const plural = (count, word) => `${count} ${word}${count !== 1 ? "s" : ""}`;

/** Result of the store check for one row: new, to complete, already in the list, not in the database or the list, or another problem. */
function CheckTag({ row }) {
  if (row.reason === "notFound") return <span className="cap-tag bad"><Icon name="circle-x" />Not in database</span>;
  if (row.reason === "notInList") return <span className="cap-tag bad"><Icon name="circle-x" />Not in CAP list</span>;
  if (!row.ok) return <span className="cap-tag bad"><Icon name="circle-alert" />Problem</span>;
  if (row.kind === "close") return row.changes.length ? <span className="cap-tag ok"><Icon name="badge-check" />To complete</span>
    : <span className="cap-tag warn"><Icon name="check" />Already completed</span>;
  if (row.kind === "update") return <span className="cap-tag warn"><Icon name="copy" />Already added</span>;
  return <span className="cap-tag ok"><Icon name="circle-check" />New</span>;
}

/** Store numbers in a check box, up to 40. */
const StoreNums = ({ rows }) => <div className="cap-nums">{rows.slice(0, 40).map((row) => <span key={row.row}>{row.num}</span>)}{rows.length > 40 && <em>+{rows.length - 40} more</em>}</div>;

/**
 * Import stores into the CAP list from a spreadsheet, with a preview first.
 * Not Started rows add new stores; Closed rows mark stores in the list Completed. Due dates of existing stores only change when allowed.
 */
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
      const notes = [checked.closes.length && `${plural(checked.closes.length, "store")} to mark Completed`, checked.existing.length && `${plural(checked.existing.length, "store")} already in the CAP list`,
        checked.notFound.length && `${plural(checked.notFound.length, "store")} not in the database`, checked.notInList.length && `${plural(checked.notInList.length, "Closed store")} not in the CAP list`].filter(Boolean);
      if (notes.length) toast(`Checked: ${notes.join(" · ")} — see the preview`, checked.notFound.length || checked.notInList.length ? "err" : "ok");
    } catch {
      xlsxFailed();
    }
  }

  async function save() {
    const current = planCapsImport(getContext(), parsed);
    setProgress({ done: 0, total: 1 });
    const result = await runCapsImport(current, overwrite, (done, total) => setProgress({ done, total }), fileName);
    setProgress(null);
    const summary = [result.added && `${plural(result.added, "store")} added`, result.completed && `${plural(result.completed, "store")} marked Completed`,
      result.updated && `${plural(result.updated, "due date")} updated`].filter(Boolean).join(" · ") || "Nothing was changed";
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
    const parts = [plan.adds.length && `add ${plural(plan.adds.length, "store")}`, plan.closes.length && `mark ${plural(plan.closes.length, "store")} Completed`,
      overwrite && plan.updates.length && `update the due date of ${plural(plan.updates.length, "existing store")}`].filter(Boolean);
    const last = parts.pop();
    confirmAction({
      title: "Import into the CAP list?", okLabel: "Import", busyLabel: "Importing…", icon: "upload", okClass: "btn",
      text: `This will ${parts.length ? `${parts.join(", ")} and ${last}` : last}.${plan.existing.length ? ` ${plural(plan.existing.length, "Not Started store")} already in the CAP list will not be added again.` : ""}`,
      onConfirm: save,
    });
  }

  const saving = !!progress;
  const count = plan ? plan.adds.length + plan.closes.length + (overwrite ? plan.updates.length : 0) : 0;
  const resultOf = (row) => {
    if (!row.ok) return <span className="bk-skip"><Icon name="circle-x" />Skipped: {row.msg}</span>;
    if (row.kind === "update" && row.changes.length && !overwrite) return <span className="cap-hold"><Icon name="lock" />{row.msg} — not updated unless you allow it</span>;
    if (row.kind === "update" || (row.kind === "close" && !row.changes.length)) return <span className="muted"><Icon name="check" />{row.msg}</span>;
    return <span className={row.kind === "close" ? "bk-ok bu-transfer" : "bk-ok"}><Icon name={row.kind === "close" ? "badge-check" : "circle-check"} />{row.msg}</span>;
  };
  const ordered = plan ? plan.rows.slice().sort((a, b) => (a.ok - b.ok) || ((a.kind === "update") - (b.kind === "update")) || (a.row - b.row)) : [];

  return <Modal icon="upload" title="Import stores into the CAP list" subtitle="Upload store numbers with a status — franchisee, email and phone come from the store records" modalStyle={{ maxWidth: 960 }}
    onEscape={saving ? false : undefined}
    footer={<><button type="button" className="btn ghost" disabled={saving} onClick={close}>{failures.length ? "Close" : "Cancel"}</button>
      <button type="button" className="btn" disabled={!count || saving} onClick={askSave}><Icon name="upload" />
        <span>{saving ? `Importing… ${progress.done}/${progress.total}` : count ? `Import ${plural(count, "store")}` : "Import"}</span></button></>}>
    <div className="bk-steps bu-steps">
      <div className="bk-step"><h4><span className="n">1</span>Get the template</h4>
        <p>Fill in Store Number and Status. <b>Not Started</b> adds the store at No Action Yet if it is not in the CAP list yet (stores already in the list are left as they are).
          <b> Closed</b> marks a store already in the list <b>Completed</b>. A blank Status counts as Not Started. Due Date is optional.</p>
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
        <div className={`s${plan.closes.length ? " ok" : ""}`}><b>{plan.closes.length}</b>To mark Completed</div>
        <div className={`s${plan.existing.length + plan.alreadyDone.length ? " warn" : ""}`}><b>{plan.existing.length + plan.alreadyDone.length}</b>Already in list · no change</div>
        <div className={`s${plan.notFound.length ? " bad" : ""}`}><b>{plan.notFound.length}</b>Not in database</div>
        <div className={`s${plan.notInList.length ? " bad" : ""}`}><b>{plan.notInList.length}</b>Closed · not in CAP list</div>
        <div className={`s${plan.problems.length ? " bad" : ""}`}><b>{plan.problems.length}</b>Other problems</div>
      </div>

      {plan.notFound.length > 0 && <div className="warnbox show cap-check bad"><Icon name="circle-x" /><div>
        <b>{plural(plan.notFound.length, "store")} {plan.notFound.length === 1 ? "is" : "are"} not in the database</b> and will be skipped. Check the store number, or add the store in All Stores first.
        <StoreNums rows={plan.notFound} />
      </div></div>}

      {plan.notInList.length > 0 && <div className="warnbox show cap-check bad"><Icon name="circle-x" /><div>
        <b>{plural(plan.notInList.length, "store")} marked Closed {plan.notInList.length === 1 ? "is" : "are"} not in the CAP list</b>, so there is nothing to complete. They will be skipped.
        <StoreNums rows={plan.notInList} />
      </div></div>}

      {plan.closes.length > 0 && <div className="warnbox show cap-check ok"><Icon name="badge-check" /><div>
        <b>{plural(plan.closes.length, "store")} will be marked Completed</b> — Closed in the file and still open in the CAP list.
        <StoreNums rows={plan.closes} />
      </div></div>}

      {plan.existing.length > 0 && <div className="warnbox show cap-check"><Icon name="triangle-alert" /><div>
        <b>{plural(plan.existing.length, "Not Started store")} {plan.existing.length === 1 ? "is" : "are"} already in the CAP list</b> and won't be added again. Their status is kept.
        <StoreNums rows={plan.existing} />
        {plan.updates.length > 0 && <>
          <div style={{ marginTop: 8 }}>{plural(plan.updates.length, "of them")} {plan.updates.length === 1 ? "has" : "have"} a different due date in the file. They are <b>not changed</b> unless you allow it.</div>
          <label className="cap-overwrite"><input type="checkbox" checked={overwrite} disabled={saving} onChange={(event) => setOverwrite(event.target.checked)} />
            Update the due date of stores already in the CAP list (their status is kept; a blank Due Date keeps the saved one)</label>
          {overwrite && <div className="bk-table bu-table" style={{ marginTop: 8, maxHeight: 180 }}><table><thead><tr><th>Store</th><th>Change</th></tr></thead><tbody>
            {plan.updates.map((row) => <tr key={row.row}><td className="store">{row.num}</td><td>
              {row.changes.map((change) => <div key={change.label} className="bu-change"><b>{change.label}:</b> <span className="bu-old">{change.before}</span>
                <Icon name="arrow-right" /> <span className="bu-new">{change.after}</span></div>)}
            </td></tr>)}
          </tbody></table></div>}
        </>}
      </div></div>}

      <div className="bu-h">Rows in the file</div>
      {plan.rows.length ? <div className="bk-table bu-table"><table><thead><tr><th>Row</th><th>Store #</th><th>File Status</th><th>Check</th><th>From store records</th><th>Status</th>{ctx.capsDueReady && <th>Due Date</th>}<th>Result</th></tr></thead><tbody>
        {ordered.map((row) => <tr key={row.row}>
          <td className="muted">{row.row}</td><td className="store">{row.num || "—"}</td>
          <td style={{ whiteSpace: "nowrap" }}>{row.fileStatus ? FILE_STATUS_LABELS[row.fileStatus] : <span className="muted">—</span>}</td>
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
