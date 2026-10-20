/* Dashboard sections: header, KPI cards, coverage, gaps, territory table and issue insights. */
import Icon from "../../components/ui/Icon.jsx";
import { ChartKey, DashboardCard, DonutChart, HorizontalBars, KpiCard, WeeklyColumns } from "../../components/charts/Charts.jsx";
import { InfoTip } from "../../components/ui/common.jsx";
import { clickableProps } from "../../components/ui/clickable.js";
import { formatNumber } from "../../lib/format.js";
import { openDashboardList, openStoreIssues } from "../../state/dialogs.js";
import { openTabFromDashboard, setDashTerritory, showOpenConcerns, showTerritoryStores, sortDashboard } from "../../state/uiStore.js";

function runAction([kind, arg]) {
  if (kind === "tab") openTabFromDashboard(arg);
  else if (kind === "list") openDashboardList(arg);
  else if (kind === "issues") showOpenConcerns();
}

export function DashboardHeader({ territory, territories, refreshed }) {
  return <div className="db-head">
    <div><h2>{territory ? `Territory ${territory}` : "All territories"}</h2><span className="muted">Live from the shared database · updated {refreshed}</span></div>
    <label className="db-filter" data-tip="Show the whole dashboard for one territory"><Icon name="map-pin" />
      <select value={territory} aria-label="Territory" onChange={(event) => setDashTerritory(event.target.value)}>
        <option value="">All territories</option>
        {territories.map((value) => <option key={value} value={value}>Territory {value}</option>)}
      </select></label>
  </div>;
}

export function DashboardKpis({ items }) {
  return <div className="db-kpis">{items.map((item) => {
    const sub = item.statusCount
      ? <><span className="dot g" />{formatNumber(item.statusCount.Open)} open · <span className="dot o" />{formatNumber(item.statusCount["Temporarily closed"])} temp · <span className="dot x" />{formatNumber(item.statusCount.Closed)} closed</>
      : item.sub;
    const value = item.valueSuffix ? <>{item.value}<small>{item.valueSuffix}</small></> : item.value;
    return <KpiCard key={item.label} icon={item.icon} label={item.label} value={value} sub={sub} tip={item.tip} tone={item.tone} onClick={item.action ? () => runAction(item.action) : undefined} />;
  })}</div>;
}

export function DashboardCoverage({ coverage, donuts }) {
  return <>
    <div className="db-grid">
      <DashboardCard title="3PD coverage" icon="bike" className="span4" tip="Delivery apps per open store. Core 3PD = Uber Eats, DoorDash and Grubhub. Click any bar to see the stores.">
        <div className="db-split">
          <div><div className="db-sub">Core apps active per store</div>
            <HorizontalBars rows={coverage.coreRows} liveCount={coverage.liveCount} valueMode="coverage" onSelect={openDashboardList} /></div>
          <div><div className="db-sub">Status by platform</div>
            <HorizontalBars rows={coverage.platformRows} full valueMode="platform" onSelect={openDashboardList} />
            <ChartKey items={[["var(--green)", "Active"], ["var(--warn)", "Pending"], ["#e9968c", "Not enrolled"]]} /></div>
        </div>
      </DashboardCard>
    </div>
    <div className="db-grid">{donuts.map((donut) => <DashboardCard key={donut.title} title={donut.title} icon={donut.icon} tip={donut.tip} className="span2">
      <DonutChart segments={donut.segments} center={donut.center} sub={donut.sub} onSelect={openDashboardList} />
    </DashboardCard>)}</div>
  </>;
}

export function DashboardGaps({ items }) {
  return <div className="db-grid"><DashboardCard title="Coverage gaps" icon="list-checks" className="span4" tip="Stores that need follow-up. Click any item to see the stores and download the list.">
    <div className="db-gaps">{items.map((item) => <button type="button" key={item.key} className={`db-gap click${item.count ? "" : " zero"}`}
      data-tip={`${item.tip} - click to see the list`} onClick={() => openDashboardList(item.key)}>
      <Icon name={item.icon} /><span className="l">{item.label}</span><b>{formatNumber(item.count)}</b><Icon name="chevron-right" className="ch" />
    </button>)}</div>
  </DashboardCard></div>;
}

const TERRITORY_COLUMNS = [
  ["t", "Territory", "Territory number"],
  ["fr", "Franchisees", "Owners with stores in the territory"],
  ["stores", "Stores", "All stores (open ones in green)"],
  ["avg", "Avg 3PD", "Average core apps active per open store (out of 3)"],
  ["all3", "All 3 apps", "% of open stores active on Uber Eats, DoorDash and Grubhub"],
  ["gbp", "GBP synced", "% of open stores with a GBP link"],
  ["ez", "ezCater", "% of open stores active on ezCater"],
  ["issues", "Open issues", "Pending + Work in Progress issues"],
];

