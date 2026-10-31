import { useMemo, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { BusyButton } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { PERIODS, REPORT_TIME_ZONES } from "../../config/constants.js";
import { storesOf } from "../../domain/context.js";
import { formatNumber } from "../../lib/format.js";
import { withPeriod, yearsOf } from "../../lib/periods.js";
import { cleanStoreNumber, compareNumbers } from "../../lib/text.js";
import { REPORTS } from "../../reports/catalog.js";
import { defaultReportState, franchiseeChoice, reportTerritories, saveReportPrefs, selectRecords } from "../../reports/reportEngine.js";
import { useDataContext } from "../../state/dataStore.js";
import { toast } from "../../state/toastStore.js";
import { useUiStore } from "../../state/uiStore.js";
import { runReport } from "./reportActions.js";

function Section({ number, title, actions, children, dimmed }) {
  return <div className="rp-sec">
    <div className="rp-sh"><span className="n">{number}</span>{title}{actions && <span className="act">{actions}</span>}</div>
    <div className="rp-sb" style={dimmed ? { opacity: 0.5 } : undefined}>{children}</div>
  </div>;
}

function CheckOption({ on, label, sub, onChange }) {
  return <label className={`rp-ck${on ? " on" : ""}`}><input type="checkbox" checked={on} onChange={onChange} /><span>{label}{sub && <small>{sub}</small>}</span></label>;
}

function PeriodExtra({ state, update, years }) {
  const { period } = state;
  if (["day", "week", "month"].includes(period)) {
    return <div className="row"><span className="hint" style={{ margin: 0 }}>{period === "week" ? "Any day in the week" : period === "month" ? "Any day in the month" : "Day"}</span>
      <input type="date" value={state.date} onChange={(event) => update({ date: event.target.value })} /></div>;
  }
  if (period === "year") {
    return <div className="row"><select value={state.year} onChange={(event) => update({ year: +event.target.value })} style={{ width: 120, height: 34 }} aria-label="Year">
      {years.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>;
  }
  if (period === "lastdays") {
    return <div className="row"><span className="hint" style={{ margin: 0 }}>Last</span>
      <input type="number" min="1" max="3650" style={{ width: 80 }} value={state.days} aria-label="Number of days" onChange={(event) => update({ days: Math.max(1, +event.target.value || 1) })} />
      <span className="hint" style={{ margin: 0 }}>days</span></div>;
  }
  if (period === "range") {
    return <div className="row"><span className="hint" style={{ margin: 0 }}>From</span><input type="date" value={state.from} onChange={(event) => update({ from: event.target.value })} />
      <span className="hint" style={{ margin: 0 }}>To</span><input type="date" value={state.to} onChange={(event) => update({ to: event.target.value })} /></div>;
  }
  return null;
}

/** Report builder: pick records, sheets, columns, time zone and format, then download. */
export default function ReportBuilderDialog({ kind, preset }) {
  const ctx = useDataContext();
  const { close } = useDialog();
  const definition = REPORTS[kind] || REPORTS.issues;
  const [state, setState] = useState(() => defaultReportState(definition, preset));
  const [busy, setBusy] = useState(false);

  const update = (patch) => setState((current) => ({ ...current, ...patch }));
  /** Changes that are remembered for next time. */
  const updateSaved = (patch) => setState((current) => { const next = { ...current, ...patch }; saveReportPrefs(next); return next; });
  const toggleList = (name, value) => updateSaved({ [name]: state[name].includes(value) ? state[name].filter((item) => item !== value) : [...state[name], value] });
  const toggleChip = (key, value) => {
    const selected = state.chips[key] || [];
    update({ chips: { ...state.chips, [key]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value] } });
  };

  const records = useMemo(() => selectRecords(ctx, definition, state), [ctx, definition, state]);
  const choice = franchiseeChoice(ctx, state.fr);
  const storeNum = cleanStoreNumber(state.store);
  const storeExists = definition.storeExists ? definition.storeExists(ctx, storeNum) : ctx.storeByNum.has(storeNum);
  const typedStore = storeNum ? ctx.storeByNum.get(storeNum) : null;
  const wrongFranchisee = choice.franchisee && typedStore && typedStore.franchisee_id !== choice.franchisee.id;
  const storeChoices = (choice.franchisee ? storesOf(ctx, choice.franchisee.id) : ctx.stores).map((store) => String(store.num)).sort(compareNumbers);
  const years = useMemo(() => (definition.dateLabel ? yearsOf(definition.items(ctx).map(definition.dateOf)) : []), [ctx, definition]);
  const pdf = state.fmt === "pdf";
  const mainSheetOn = state.sheets.includes(definition.mainSheet);
  const canDownload = records.length > 0 && state.sheets.length > 0 && !(mainSheetOn && !state.cols.length && state.sheets.length === 1);

  function copyTabFilters() {
    update(definition.useTab(ctx, useUiStore.getState()));
    toast(definition.kind === "issues" ? "Copied the Issues tab filters" : definition.kind === "ob" ? "Copied the Onboarding filters" : definition.kind === "cap" ? "Copied the CAPs Monitoring filters" : "Copied the tab filters", "ok");
  }

  async function download() {
    setBusy(true);
    await runReport(definition, state);
    setBusy(false);
  }

  const allNone = (name, list) => <><button type="button" className="btn link" onClick={() => updateSaved({ [name]: list.map(([key]) => key) })}>All</button>
    <button type="button" className="btn link" onClick={() => updateSaved({ [name]: [] })}>None</button></>;

  const [countNumber, ...countRest] = definition.countParts(ctx, records);
  return <Modal icon="file-bar-chart" modalStyle={{ maxWidth: 900 }} title={definition.title} subtitle="Choose what to include, then download as Excel (.xlsx)"
    footer={<>
      <div className="rp-count" style={{ marginRight: "auto" }}>
        {records.length ? [countNumber, ...countRest].map(([count, one, many], index) => <span key={one}>{index > 0 && " · "}<b>{formatNumber(count)}</b> {count !== 1 ? many : one}</span>)
          : definition.emptyText}
      </div>
      <button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <BusyButton busy={busy} busyLabel={pdf ? "Making PDF…" : "Preparing…"} disabled={!canDownload} onClick={download}>
        <Icon name={pdf ? "file-text" : "download"} />{pdf ? "Download PDF" : "Download Excel"}</BusyButton>
    </>}>
    <datalist id="rp_frlist">{ctx.franchisees.map((franchisee) => <option key={franchisee.id} value={franchisee.name} />)}</datalist>
    <datalist id="rp_stlist">{storeChoices.map((num) => <option key={num} value={num} />)}</datalist>

    <Section number="1" title={definition.whichLabel} actions={definition.useTab && <button type="button" className="btn link" onClick={copyTabFilters}><Icon name="copy" />Use {definition.tabName} filters</button>}>
      <div className="rp-grid">
        <div className="rp-f"><span className="l">Franchisee</span>
          <input type="text" list="rp_frlist" placeholder="All franchisees — or type a name" aria-label="Franchisee" value={state.fr} onChange={(event) => update({ fr: event.target.value })} />
          {choice.bad ? <div className="hint bad">No franchisee with that exact name. Pick one from the list.</div>
            : <div className="hint">{choice.franchisee ? `${storesOf(ctx, choice.franchisee.id).length} stores` : "Leave empty for all franchisees"}</div>}</div>
        <div className="rp-f"><span className="l">Store #</span>
          <input type="text" list="rp_stlist" placeholder="All stores — or type a store #" aria-label="Store number" value={state.store} onChange={(event) => update({ store: event.target.value })} />
          {storeNum && !storeExists ? <div className="hint bad">Store not found.</div>
            : wrongFranchisee ? <div className="hint bad">This store belongs to a different franchisee.</div>
              : <div className="hint">Leave empty for all stores{choice.franchisee ? " of this franchisee" : ""}</div>}</div>
        <div className="rp-f"><span className="l">Territory</span>
          <select value={state.terr} aria-label="Territory" onChange={(event) => update({ terr: event.target.value })}>
            <option value="">All territories</option>{reportTerritories(ctx).map((territory) => <option key={territory} value={territory}>Territory {territory}</option>)}</select>
          <div className="hint">{state.terr ? `Only stores in territory ${state.terr}` : "Leave as All for every territory"}</div></div>
        {definition.dateLabel && <div className="rp-f"><span className="l">{definition.dateLabel}</span>
          <select value={state.period} aria-label={definition.dateLabel} onChange={(event) => setState((current) => withPeriod(current, event.target.value))}>
            {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <PeriodExtra state={state} update={update} years={years} /></div>}
        {(definition.chips || []).map((group) => {
          const selected = state.chips[group.key] || [];
          return <div className="rp-f" key={group.key} style={group.wide ? { gridColumn: "1 / -1" } : undefined}><span className="l">{group.label}</span>
            <div className="chips">{group.options.map(([value, label, color]) => <button type="button" key={value} className={`mchip${selected.includes(value) ? " sel" : ""}`}
              aria-pressed={selected.includes(value)} onClick={() => toggleChip(group.key, value)}>
              {color && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 5 }} />}{label}</button>)}</div>
            <div className="hint">{selected.length === group.options.length ? (group.allLabel || "All") : selected.length ? "Only the selected" : "Pick at least one"}</div></div>;
        })}
      </div>
    </Section>

    <Section number="2" title={definition.sheetsLabel || "Sheets / sections"} actions={allNone("sheets", definition.sheets)}>
      <div className="rp-checks">{definition.sheets.map(([key, label, sub]) => <CheckOption key={key} on={state.sheets.includes(key)} label={label} sub={sub} onChange={() => toggleList("sheets", key)} />)}</div>
    </Section>

    <Section number="3" title={`Columns in the ${definition.mainSheetLabel} sheet`} actions={allNone("cols", definition.cols)} dimmed={!mainSheetOn}>
      <div className="rp-checks">{definition.cols.map(([key, label]) => <CheckOption key={key} on={state.cols.includes(key)} label={label} onChange={() => toggleList("cols", key)} />)}</div>
      {!mainSheetOn && <div className="hint" style={{ marginTop: 8 }}>Turn on the {definition.mainSheetLabel} sheet to use these columns.</div>}
    </Section>

    <Section number="4" title="Options"><div className="rp-grid">
      <div className="rp-f"><span className="l">Show dates and times in</span>
        <select value={state.tz} aria-label="Time zone" onChange={(event) => updateSaved({ tz: event.target.value })}>
          {REPORT_TIME_ZONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="rp-f"><span className="l">File format</span>
        <div className="rp-fmt" role="radiogroup" aria-label="File format">
          <button type="button" role="radio" aria-checked={!pdf} className={!pdf ? "on" : ""} onClick={() => updateSaved({ fmt: "xlsx" })}><Icon name="file-spreadsheet" />Excel (.xlsx)</button>
          <button type="button" role="radio" aria-checked={pdf} className={pdf ? "on" : ""} onClick={() => updateSaved({ fmt: "pdf" })}><Icon name="file-text" />PDF</button>
        </div>
        <div className="hint">{pdf ? <>Printable, read-only. Every sheet becomes a section.{state.cols.length > 12 && <> <b>Tip:</b> {state.cols.length} columns are picked — choose 12 or fewer for an easier-to-read PDF.</>}</> : "Editable, sortable and filterable in Excel."}</div>
      </div>
    </div></Section>
  </Modal>;
}
