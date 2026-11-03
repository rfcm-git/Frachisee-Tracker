import { useNavigate } from "react-router-dom";
import { SearchX } from "lucide-react";
import { api } from "../../data/index.js";
import { useQuery } from "../../hooks/useQuery.js";
import { useUrlState } from "../../hooks/useUrlState.js";
import { rowKeyDown } from "../../hooks/useRowNav.js";
import { useApp } from "../../state/appContext.js";
import { PLATFORM_BY_ID } from "../../lib/constants.js";
import { fmtInt, fmtPct, fmtRating } from "../../lib/format.js";
import { PageHeader } from "../../components/layout/AppShell.jsx";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../../components/ui/core.jsx";
import { cx } from "../../lib/cx.js";
import { FilterSelect, SearchInput, Segmented } from "../../components/ui/forms.jsx";
import { HealthBadge, PlatformLogo } from "../../components/ui/badges.jsx";

const DEFAULTS = { q: "", franchisee: "all", region: "all", health: "all", status: "all", range: "7" };
const DOT = { online: "bg-good", paused: "bg-warning", offline: "bg-critical", not_listed: "bg-line-strong" };
const STATUS_TEXT = { online: "online", paused: "paused", offline: "offline", not_listed: "not listed" };

export default function StoresPage() {
  const navigate = useNavigate();
  const { lookups } = useApp();
  const [f, setF, reset] = useUrlState(DEFAULTS);
  const range = Number(f.range);
  const q = useQuery(() => api.listStores({ search: f.q, franchisee: f.franchisee, region: f.region, health: f.health, range }), [f.q, f.franchisee, f.region, f.health, range], { topics: ["platforms"] });
  const rows = (q.data ?? []).filter((r) => f.status === "all" || r.connections.some((c) => c.status === "paused" || c.status === "offline"));
  const filtered = f.q || f.franchisee !== "all" || f.region !== "all" || f.health !== "all" || f.status !== "all";

  return (
    <div className="animate-fade-up">
      <PageHeader title="Stores" subtitle="Every store with a 3PD listing, its live status and recent performance" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} label="Search stores" placeholder="Store #, city or franchisee" className="w-full sm:w-64" />
        <FilterSelect label="Franchisee" value={f.franchisee} onChange={(v) => setF({ franchisee: v })} className="max-w-[210px]">
          <option value="all">All franchisees</option>
          {lookups.franchisees.map((x) => <option key={x} value={x}>{x}</option>)}
        </FilterSelect>
        <FilterSelect label="Region" value={f.region} onChange={(v) => setF({ region: v })}>
          <option value="all">All regions</option>
          <option value="Orange County">Orange County</option>
          <option value="Los Angeles">Los Angeles</option>
        </FilterSelect>
        <FilterSelect label="Health" value={f.health} onChange={(v) => setF({ health: v })}>
          <option value="all">Any health</option>
          <option value="critical">At risk</option>
          <option value="watch">Watch</option>
          <option value="good">Healthy</option>
        </FilterSelect>
        <FilterSelect label="Listing status" value={f.status} onChange={(v) => setF({ status: v })}>
          <option value="all">Any listing status</option>
          <option value="not_online">Paused or offline now</option>
        </FilterSelect>
        {filtered && <Button size="sm" variant="ghost" onClick={() => reset("range")}>Clear filters</Button>}
        <div className="ml-auto"><Segmented label="Metrics period" options={[{ id: "7", label: "7d" }, { id: "30", label: "30d" }, { id: "90", label: "90d" }]} value={f.range} onChange={(v) => setF({ range: v })} /></div>
      </div>

      <Card className={cx("overflow-hidden transition-opacity", q.refreshing && "opacity-70")}>
        {q.error ? (
          <ErrorState error={q.error} onRetry={q.reload} />
        ) : !q.data ? (
          <div className="space-y-2 p-5">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title="No stores match" action={<Button onClick={() => reset("range")}>Clear filters</Button>}>
            Check the store number, or clear the health and status filters.
          </EmptyState>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-[13px]">
              <caption className="sr-only">Stores, with {range}-day metrics. Use arrow keys to move between rows and Enter to open a store.</caption>
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[12px] text-muted">
                  <th scope="col" className="px-5 py-2.5 font-medium">Store</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Health</th>
                  <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">Listings now</th>
                  <th scope="col" className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Orders</th>
                  <th scope="col" className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Error rate</th>
                  <th scope="col" className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Rating</th>
                  <th scope="col" className="hidden px-5 py-2.5 text-right font-medium lg:table-cell">Open issues</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ store, m, health, openIssues, connections }) => (
                  <tr
                    key={store.id}
                    data-row
                    tabIndex={0}
                    aria-label={`Store ${store.number}, ${store.name}`}
                    onClick={() => navigate(`/stores/${store.id}`)}
                    onKeyDown={(e) => rowKeyDown(e, () => navigate(`/stores/${store.id}`))}
                    className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-subtle focus-visible:bg-brand-50 focus-visible:outline-none"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink"><span className="tnum">#{store.number}</span> {store.name}</p>
                      <p className="text-[12px] text-muted">{store.franchisee} · {store.region}</p>
                    </td>
                    <td className="px-3 py-3"><HealthBadge level={health.level} /></td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      <ul className="flex items-center gap-3">
                        {connections.map((c) => (
                          <li key={c.platformId} className="inline-flex items-center gap-1" title={`${PLATFORM_BY_ID[c.platformId].name}: ${STATUS_TEXT[c.status]}`}>
                            <PlatformLogo id={c.platformId} size="sm" />
                            <span className={cx("size-2 rounded-full", DOT[c.status])} aria-hidden />
                            <span className="sr-only">{PLATFORM_BY_ID[c.platformId].name} {STATUS_TEXT[c.status]}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="hidden px-3 py-3 text-right tnum sm:table-cell">{fmtInt(m?.orders)}</td>
                    <td className="hidden px-3 py-3 text-right tnum sm:table-cell">{fmtPct(m?.errorRate, 2)}</td>
                    <td className="hidden px-3 py-3 text-right tnum lg:table-cell">{fmtRating(m?.rating)}</td>
                    <td className="hidden px-5 py-3 text-right tnum lg:table-cell">{openIssues || <span className="text-muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {q.data && <p className="mt-3 text-[12px] text-muted">{rows.length} of {lookups.stores.length} stores · metrics cover the last {range} complete days</p>}
    </div>
  );
}
