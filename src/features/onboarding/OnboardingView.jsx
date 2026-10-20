import { useMemo, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import FilterDropdown, { FilterOption } from "../../components/ui/FilterMenu.jsx";
import { DescPreview, EmptyState, InfoTip, ObPlatformTag, ObStatusBadge, StoreStatusIfClosed } from "../../components/ui/common.jsx";
import { clickableProps } from "../../components/ui/clickable.js";
import { usePaged } from "../../hooks/usePaged.js";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { OB_PLATFORMS, OB_STATES, OB_STATUS_COLOR } from "../../config/constants.js";
import { franchiseeName } from "../../domain/context.js";
import { obHistory, obIsOpen, obPlatformName, obShortLabel, obStatusClass } from "../../domain/onboarding.js";
import { storeStatus } from "../../domain/records.js";
import { searchQuery } from "../../domain/search.js";
import { formatNumber, formatTimestamp } from "../../lib/format.js";
import { oneLine, richHtml } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openOnboardingDetails, openOnboardingHistory, openStore, openUpdateOnboarding } from "../../state/dialogs.js";
import { toast } from "../../state/toastStore.js";
import { clearObFilters, setObSort, toggleObCell, toggleObFilter, toggleObOnlyPlatform, useUiStore } from "../../state/uiStore.js";
import { askDeleteOnboarding } from "./onboardingActions.js";
import { filterOnboarding, progressModel } from "./onboardingSelectors.js";

function StatusFilter({ icon, label, name, values }) {
  return <FilterDropdown icon={icon} label={label} value={values.map(obShortLabel).join(", ")} active={values.length > 0}>
    <FilterOption selected={!values.length} onClick={() => toggleObFilter(name, "")}>All statuses</FilterOption><div className="fdd-div" />
    {OB_STATES.map((status) => <FilterOption key={status} selected={values.includes(status)} checkable onClick={() => toggleObFilter(name, status)}>
      <span className={`sst-dot ${obStatusClass(status)}-dot`} />{status}</FilterOption>)}
    <div className="fdd-note">Pick one or more</div>
  </FilterDropdown>;
}

function OnboardingFilters({ filter, anyFilter }) {
  return <div className="ifbar"><div className="grp fdd-grp">
    <FilterDropdown icon="layers" label="Platform" value={filter.platforms.map(obPlatformName).join(", ")} active={filter.platforms.length > 0}>
      <FilterOption selected={!filter.platforms.length} onClick={() => toggleObFilter("platforms", "")}>All platforms</FilterOption><div className="fdd-div" />
      {OB_PLATFORMS.map(([key, name]) => <FilterOption key={key} selected={filter.platforms.includes(key)} checkable onClick={() => toggleObFilter("platforms", key)}>{name}</FilterOption>)}
    </FilterDropdown>
    <StatusFilter icon="bike" label="3PD status" name="threePd" values={filter.threePd} />
    <StatusFilter icon="utensils" label="ezCater status" name="ezCater" values={filter.ezCater} />
    <FilterDropdown icon="arrow-down-up" label="Sort" value={filter.sort === "new" ? "Most recent" : "Oldest"}>
      {({ close }) => <>
        <FilterOption selected={filter.sort === "new"} onClick={() => { setObSort("new"); close(); }}><Icon name="arrow-down-wide-narrow" />Most recent first</FilterOption>
        <FilterOption selected={filter.sort === "old"} onClick={() => { setObSort("old"); close(); }}><Icon name="arrow-up-narrow-wide" />Oldest first</FilterOption>
      </>}
    </FilterDropdown>
  </div>
    <InfoTip text="Platform narrows to the picked apps. 3PD status applies to Uber Eats, DoorDash and Grubhub; ezCater status applies to ezCater. If you set a status filter, only those records show — set both to see both." />
    {anyFilter && <button type="button" className="btn link" onClick={clearObFilters} style={{ marginLeft: "auto" }}><Icon name="x" />Clear filters</button>}
  </div>;
}

