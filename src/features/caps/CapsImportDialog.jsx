import { useEffect, useMemo, useRef, useState } from "react";
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
import { CAP_COLUMNS, FILE_STATUS_LABELS, approvedPlan, downloadCapsList, downloadCapsTemplate, planCapsImport, readCapsFile } from "./capsImport.js";

const xlsxFailed = () => toast("Spreadsheet tool didn't load — check internet", "err");
const plural = (count, word, many = `${word}s`) => `${count} ${count !== 1 ? many : word}`;

/** Result of the store check for one row: new, already in the list (with or without changes), not in the database or the list, or another problem. */
function CheckTag({ row, approved }) {
  if (row.needsApproval && !approved) return <span className="cap-tag warn"><Icon name="user-round" />Check franchisee</span>;
  if (row.reason === "notFound") return <span className="cap-tag bad"><Icon name="circle-x" />Not in database</span>;
  if (row.reason === "aidTaken" || row.reason === "aidDiffers" || row.reason === "repeatAid") return <span className="cap-tag bad"><Icon name="clipboard-list" />Assessment ID conflict</span>;
  if (!row.ok) return <span className="cap-tag bad"><Icon name="circle-alert" />Problem</span>;
  if (row.kind === "existing") return row.changes.length ? <span className="cap-tag ok"><Icon name="refresh-cw" />To update</span>
    : <span className="cap-tag warn"><Icon name="copy" />Already added</span>;
  return <span className="cap-tag ok"><Icon name="circle-check" />New</span>;
}

/** "Status: In Progress → Completed" lines. */
const ChangeList = ({ changes }) => changes.map((change) => <div key={change.field} className="bu-change"><b>{change.label}:</b> <span className="bu-old">{change.before}</span>
  <Icon name="arrow-right" /> <span className="bu-new">{change.after}</span></div>);

/** Select-all box: checked, unchecked or partly checked. */
function SelectAll({ checked, partly, onChange, disabled, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = partly; }, [partly]);
  return <label className="cap-frall"><input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

/**
 * Rows whose Franchisee in the file is blank or doesn't match our records. Each one is imported only once approved,
 * one by one or with Select all.
 */
function FranchiseeCheck({ rows, approved, setApproved, disabled }) {
  const done = rows.filter((row) => approved.has(row.row)).length;
  const toggle = (rowNumber, on) => setApproved((current) => {
    const next = new Set(current);
    if (on) next.add(rowNumber); else next.delete(rowNumber);
    return next;
  });
  const setAll = (on) => setApproved((current) => {
    const next = new Set(current);
    rows.forEach((row) => (on ? next.add(row.row) : next.delete(row.row)));
    return next;
  });
  return <div className="warnbox show cap-check cap-frcheck"><Icon name="user-round" /><div>
    <b>{rows.length === 1 ? "1 row needs" : `${rows.length} rows need`} a franchisee check</b> — the Franchisee in the file is blank or doesn't match our records for that store number.
    {" "}They are <b>not imported</b> unless you approve them. Check each one is the right store, then approve it.
    <div className="cap-frbar">
      <SelectAll checked={done === rows.length} partly={done > 0 && done < rows.length} disabled={disabled} onChange={setAll}
        label={done === rows.length ? "All approved" : `Select all (${rows.length})`} />
      <span className="muted" role="status">{done} of {rows.length} approved</span>
    </div>
    <div className="bk-table bu-table" style={{ marginTop: 8, maxHeight: 260 }}><table><thead><tr>
      <th className="cap-frcol">Approve</th><th>Row</th><th>Store #</th><th>Franchisee in the file</th><th>Franchisee in our records</th><th>Will do</th>
    </tr></thead><tbody>
      {rows.map((row) => {
        const on = approved.has(row.row);
        return <tr key={row.row} className={on ? "cap-frok" : ""}>
          <td className="cap-frcol"><input type="checkbox" checked={on} disabled={disabled} onChange={(event) => toggle(row.row, event.target.checked)}
            aria-label={`Approve row ${row.row}, store ${row.num}`} /></td>
          <td className="muted">{row.row}</td><td className="store">{row.num}</td>
          <td>{row.frFile ? <span className="bu-old">{row.frFile}</span> : <span className="muted">(blank)</span>}</td>
          <td>{row.frRecord ? <b>{row.frRecord}</b> : <span className="muted">No franchisee on file</span>}</td>
          <td className="muted">{row.msg}</td>
        </tr>;
      })}
    </tbody></table></div>
  </div></div>;
}

