import { useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { QUICK_REPORTS, REPORT_TYPES } from "../../reports/catalog.js";
import { openReport } from "../../state/dialogs.js";
import { runQuickReport } from "./reportActions.js";

function ReportTypeCard({ report }) {
  return <div className="rt-card">
    <div className="rt-top"><span className="rt-ic"><Icon name={report.icon} /></span><div><h3>{report.title}</h3><p>{report.description}</p></div></div>
    <div className="rt-filt"><Icon name="sliders-horizontal" />{report.filters}</div>
    <div className="rt-foot"><span className="rt-fmt"><span>Excel</span><span>PDF</span></span>
      <button type="button" className="btn sm round" onClick={() => openReport(report.key)}><Icon name="settings-2" />Build report</button>
    </div>
  </div>;
}

function QuickReport({ quick }) {
  const [busy, setBusy] = useState(false);
  const typeTitle = REPORT_TYPES.find((type) => type.key === quick.kind)?.title || "";
  const run = async (format) => { setBusy(true); await runQuickReport(quick, format); setBusy(false); };
  return <div className="rt-q"><span className="rt-qic"><Icon name={quick.icon} /></span>
    <span className="rt-qt">{quick.title}<small>{typeTitle}</small></span>
    <button type="button" className="iconbtn" data-tip="Download as Excel" aria-label={`${quick.title} as Excel`} disabled={busy} onClick={() => run("xlsx")}><Icon name="file-spreadsheet" /></button>
    <button type="button" className="iconbtn" data-tip="Download as PDF" aria-label={`${quick.title} as PDF`} disabled={busy} onClick={() => run("pdf")}><Icon name="file-text" /></button>
    <button type="button" className="btn link" data-tip="Open the builder with these choices" onClick={() => openReport(quick.kind, quick.preset)}>Customize</button>
  </div>;
}

export default function ReportsTab() {
  useToolbarCount("");
  return <>
    <div className="rt-intro"><Icon name="info" /><span>Pick a report, choose the <b>date</b>, <b>territory</b>, <b>franchisee</b>, <b>store</b> and category filters, the <b>sheets and columns</b> you want, then download as <b>Excel</b> or <b>PDF</b>. Your choices are remembered for next time.</span></div>
    <h3 className="rt-h"><Icon name="layout-grid" />Build a report</h3>
    <div className="rt-grid">{REPORT_TYPES.map((report) => <ReportTypeCard key={report.key} report={report} />)}</div>
    <h3 className="rt-h"><Icon name="zap" />Quick reports<span className="muted" style={{ fontWeight: 500, fontSize: 12.5, marginLeft: 6 }}>one click, all territories</span></h3>
    <div className="rt-quick card">{QUICK_REPORTS.map((quick) => <QuickReport key={`${quick.kind}-${quick.title}`} quick={quick} />)}</div>
  </>;
}
