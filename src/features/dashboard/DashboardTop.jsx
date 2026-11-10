/* Dashboard header (title, search, date range, territory) and the four KPI cards. */
import { useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import { localDateInput } from "../../lib/format.js";
import { openFind, openTabFromDashboard, setDashRange, setDashTerritory, setTab, showCaps, showOpenConcerns } from "../../state/uiStore.js";
import { RANGE_PRESETS } from "./dashboardRange.js";

export function DashboardHeader({ territory, territories, range, bounds, refreshed }) {
  const [query, setQuery] = useState("");
  return <div className="dh">
    <div className="dh-t">
      <h2>{territory ? `Territory ${territory}` : "All territories"}</h2>
      <span>{bounds.label} vs {bounds.prevLabel} · updated {refreshed}</span>
    </div>
    <div className="dh-ctrl">
      <form className="dh-search" role="search" onSubmit={(event) => { event.preventDefault(); openFind(query.trim() || undefined); }}>
        <Icon name="search" />
        <input type="search" value={query} placeholder="Search stores, franchisees, issues…" aria-label="Search everything"
          onChange={(event) => setQuery(event.target.value)} />
      </form>
      <label className="dh-pick" data-tip="Period for the trends and the issues chart">
        <Icon name="calendar-range" />
        <select value={range.preset} aria-label="Date range" onChange={(event) => setDashRange({ preset: event.target.value })}>
          {RANGE_PRESETS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      {range.preset === "custom" && <span className="dh-dates">
        <input type="date" aria-label="From" value={range.from} max={range.to || localDateInput()} onChange={(event) => setDashRange({ from: event.target.value })} />
        <span aria-hidden="true">–</span>
        <input type="date" aria-label="To" value={range.to} min={range.from || undefined} max={localDateInput()} onChange={(event) => setDashRange({ to: event.target.value })} />
      </span>}
      <label className="dh-pick" data-tip="Show the whole dashboard for one territory">
        <Icon name="map-pin" />
        <select value={territory} aria-label="Territory" onChange={(event) => setDashTerritory(event.target.value)}>
          <option value="">All territories</option>
          {territories.map((value) => <option key={value} value={value}>Territory {value}</option>)}
        </select>
      </label>
    </div>
  </div>;
}

/** "+25% issues opened vs previous 30 days", in green (good), red (bad) or grey. */
function Trend({ kpi, prevLabel }) {
  if (!kpi.trend) return <span className="dk-trend none">{kpi.noTrend || "No earlier data to compare"}</span>;
  const { tone, icon, text } = kpi.trend;
  return <span className={`dk-trend ${tone}`}>
    <span className="dk-chip"><Icon name={icon} />{text}</span>
    <span className="dk-vs">{kpi.trendLabel ? `${kpi.trendLabel} ` : ""}vs {prevLabel}</span>
  </span>;
}

const OPEN = { issues: () => showOpenConcerns(), coverage: () => openTabFromDashboard("stores"), caps: () => showCaps() };
const OPEN_TEXT = { issues: "Open the Issues tab", coverage: "Open All Stores", caps: "Open the CAP tab" };

function KpiValue({ kpi }) {
  return <span className="dk-val"><b>{kpi.value}</b>{kpi.valueNote && <span>{kpi.valueNote}</span>}</span>;
}

/** Onboarding: one link per tab with its own progress bar. */
function OnboardingCard({ kpi, prevLabel }) {
  return <div className="dk-card" data-tip={kpi.tip}>
    <span className="dk-lb">{kpi.label}</span>
    <KpiValue kpi={kpi} />
    <span className="dk-parts">{kpi.parts.map((part) => <button type="button" key={part.key} className="dk-part" onClick={() => setTab(part.key)}
      data-tip={`${part.label}: ${part.done} of ${part.total} onboarded · ${part.open} still to do — click to open`}>
      <span className="dk-part-l">{part.label}</span>
      <span className="dk-bar" aria-hidden="true"><i style={{ width: `${part.percent}%` }} /></span>
      <em>{part.percent}%</em>
    </button>)}</span>
    <Trend kpi={kpi} prevLabel={prevLabel} />
  </div>;
}

export function DashboardKpis({ kpis, prevLabel }) {
  return <div className="dk-row">
    {kpis.map((kpi) => {
      if (kpi.key === "onboarding") return <OnboardingCard key={kpi.key} kpi={kpi} prevLabel={prevLabel} />;
      return <button type="button" key={kpi.key} className={`dk-card dk-click${kpi.tone ? ` ${kpi.tone}` : ""}`} data-tip={`${kpi.tip} ${OPEN_TEXT[kpi.key]}.`} onClick={OPEN[kpi.key]}>
        <span className="dk-lb">{kpi.label}<Icon name="arrow-right" className="dk-go" /></span>
        <KpiValue kpi={kpi} />
        {kpi.summary ? <span className="dk-caps">
          <span className={kpi.summary.overdue ? "bad" : ""}><Icon name="triangle-alert" />{kpi.summary.overdue.toLocaleString()} overdue</span>
          <span className={kpi.summary.dueSoon ? "warn" : ""}><Icon name="alarm-clock" />{kpi.summary.dueSoon.toLocaleString()} due soon</span>
        </span> : <span className="dk-sub">{kpi.sub}</span>}
        <Trend kpi={kpi} prevLabel={prevLabel} />
      </button>;
    })}
  </div>;
}