function ProgressMatrix({ model }) {
  return <div className="ob-matrix card"><div className="ob-ph"><Icon name="table-2" /><b>Progress by platform</b><span className="muted">all records · not affected by filters</span></div>
    <div style={{ overflowX: "auto" }}><table><thead><tr><th>Platform</th>
      {OB_STATES.map((status) => <th key={status} data-tip={status}><span className={`badge ${obStatusClass(status)}`}>{obShortLabel(status)}</span></th>)}<th>Total</th></tr></thead>
      <tbody>{model.platforms.map((platform) => <tr key={platform.key}><td><ObPlatformTag platform={platform.key} /></td>
        {platform.statuses.map((item) => {
          const tip = `${platform.name} · ${item.status}: ${item.count}${item.count ? (item.active ? " — click again to clear" : " — click to filter the table") : ""}`;
          return <td key={item.status} className={`${item.count ? "click" : ""}${item.active ? " on" : ""}`} data-tip={tip}
            {...(item.count ? { ...clickableProps(() => toggleObCell(platform.key, item.status)), "aria-pressed": item.active } : {})}>
            {item.count ? <span className={`badge ${obStatusClass(item.status)}`}>{item.count}</span> : <span className="muted">0</span>}
          </td>;
        })}<td><b>{platform.total}</b></td></tr>)}
        <tr className="ob-tot"><td><b>All platforms</b></td>{OB_STATES.map((status) => <td key={status}><b>{model.totals[status]}</b></td>)}<td><b>{model.total}</b></td></tr>
      </tbody>
    </table></div>
  </div>;
}

function ProgressChart({ model }) {
  const circumference = 2 * Math.PI * 34;
  const filled = (model.percent / 100) * circumference;
  return <div className="ob-chart card"><div className="ob-ph"><Icon name="bar-chart-3" /><b>Progress chart</b>
    <InfoTip text="Share of each status per platform, from all onboarding records. Click a colored part to filter the table." /></div>
    <div className="ob-cbody">
      <div className="ob-ring" data-tip={`${model.done} of ${model.total} store + platform records are Onboarded`}>
        <svg viewBox="0 0 84 84" width="84" height="84" style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
          <circle cx="42" cy="42" r="34" fill="none" stroke="#e8eee3" strokeWidth="10" />
          <circle cx="42" cy="42" r="34" fill="none" stroke="var(--ok)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${filled} ${circumference - filled}`} />
        </svg><div><b>{model.percent}%</b><span>onboarded</span></div>
      </div>
      <div className="ob-bars">{model.platforms.map((platform) => <div className="ob-bar" key={platform.key}>
        <div className="ob-bl"><ObPlatformTag platform={platform.key} />
          <span className="muted">{platform.total ? `${Math.round((platform.done / platform.total) * 100)}% onboarded · ${platform.done}/${platform.total}` : "no records"}</span></div>
        <div className="ob-track">{platform.statuses.filter((item) => item.count > 0).map((item) => <span key={item.status}
          className={`seg${item.active ? " on" : ""}`} style={{ width: `${(item.count / platform.total) * 100}%`, background: item.color }}
          data-tip={`${platform.name} · ${item.status}: ${item.count} (${Math.round((item.count / platform.total) * 100)}%) — click to filter the table`}
          {...clickableProps(() => toggleObCell(platform.key, item.status))} />)}</div>
      </div>)}
        <div className="db-key">{OB_STATES.map((status) => <span key={status}><i style={{ background: OB_STATUS_COLOR[status] }} />{status}</span>)}</div>
      </div>
    </div>
  </div>;
}

const OB_ABBR = { ue: "UE", dd: "DD", gh: "GH", ez: "Ez" };

/** Records per platform in the current (searched and filtered) list; click to show only that platform. */
function PlatformCounts({ records, platforms }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedPlatform = platforms.length === 1 ? OB_ABBR[platforms[0]] : null;

  const closeIfInactive = (event) => {
    if (!event.currentTarget.matches(":hover") && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  };

  return <div className={`ob-hcnt${open ? " open" : ""}`} ref={rootRef} role="group" aria-label="Filter by platform"
    onMouseEnter={() => setOpen(true)}
    onMouseLeave={() => {
      if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
    }}
    onFocus={() => setOpen(true)}
    onBlur={closeIfInactive}
    onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    }}>
    <button type="button" className={`ob-hc ob-hc-trigger${selectedPlatform ? " on" : ""}`}
      aria-expanded={open} aria-controls="ob-platform-counts"
      onClick={(event) => setOpen(event.currentTarget.matches(":hover") ? true : !open)}>
      {selectedPlatform || "Platforms"}<Icon name="chevron-down" />
    </button>
    {open && <div className="ob-hc-menu" id="ob-platform-counts" aria-label="Platform record counts">
      {OB_PLATFORMS.map(([key, name]) => {
        const count = records.filter((record) => record.platform === key).length;
        const on = platforms.length === 1 && platforms[0] === key;
        const tip = `${name}: ${count} record${count !== 1 ? "s" : ""} in the current list${on ? " — click to show all platforms" : ` — click to show only ${name}`}`;
        return <button type="button" key={key} className={`ob-hc p-${key}${count ? "" : " zero"}${on ? " on" : ""}`} data-tip={tip} aria-pressed={on}
          onClick={() => toggleObOnlyPlatform(key)}><b>{OB_ABBR[key]}</b>{count}</button>;
      })}
    </div>}
  </div>;
}

