import { useMemo } from "react";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { shortTime } from "../../lib/format.js";
import { useDataContext, useDataStore } from "../../state/dataStore.js";
import { useUiStore } from "../../state/uiStore.js";
import { buildDashboard } from "./dashboardModel.js";
import { buildKpis } from "./dashboardKpis.js";
import { rangeBounds } from "./dashboardRange.js";
import { DashboardHeader, DashboardKpis } from "./DashboardTop.jsx";
import { IssuesChartCard, TopStoresCard } from "./IssuesChart.jsx";
import { issueTrend, topIssueStores } from "./issueTrend.js";
import { DashboardCoverage, DashboardGaps, DashboardTerritoryTable } from "./DashboardSections.jsx";

export default function DashboardView() {
  const ctx = useDataContext();
  const territory = useUiStore((state) => state.dashTerritory);
  const range = useUiStore((state) => state.dashRange);
  const sort = useUiStore((state) => state.dashSort);
  const lastRefreshAt = useDataStore((state) => state.lastRefreshAt);
  // The period is fixed to the day, so it only changes with the picker (or after midnight on a refresh).
  const day = new Date().toDateString();
  const bounds = useMemo(() => rangeBounds(range, new Date(day)), [range, day]);
  const kpis = useMemo(() => buildKpis(ctx, territory, bounds), [ctx, territory, bounds]);
  const trend = useMemo(() => issueTrend(ctx, territory, bounds), [ctx, territory, bounds]);
  const topStores = useMemo(() => topIssueStores(ctx, territory), [ctx, territory]);
  const model = useMemo(() => buildDashboard(ctx, territory, sort), [ctx, territory, sort]);
  useToolbarCount("");

  return <>
    <DashboardHeader territory={territory} territories={model.territories} range={range} bounds={bounds} refreshed={shortTime(lastRefreshAt || new Date())} />
    <DashboardKpis kpis={kpis} prevLabel={bounds.prevLabel} />
    <div className="dc-row"><IssuesChartCard trend={trend} label={bounds.label} /><TopStoresCard rows={topStores} /></div>
    <DashboardCoverage coverage={model.coverage} donuts={model.donuts} />
    <DashboardGaps items={model.gaps} />
    <DashboardTerritoryTable rows={model.territoryRows} sort={sort} />
  </>;
}
