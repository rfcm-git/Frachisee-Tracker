import { useMemo } from "react";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { shortTime } from "../../lib/format.js";
import { useDataContext, useDataStore } from "../../state/dataStore.js";
import { useUiStore } from "../../state/uiStore.js";
import { buildDashboard } from "./dashboardModel.js";
import { DashboardCoverage, DashboardGaps, DashboardHeader, DashboardIssueInsights, DashboardKpis, DashboardTerritoryTable } from "./DashboardSections.jsx";

export default function DashboardView() {
  const ctx = useDataContext();
  const territory = useUiStore((state) => state.dashTerritory);
  const sort = useUiStore((state) => state.dashSort);
  const lastRefreshAt = useDataStore((state) => state.lastRefreshAt);
  const model = useMemo(() => buildDashboard(ctx, territory, sort), [ctx, territory, sort]);
  useToolbarCount("");

  return <>
    <DashboardHeader territory={territory} territories={model.territories} refreshed={shortTime(lastRefreshAt || new Date())} />
    <DashboardKpis items={model.kpis} />
    <DashboardCoverage coverage={model.coverage} donuts={model.donuts} />
    <DashboardGaps items={model.gaps} />
    <DashboardTerritoryTable rows={model.territoryRows} sort={sort} />
    <DashboardIssueInsights model={model.issues} />
  </>;
}