function RecordTable({ ctx, records, platforms }) {
  const { items, pagerProps } = usePaged("ob", records);
  return <div className="card" style={{ overflowX: "auto" }}><table className="is-table ob-table"><thead><tr>
    <th className="c-status">Status</th><th className="ob-updcol">Updates</th><th className="c-issue">Issue <PlatformCounts records={records} platforms={platforms} /></th><th className="c-store">Store Number</th><th className="hide-sm c-logged">Logged</th><th className="c-act">Actions</th>
  </tr></thead><tbody>
    {items.map((record) => {
      const store = ctx.storeByNum.get(String(record.store_num || ""));
      const owner = franchiseeName(ctx, store ? store.franchisee_id : record.franchisee_id);
      const size = record.group_id ? ctx.onboarding.filter((item) => item.group_id === record.group_id).length : 1;
      const steps = obHistory(record).length;
      return <tr key={record.id}>
        <td className="c-status"><ObStatusBadge status={record.status} /></td>
        <td className="ob-updcol"><div className="ob-upd">
          <button type="button" className="upd-pill" data-tip={`View all updates (${steps} step${steps === 1 ? "" : "s"})`} onClick={() => openOnboardingHistory(record.id)}><Icon name="history" />{steps}</button>
          <span className="ob-last">{record.last_update ? oneLine(record.last_update, 90) : <span className="muted">No updates yet</span>}</span>
        </div></td>
        <td className="c-issue"><div className="ic-top"><ObPlatformTag platform={record.platform} />
          {size > 1 && <span className="mtag" title={`Created in one request with ${size - 1} other store/platform item${size > 2 ? "s" : ""}`}><Icon name="layers" />Request · {size}</span>}
        </div>
          <DescPreview html={record.details ? richHtml(record.details) : '<span class="muted">Onboarding request</span>'} onOpen={() => openOnboardingDetails(record.id)} />
        </td>
        <td className="c-store"><button type="button" className="ob-snum" data-tip="Open store information"
          onClick={() => (store ? openStore(store.id) : toast(`Store ${record.store_num} is not in the store list`, "err"))}>{record.store_num || ""}</button>
          <div className="muted" style={{ fontSize: 11.5 }}>{owner || "—"}</div>
          {store && storeStatus(store) !== "Open" && <div style={{ marginTop: 3 }}><StoreStatusIfClosed status={storeStatus(store)} /></div>}
        </td>
        <td className="hide-sm muted c-logged" style={{ fontSize: 12 }}>{formatTimestamp(record.created_at)}
          {record.updated_at && record.updated_at !== record.created_at && <><br />upd. {formatTimestamp(record.updated_at)}</>}</td>
        <td className="c-act"><div className="row-acts">
          <button type="button" className="iconbtn mini" data-tip="Update status / add progress" aria-label="Update" onClick={() => openUpdateOnboarding(record.id)}><Icon name="refresh-cw" /></button>
          <button type="button" className="iconbtn mini del" data-tip="Delete this store + platform record" aria-label="Delete" onClick={() => askDeleteOnboarding(record.id)}><Icon name="trash-2" /></button>
        </div></td>
      </tr>;
    })}
  </tbody></table>
    <Pagination {...pagerProps} />
  </div>;
}

export default function OnboardingView() {
  const ctx = useDataContext();
  const filter = useUiStore((state) => state.obFilter);
  const search = useUiStore((state) => state.search);
  const records = useMemo(() => filterOnboarding(ctx, filter, searchQuery(search)), [ctx, filter, search]);
  const model = useMemo(() => progressModel(ctx, filter), [ctx, filter]);
  const open = records.filter(obIsOpen).length;
  useToolbarCount(ctx.onboardingReady ? `${formatNumber(records.length)} record${records.length !== 1 ? "s" : ""} · ${formatNumber(open)} open` : "");

  if (!ctx.onboardingReady) return <EmptyState icon="database" title="Onboarding needs a quick database update">Run migrate-onboarding.sql in the Supabase SQL Editor, then click Refresh. Your Concerns are not affected.</EmptyState>;
  const anyFilter = !!(filter.platforms.length || filter.threePd.length || filter.ezCater.length || search.trim());
  const progress = <div className="ob-prog"><ProgressMatrix model={model} /><ProgressChart model={model} /></div>;

  return <>
    <OnboardingFilters filter={filter} anyFilter={anyFilter} />
    {!ctx.onboarding.length ? <EmptyState icon="rocket" title="No onboarding yet">Click “New onboarding” to start one for one or more stores and platforms.</EmptyState>
      : !records.length ? <>{progress}<EmptyState icon="search-x" title="No onboarding matches">Try a different search or filter.</EmptyState></>
        : <>{progress}<RecordTable ctx={ctx} records={records} platforms={filter.platforms} /></>}
  </>;
}
