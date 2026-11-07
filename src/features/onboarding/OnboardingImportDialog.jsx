import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { ObPlatformTag, ObStatusBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { franchiseeName } from "../../domain/context.js";
import { getContext, useDataContext } from "../../state/dataStore.js";
import { confirmAction } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { saveOnboardingPlan } from "./onboardingActions.js";
import { OB_COLUMNS, downloadOnboardingTemplate, planOnboardingImport, readOnboardingFile } from "./onboardingImport.js";

const xlsxFailed = () => toast("Spreadsheet tool didn't load — check internet", "err");
const plural = (count, word) => `${count} ${word}${count !== 1 ? "s" : ""}`;

/** What happens to one store + platform of a row. */
function ItemResult({ item }) {
  if (item.kind === "new") return <div className="obi-item"><ObPlatformTag platform={item.platform} /><span className="cap-tag ok"><Icon name="circle-check" />New</span><ObStatusBadge status={item.after} />
    {item.kept && <span className="muted">store is already {item.after}</span>}</div>;
  if (item.kind === "update") return <div className="obi-item"><ObPlatformTag platform={item.platform} /><span className="cap-tag warn"><Icon name="refresh-cw" />On the list · update</span>
    {item.before !== item.after ? <><ObStatusBadge status={item.before} /><Icon name="arrow-right" /><ObStatusBadge status={item.after} /></> : <span className="muted">status unchanged · details added</span>}</div>;
  return <div className="obi-item"><ObPlatformTag platform={item.platform} /><span className="cap-tag"><Icon name="check" />Already on the list · no change</span><ObStatusBadge status={item.before} /></div>;
}

/** Store numbers in a check box, up to 40. */
const StoreNums = ({ rows }) => <div className="cap-nums">{rows.slice(0, 40).map((row) => <span key={row.row}>{row.num || `row ${row.row}`}</span>)}{rows.length > 40 && <em>+{rows.length - 40} more</em>}</div>;

/** Add many stores to onboarding from a spreadsheet, with a preview first. */
export default function OnboardingImportDialog() {
  const ctx = useDataContext();
  const { close, setBusy } = useDialog();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [failures, setFailures] = useState([]);
  const plan = useMemo(() => (parsed ? planOnboardingImport(ctx, parsed) : null), [ctx, parsed]);

  async function chooseFile(file) {
    setFileName(file.name);
    setParsed(null);
    setError("");
    setFailures([]);
    try {
      const result = await readOnboardingFile(file);
      if (result.error) { setError(result.error); return; }
      setParsed(result);
      setBusy(true);
    } catch {
      xlsxFailed();
    }
  }

  async function save() {
    const current = planOnboardingImport(getContext(), parsed);
    setProgress({ done: 0, total: 1 });
    const result = await saveOnboardingPlan(current, { status: undefined, details: "", onProgress: (done, total) => setProgress({ done, total }) });
    setProgress(null);
    const summary = [result.created && `${plural(result.created, "record")} added`, result.updated && `${plural(result.updated, "record")} updated`].filter(Boolean).join(" · ") || "Nothing was changed";
    if (result.failures.length) {
      setFailures(result.failures);
      setParsed(null);
      toast(`${summary} — some items failed, see the list`, "err");
      return;
    }
    close();
    toast(summary, "ok");
  }

  function askSave() {
    const parts = [plan.newCount && `add ${plural(plan.newCount, "store + platform record")}`, plan.updateCount && `update ${plural(plan.updateCount, "record")} already on the list`].filter(Boolean);
    confirmAction({
      title: "Import into onboarding?", okLabel: "Import", busyLabel: "Importing…", icon: "upload", okClass: "btn",
      text: `This will ${parts.join(" and ")}. The same status is set in each store's Delivery Platforms.${plan.sameCount ? ` ${plural(plan.sameCount, "item")} already on the list with the same status will be left as they are.` : ""}`,
      onConfirm: save,
    });
  }

  const saving = !!progress;
  const count = plan ? plan.newCount + plan.updateCount : 0;
  const ordered = plan ? plan.rows.slice().sort((a, b) => (a.ok - b.ok) || (a.row - b.row)) : [];

  return <Modal icon="upload" title="Add multiple stores" subtitle="Upload a spreadsheet of stores and the platforms to onboard — check the preview before anything is saved" modalStyle={{ maxWidth: 980 }}
    onEscape={saving ? false : undefined}
    footer={<><button type="button" className="btn ghost" disabled={saving} onClick={close}>{failures.length ? "Close" : "Cancel"}</button>
      <button type="button" className="btn" disabled={!count || saving} onClick={askSave}><Icon name="upload" />
        <span>{saving ? `Importing… ${progress.done}/${progress.total}` : count ? `Import ${plural(count, "item")}` : "Import"}</span></button></>}>
    <div className="bk-steps bu-steps">
      <div className="bk-step"><h4><span className="n">1</span>Get the template</h4>
        <p>One row per store. Put <b>Y</b> under each platform to onboard. <b>Status</b> is optional (blank = Not enrolled for new stores, or keeps the current status) and <b>Details</b> is optional.
          Stores already on the list for a platform are only updated when the status differs or Details is filled in.</p>
        <div className="bk-cols">{OB_COLUMNS.map((column) => <span key={column} className={column === "Store Number" ? "req" : ""}>{column}</span>)}</div>
        <div className="bu-btns">
          <button type="button" className="btn sm round" onClick={() => downloadOnboardingTemplate().catch(xlsxFailed)}><Icon name="file-spreadsheet" />Download template</button>
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
      <b>Some items were not saved.</b> Everything else was saved. Fix these and upload the file again:
      <ul>{failures.slice(0, 20).map((text) => <li key={text}>{text}</li>)}</ul>{failures.length > 20 && <>…and {failures.length - 20} more.</>}
    </div></div>}

    {plan && <>
      <div className="bk-sum">
        <div className={`s${plan.newCount ? " ok" : ""}`}><b>{plan.newCount}</b>New records</div>
        <div className={`s${plan.updateCount ? " warn" : ""}`}><b>{plan.updateCount}</b>On the list · to update</div>
        <div className="s"><b>{plan.sameCount}</b>On the list · no change</div>
        <div className={`s${plan.notFound.length ? " bad" : ""}`}><b>{plan.notFound.length}</b>Not in database</div>
        <div className={`s${plan.problems.length ? " bad" : ""}`}><b>{plan.problems.length}</b>Other problems</div>
      </div>

      {plan.notFound.length > 0 && <div className="warnbox show cap-check bad"><Icon name="circle-x" /><div>
        <b>{plural(plan.notFound.length, "store")} {plan.notFound.length === 1 ? "is" : "are"} not in the database</b> and will be skipped. Check the store number, or add the store in All Stores first.
        <StoreNums rows={plan.notFound} />
      </div></div>}

      {plan.updateCount > 0 && <div className="warnbox show cap-check"><Icon name="triangle-alert" /><div>
        <b>{plural(plan.updateCount, "store + platform")} {plan.updateCount === 1 ? "is" : "are"} already on the onboarding list</b> with a different status, or with Details filled in.
        {" "}They are not added again — their record gets the new status and the Details as a progress update.
      </div></div>}

      <div className="bu-h">Rows in the file</div>
      {plan.rows.length ? <div className="bk-table bu-table"><table><thead><tr><th>Row</th><th>Store #</th><th>Franchisee</th><th>Platforms</th><th>Details</th></tr></thead><tbody>
        {ordered.map((row) => {
          const store = ctx.storeByNum.get(row.num);
          return <tr key={row.row}>
            <td className="muted">{row.row}</td><td className="store">{row.num || "—"}</td>
            <td>{store ? franchiseeName(ctx, store.franchisee_id) || "—" : <span className="muted">—</span>}</td>
            <td>{row.ok ? row.items.map((item) => <ItemResult key={item.platform} item={item} />) : <span className="bk-skip"><Icon name="circle-x" />Skipped: {row.msg}</span>}</td>
            <td className="obi-details">{row.details || <span className="muted">—</span>}</td>
          </tr>;
        })}
      </tbody></table></div> : <p className="muted">No data rows found in the file.</p>}
      {plan.skipped.length > 0 && count > 0 && <div className="help">Skipped rows are not saved. Fix them in the file and upload again, or import the ready rows now.</div>}
    </>}
  </Modal>;
}
