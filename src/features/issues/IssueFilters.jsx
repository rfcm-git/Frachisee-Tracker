import Icon from "../../components/ui/Icon.jsx";
import FilterDropdown, { FilterOption } from "../../components/ui/FilterMenu.jsx";
import { ISSUE_STATES, ISSUE_STATUS_COLOR, PERIODS } from "../../config/constants.js";
import { shortStatus } from "../../domain/issues.js";
import { PERIODS_WITH_INPUT, periodButtonLabel, yearsOf } from "../../lib/periods.js";
import { useDataContext } from "../../state/dataStore.js";
import {
  clearIssueFilters, patchIssueFilter, setIssuePeriod, setIssueView, toggleIssueStatus, useUiStore,
} from "../../state/uiStore.js";

const VIEWS = [["store", "store", "By store", "One row per store"], ["fr", "users", "By franchisee", "One row per franchisee"], ["issue", "list", "By issue", "One row per issue"]];

/** Extra inputs for periods that need a day, year, number of days or range. */
function PeriodInputs({ filter, years }) {
  const { period } = filter;
  if (["day", "week", "month"].includes(period)) {
    return <><label className="fdd-lbl">{period === "week" ? "Any day in the week" : period === "month" ? "Any day in the month" : "Day"}</label>
      <input type="date" className="fdate" value={filter.date} onChange={(event) => patchIssueFilter({ date: event.target.value })} /></>;
  }
  if (period === "year") {
    return <><label className="fdd-lbl">Year</label>
      <select className="fsel" value={filter.year} onChange={(event) => patchIssueFilter({ year: +event.target.value })}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></>;
  }
  if (period === "lastdays") {
    return <><label className="fdd-lbl">Number of days</label>
      <input type="number" min="1" max="3650" className="fnum" style={{ width: 90 }} value={filter.days} onChange={(event) => patchIssueFilter({ days: Math.max(1, +event.target.value || 1) })} /></>;
  }
  if (period === "range") {
    return <><label className="fdd-lbl">From</label><input type="date" className="fdate" value={filter.from} onChange={(event) => patchIssueFilter({ from: event.target.value })} />
      <label className="fdd-lbl">To</label><input type="date" className="fdate" value={filter.to} onChange={(event) => patchIssueFilter({ to: event.target.value })} /></>;
  }
  return null;
}

export default function IssueFilters() {
  const ctx = useDataContext();
  const view = useUiStore((state) => state.issueView);
  const filter = useUiStore((state) => state.issueFilter);
  const search = useUiStore((state) => state.search);
  const statusValue = filter.statuses.length === 3 ? "All 3" : filter.statuses.map(shortStatus).join(", ");
  const anyFilter = !!(filter.statuses.length || filter.period !== "all" || search.trim());
  const years = yearsOf(ctx.issues.map((issue) => issue.created_at));

  return <div className="ifbar">
    <div className="grp"><div className="vtog">
      {VIEWS.map(([value, icon, label, title]) => <button type="button" key={value} className={view === value ? "on" : ""} title={title} aria-pressed={view === value}
        onClick={() => setIssueView(value)}><Icon name={icon} />{label}</button>)}
    </div></div>
    <div className="grp fdd-grp">
      <FilterDropdown icon="filter" label="Filter by status" value={statusValue} active={filter.statuses.length > 0}>
        <FilterOption selected={!filter.statuses.length} onClick={() => toggleIssueStatus("")}><span className="d" style={{ background: "var(--line)" }} />All statuses</FilterOption>
        <div className="fdd-div" />
        {ISSUE_STATES.map((status) => <FilterOption key={status} selected={filter.statuses.includes(status)} checkable onClick={() => toggleIssueStatus(status)}>
          <span className="d" style={{ background: ISSUE_STATUS_COLOR[status] }} />{status}
        </FilterOption>)}
        <div className="fdd-note">Pick one or more</div>
      </FilterDropdown>
      <FilterDropdown icon="calendar" label="Filter by date logged" value={filter.period === "all" ? "" : periodButtonLabel(filter)} active={filter.period !== "all"}>
        {({ close }) => <div className="fdd-cols">
          <div>{PERIODS.map(([value, label]) => <FilterOption key={value} selected={filter.period === value}
            onClick={() => { setIssuePeriod(value); if (!PERIODS_WITH_INPUT.includes(value)) close(); }}>{label}</FilterOption>)}</div>
          {PERIODS_WITH_INPUT.includes(filter.period) && <div className="fdd-extra"><PeriodInputs filter={filter} years={years} />
            <button type="button" className="btn sm round" style={{ marginTop: 10 }} onClick={close}><Icon name="check" />Done</button></div>}
        </div>}
      </FilterDropdown>
      <FilterDropdown icon="arrow-down-up" label="Sort" value={filter.sort === "new" ? "Most recent" : "Oldest"}>
        {({ close }) => <>
          <FilterOption selected={filter.sort === "new"} onClick={() => { patchIssueFilter({ sort: "new" }); close(); }}><Icon name="arrow-down-wide-narrow" />Most recent first</FilterOption>
          <FilterOption selected={filter.sort === "old"} onClick={() => { patchIssueFilter({ sort: "old" }); close(); }}><Icon name="arrow-up-narrow-wide" />Oldest first</FilterOption>
        </>}
      </FilterDropdown>
    </div>
    {anyFilter && <button type="button" className="btn link" onClick={clearIssueFilters} style={{ marginLeft: "auto" }}><Icon name="x" />Clear filters</button>}
  </div>;
}