function Meter({ value, max, color }) {
  return <span className="db-meter"><span style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} /></span>;
}

export function DashboardTerritoryTable({ rows, sort }) {
  return <div className="db-grid"><DashboardCard title="By territory" icon="map" className="span4"
    tip="Totals for each territory. Coverage % is based on open stores. Click a column to sort, or a row to open that territory's stores.">
    <div className="db-tablewrap"><table className="db-table"><thead><tr>{TERRITORY_COLUMNS.map(([key, label, tip]) =>
      <th key={key} className={`sortable${sort.key === key ? " on" : ""}`} data-tip={tip} onClick={() => sortDashboard(key)}
        aria-sort={sort.key === key ? (sort.dir < 0 ? "descending" : "ascending") : undefined}>
        {label}{sort.key === key && <Icon name={sort.dir < 0 ? "arrow-down" : "arrow-up"} />}
      </th>)}</tr></thead><tbody>
      {rows.map((row) => <tr key={row.t} className="click" {...clickableProps(() => showTerritoryStores(row.t))}>
        <td><b>{row.t}</b></td><td>{row.fr}</td>
        <td>{row.stores} <small className="g">{row.open} open</small></td>
        <td><div className="db-mc"><Meter value={row.avg} max={3} color="#008938" /><span>{row.avg.toFixed(1)}</span></div></td>
        <td><div className="db-mc"><Meter value={row.all3} max={100} color="#8cc63f" /><span>{row.all3}%</span></div></td>
        <td><div className="db-mc"><Meter value={row.gbp} max={100} color="#2f9e8f" /><span>{row.gbp}%</span></div></td>
        <td><div className="db-mc"><Meter value={row.ez} max={100} color="#ffc600" /><span>{row.ez}%</span></div></td>
        <td>{row.issues ? <span className="db-pill red">{row.issues}</span> : <span className="muted">0</span>}</td>
      </tr>)}
    </tbody></table></div>
  </DashboardCard></div>;
}

function TopIssueStores({ rows }) {
  if (!rows.length) return <div className="db-empty"><Icon name="circle-check" />No open issues</div>;
  return <div className="db-top">{rows.map((row) => <div key={row.num} className="db-tr click" data-tip="Open this store's issues" {...clickableProps(() => openStoreIssues(row.num))}>
    <span className="n">{row.num}</span>
    <span className="f">{row.franchisee}<small>{row.location}</small></span>
    <span className="db-pill red">{row.count} open</span>
    <span className={`age${row.age > 14 ? " old" : ""}`} data-tip="Oldest open issue">{row.age}d</span>
  </div>)}</div>;
}

export function DashboardIssueInsights({ model }) {
  return <>
    <div className="db-sec">
      <h3 className="db-sech"><Icon name="triangle-alert" />Issues<InfoTip text="Issue numbers for stores in this view. Multi-store issues count once per store." /></h3>
      <div className="db-mini">{model.summary.map((item) => <div key={item.label} className={item.tone || ""} data-tip={item.tip}><b>{item.value}</b><span>{item.label}</span></div>)}</div>
    </div>
    <div className="db-grid">
      <DashboardCard title="Status" icon="pie-chart" tip="Current status of all issues.">
        <DonutChart segments={model.statusSegments} center={model.totalIssues} sub="issues" />
      </DashboardCard>
      <DashboardCard title="Logged vs resolved" icon="bar-chart-3" className="span2" tip="Issues logged and resolved each week (last 12 weeks). Weeks start on Sunday.">
        {model.hasIssues ? <WeeklyColumns weeks={model.weeks} /> : <div className="db-empty">No issues yet</div>}
      </DashboardCard>
      <DashboardCard title="Open issue age" icon="hourglass" tip="How long open issues have been waiting since they were logged.">
        <HorizontalBars rows={model.ageRows} empty="No open issues" />
      </DashboardCard>
      <DashboardCard title="Stores with the most open issues" icon="store" className="span2"
        tip="Top stores by number of open issues. 'd' = age of the oldest open issue in days. Click to see the issues.">
        <TopIssueStores rows={model.topStores} />
      </DashboardCard>
      <DashboardCard title="Issues by platform" icon="layers" tip="Which platform each issue was about (an issue can list more than one).">
        <HorizontalBars rows={model.platformRows} empty="No issues yet" />
        {model.platformRows.length > 0 && <ChartKey items={[["var(--danger)", "Open"], ["var(--ok)", "Resolved"]]} />}
      </DashboardCard>
      <DashboardCard title="Open issues by FBC" icon="badge-check" tip="Open issues grouped by each store's assigned FBC.">
        <HorizontalBars rows={model.fbcRows} empty="No open issues" />
      </DashboardCard>
    </div>
  </>;
}