/** Store numbers in a check box, up to 40. */
const StoreNums = ({ rows }) => <div className="cap-nums">{rows.slice(0, 40).map((row) => <span key={row.row}>{row.num}</span>)}{rows.length > 40 && <em>+{rows.length - 40} more</em>}</div>;

/**
 * Import stores into the CAP list from a spreadsheet, with a preview first.
 * A store is already in the list when its Assessment ID or store number is. Not Started / In Progress / In Review rows add new stores;
 * Closed rows add the store at Completed. In Progress / In Review / Closed rows change the status of stores in the list. Due dates of existing stores only change when allowed.
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
  /** Row numbers approved in the franchisee check. */
  const [approved, setApproved] = useState(() => new Set());
  const plan = useMemo(() => (parsed ? planCapsImport(ctx, parsed) : null), [ctx, parsed]);
  /** The plan without rows still waiting for approval: what Import saves. */
  const ready = useMemo(() => (plan ? approvedPlan(plan, approved) : null), [plan, approved]);

  async function chooseFile(file) {
    setFileName(file.name);
    setParsed(null);
    setError("");
    setFailures([]);
    setOverwrite(false);
    setApproved(new Set());
    try {
      const result = await readCapsFile(file);
      if (result.error) { setError(result.error); return; }
      setParsed(result);
      setBusy(true);
      const checked = planCapsImport(getContext(), result);
      const notes = [checked.changed.length && `${plural(checked.changed.length, "store")} to update`, checked.existing.length && `${plural(checked.existing.length, "store")} already in the CAP list`,
        checked.notFound.length && `${plural(checked.notFound.length, "store")} not in the database`,
        checked.aidConflicts.length && `${plural(checked.aidConflicts.length, "Assessment ID conflict")}`,
        checked.frFlags.length && `${plural(checked.frFlags.length, "franchisee")} to check`].filter(Boolean);
      const bad = checked.notFound.length || checked.aidConflicts.length || checked.frFlags.length;
      if (notes.length) toast(`Checked: ${notes.join(" · ")} — see the preview`, bad ? "err" : "ok");
    } catch {
      xlsxFailed();
    }
  }

  async function save() {
    const current = approvedPlan(planCapsImport(getContext(), parsed), approved);
    setProgress({ done: 0, total: 1 });
    const result = await runCapsImport(current, overwrite, (done, total) => setProgress({ done, total }), fileName);
    setProgress(null);
    const summary = [result.added && `${plural(result.added, "store")} added`, result.completed && `${plural(result.completed, "store")} marked Completed`,
      result.statusChanged && `${plural(result.statusChanged, "status", "statuses")} changed`, result.assessed && `${plural(result.assessed, "Assessment ID")} added`,
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
    const plan = ready;
    const parts = [plan.adds.length && `add ${plural(plan.adds.length, "store")}`, plan.closes.length && `mark ${plural(plan.closes.length, "store")} Completed`,
      plan.statusChanges.length && `change the status of ${plural(plan.statusChanges.length, "store")} to In Progress or In Review`,
      plan.assessmentFills.length && `add ${plural(plan.assessmentFills.length, "missing Assessment ID")}`,
      overwrite && plan.updates.length && `update the due date of ${plural(plan.updates.length, "existing store")}`].filter(Boolean);
    const last = parts.pop();
    confirmAction({
      title: "Import into the CAP list?", okLabel: "Import", busyLabel: "Importing…", icon: "upload", okClass: "btn",
      text: `This will ${parts.length ? `${parts.join(", ")} and ${last}` : last}.${plan.existing.length ? ` ${plural(plan.existing.length, "store")} already in the CAP list will not be added again.` : ""}${plan.waiting.length ? ` ${plural(plan.waiting.length, "row")} not approved in the franchisee check will be skipped.` : ""}`,
      onConfirm: save,
    });
  }

  const saving = !!progress;
  const count = ready ? ready.adds.length + ready.existing.filter((row) => row.changes.length || (overwrite && row.dueChange)).length : 0;
  const resultOf = (row) => {
    if (!row.ok) return <span className="bk-skip"><Icon name="circle-x" />Skipped: {row.msg}</span>;
    if (row.needsApproval && !approved.has(row.row)) return <span className="cap-hold"><Icon name="lock" />Waiting for franchisee approval — not imported unless approved</span>;
    const held = row.dueChange && !overwrite ? <span className="cap-hold"><Icon name="lock" />Due date not updated unless you allow it</span> : null;
    if (row.kind === "existing" && !row.changes.length) return <><span className="muted"><Icon name="check" />{row.msg}</span>{held && <div>{held}</div>}</>;
    return <><span className={row.kind === "existing" ? "bk-ok bu-transfer" : "bk-ok"}><Icon name={row.kind === "existing" ? "refresh-cw" : "circle-check"} />{row.msg}</span>{held && <div>{held}</div>}</>;
  };
  const ordered = plan ? plan.rows.slice().sort((a, b) => (a.ok - b.ok) || ((a.kind === "existing" && !a.changes.length) - (b.kind === "existing" && !b.changes.length)) || (a.row - b.row)) : [];
  const showAid = ctx.capsAssessmentReady;

  return <Modal icon="upload" title="Import stores into the CAP list" subtitle="Upload store numbers, franchisees and Assessment IDs with a status — email and phone come from the store records" modalStyle={{ maxWidth: 960 }}
    onEscape={saving ? false : undefined}
    footer={<><button type="button" className="btn ghost" disabled={saving} onClick={close}>{failures.length ? "Close" : "Cancel"}</button>
      <button type="button" className="btn" disabled={!count || saving} onClick={askSave}><Icon name="upload" />
        <span>{saving ? `Importing… ${progress.done}/${progress.total}` : count ? `Import ${plural(count, "store")}` : "Import"}</span></button></>}>
    <div className="bk-steps bu-steps">
      <div className="bk-step"><h4><span className="n">1</span>Get the template</h4>
        <p>Fill in Store Number, Franchisee{showAid ? ", Assessment ID" : ""} and Status. The <b>Franchisee</b> is checked against our records for that store number — rows that don't match wait for your approval.{showAid ? <> The <b>Assessment ID</b> is checked first to tell whether the store is already in the CAP list — each one must be unique.</> : null}
          {" "}<b>Not Started</b> adds the store at No Action Yet (stores already in the list keep their status). <b>In Progress</b> / <b>In Review</b> add the store at that status or change it.
          {" "}<b>Closed</b> adds the store at <b>Completed</b>, or marks a store already in the list Completed. A blank Status counts as Not Started. Due Date is optional.</p>
        <div className="bk-cols">{CAP_COLUMNS.filter((column) => showAid || column !== "Assessment ID").map((column) => <span key={column} className={column === "Store Number" ? "req" : ""}>{column}</span>)}</div>
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
        <div className={`s${plan.changed.length ? " ok" : ""}`}><b>{plan.changed.length}</b>In list · to update</div>
        <div className={`s${plan.unchanged.length ? " warn" : ""}`}><b>{plan.unchanged.length}</b>Already in list · no change</div>
        <div className={`s${ready.waiting.length ? " bad" : plan.frFlags.length ? " ok" : ""}`}><b>{plan.frFlags.length - ready.waiting.length}/{plan.frFlags.length}</b>Franchisee checks approved</div>
        <div className={`s${plan.notFound.length ? " bad" : ""}`}><b>{plan.notFound.length}</b>Not in database</div>
        {showAid && <div className={`s${plan.aidConflicts.length ? " bad" : ""}`}><b>{plan.aidConflicts.length}</b>Assessment ID conflicts</div>}
        <div className={`s${plan.problems.length ? " bad" : ""}`}><b>{plan.problems.length}</b>Other problems</div>
      </div>

      {plan.frFlags.length > 0 && <FranchiseeCheck rows={plan.frFlags} approved={approved} setApproved={setApproved} disabled={saving} />}

      {plan.notFound.length > 0 && <div className="warnbox show cap-check bad"><Icon name="circle-x" /><div>
        <b>{plural(plan.notFound.length, "store")} {plan.notFound.length === 1 ? "is" : "are"} not in the database</b> and will be skipped. Check the store number, or add the store in All Stores first.
        <StoreNums rows={plan.notFound} />
      </div></div>}

      {plan.aidConflicts.length > 0 && <div className="warnbox show cap-check bad"><Icon name="clipboard-list" /><div>
        <b>{plural(plan.aidConflicts.length, "row")} {plan.aidConflicts.length === 1 ? "has" : "have"} an Assessment ID conflict</b> and will be skipped. An Assessment ID can't be repeated in the file
        or belong to a different store in the CAP list. Fix the file, or the Assessment ID in the CAP list, and upload again.
        <ul>{plan.aidConflicts.slice(0, 10).map((row) => <li key={row.row}>Row {row.row}: {row.msg}</li>)}</ul>
        {plan.aidConflicts.length > 10 && <>…and {plan.aidConflicts.length - 10} more (see the rows below).</>}
      </div></div>}

      {plan.changed.length > 0 && <div className="warnbox show cap-check ok"><Icon name="badge-check" /><div>
        <b>{plural(plan.changed.length, "store")} already in the CAP list will be updated</b>
        {[plan.closes.length && ` · ${plan.closes.length} to Completed`, plan.statusChanges.length && ` · ${plan.statusChanges.length} to In Progress / In Review`,
          plan.assessmentFills.length && ` · ${plural(plan.assessmentFills.length, "Assessment ID")} filled in`].filter(Boolean).join("")}
        <div className="bk-table bu-table" style={{ marginTop: 8, maxHeight: 180 }}><table><thead><tr><th>Store</th><th>Change</th></tr></thead><tbody>
          {plan.changed.map((row) => <tr key={row.row}><td className="store">{row.num}</td><td><ChangeList changes={row.changes} /></td></tr>)}
        </tbody></table></div>
      </div></div>}

      {plan.existing.length > 0 && <div className="warnbox show cap-check"><Icon name="triangle-alert" /><div>
        <b>{plural(plan.existing.length, "store")} {plan.existing.length === 1 ? "is" : "are"} already in the CAP list</b>{showAid ? " (same Assessment ID or store number)" : ""} and won't be added again.
        <StoreNums rows={plan.existing} />
        {plan.updates.length > 0 && <>
          <div style={{ marginTop: 8 }}>{plan.updates.length} of them {plan.updates.length === 1 ? "has" : "have"} a different due date in the file. They are <b>not changed</b> unless you allow it.</div>
          <label className="cap-overwrite"><input type="checkbox" checked={overwrite} disabled={saving} onChange={(event) => setOverwrite(event.target.checked)} />
            Update the due date of stores already in the CAP list (a blank Due Date keeps the saved one)</label>
          {overwrite && <div className="bk-table bu-table" style={{ marginTop: 8, maxHeight: 180 }}><table><thead><tr><th>Store</th><th>Change</th></tr></thead><tbody>
            {plan.updates.map((row) => <tr key={row.row}><td className="store">{row.num}</td><td><ChangeList changes={[row.dueChange]} /></td></tr>)}
          </tbody></table></div>}
        </>}
      </div></div>}

      <div className="bu-h">Rows in the file</div>
      {plan.rows.length ? <div className="bk-table bu-table"><table><thead><tr><th>Row</th><th>Store #</th>{showAid && <th>Assessment ID</th>}<th>File Status</th><th>Check</th><th>From store records</th><th>Status</th>{ctx.capsDueReady && <th>Due Date</th>}<th>Result</th></tr></thead><tbody>
        {ordered.map((row) => <tr key={row.row}>
          <td className="muted">{row.row}</td><td className="store">{row.num || "—"}</td>
          {showAid && <td className="cap-aid">{row.shown?.aid || row.aid || <span className="muted">—</span>}</td>}
          <td style={{ whiteSpace: "nowrap" }}>{row.fileStatus ? FILE_STATUS_LABELS[row.fileStatus] : <span className="muted">—</span>}</td>
          <td><CheckTag row={row} approved={approved.has(row.row)} /></td>
          <td className="cap-imp-contact">{row.shown ? <><b>{row.shown.name || "—"}</b>
            {row.frIssue && <span className="cap-frfile">File: {row.frFile || "(blank)"}</span>}
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
