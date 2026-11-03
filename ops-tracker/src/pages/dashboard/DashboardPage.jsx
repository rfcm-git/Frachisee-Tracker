import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { RefreshCw, Table2, ChartLine, ArrowRight, ShieldCheck, Inbox, TriangleAlert, Radio } from "lucide-react";
import { api } from "../../data/index.js";
import { useQuery } from "../../hooks/useQuery.js";
import { useApp } from "../../state/appContext.js";
import { PLATFORMS, RANGES, PLATFORM_BY_ID } from "../../lib/constants.js";
import { fmtCompact, fmtMoney, fmtPct, fmtRating, fmtHours, fmtInt, fmtDay, fmtRelative } from "../../lib/format.js";
import { PageHeader } from "../../components/layout/AppShell.jsx";
import { Card, CardHeader, Skeleton, EmptyState, ErrorState, Delta, Button } from "../../components/ui/core.jsx";
import { cx } from "../../lib/cx.js";
import { FilterSelect, Segmented } from "../../components/ui/forms.jsx";
import { HealthBadge, PlatformLogo, SeverityBadge, ConnectionBadge } from "../../components/ui/badges.jsx";
import { Sparkline, TrendChart, Legend, BarList, ShareBar } from "../../components/charts/charts.jsx";

const FORMAT = { compact: fmtCompact, money: fmtMoney, pct: (v) => fmtPct(v, 2), rating: fmtRating, hours: fmtHours, int: fmtInt };
const BREACH_LABEL = { errorRate: "Error rate", rating: "Rating", downtime: "Downtime" };

/** "Error rate: DD, UE · Downtime: DD" */
function describeBreaches(breaches) {
  const by = {};
  for (const b of breaches) (by[b.metric] ??= []).push(PLATFORM_BY_ID[b.platformId].short);
  return Object.entries(by).map(([m, p]) => `${BREACH_LABEL[m]}: ${p.join(", ")}`).join(" · ");
}

function useFilters() {
  const [params, setParams] = useSearchParams();
  const range = Number(params.get("range")) || 7;
  const platform = params.get("platform") || "all";
  const franchisee = params.get("franchisee") || "all";
  const set = (key, value, fallback) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (String(value) === String(fallback)) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  return {
    range, platform, franchisee,
    setRange: (v) => set("range", v, 7),
    setPlatform: (v) => set("platform", v, "all"),
    setFranchisee: (v) => set("franchisee", v, "all"),
  };
}

export default function DashboardPage() {
  const f = useFilters();
  const { lookups } = useApp();
  const q = useQuery(() => api.getDashboard({ range: f.range, platform: f.platform, franchisee: f.franchisee }), [f.range, f.platform, f.franchisee], {
    topics: ["issues", "platforms"],
    intervalMs: 60_000,
  });
  const d = q.data;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Dashboard"
        subtitle={
          d
            ? `${d.storesInScope} stores · last ${f.range} complete days (${fmtDay(d.window.start)} – ${fmtDay(d.window.end)}) vs. the ${f.range} days before`
            : "3PD performance across your stores"
        }
      />

      {/* Filters: one row, scoping everything below */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented label="Date range" options={RANGES} value={f.range} onChange={f.setRange} />
        <FilterSelect label="Platform" value={f.platform} onChange={f.setPlatform}>
          <option value="all">All platforms</option>
          {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Franchisee" value={f.franchisee} onChange={f.setFranchisee} className="max-w-[220px]">
          <option value="all">All franchisees</option>
          {lookups.franchisees.map((x) => <option key={x} value={x}>{x}</option>)}
        </FilterSelect>
        <div className="ml-auto flex items-center gap-2 text-[12px] text-muted">
          {d && <span aria-live="polite">{q.refreshing ? "Refreshing…" : `Updated ${fmtRelative(d.live.now)}`}</span>}
          <Button size="iconSm" variant="ghost" onClick={q.reload} aria-label="Refresh dashboard" disabled={q.loading}>
            <RefreshCw className={cx("size-4", q.refreshing && "animate-spin")} aria-hidden />
          </Button>
        </div>
      </div>

      {q.error && !d ? (
        <Card><ErrorState error={q.error} onRetry={q.reload} /></Card>
      ) : (
        <div className={cx("space-y-5 transition-opacity duration-200", q.refreshing && "opacity-60")} aria-busy={q.loading || q.refreshing}>
          <LiveStrip d={d} />
          <KpiGrid kpis={d?.kpis} range={f.range} />
          <div className="grid gap-5 xl:grid-cols-3">
            <OrdersTrend d={d} className="xl:col-span-2" />
            <PlatformPanel d={d} />
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            <Watchlist d={d} className="xl:col-span-2" />
            <IssuesPanel d={d} />
          </div>
        </div>
      )}
    </div>
  );
}

function LiveStrip({ d }) {
  const navigate = useNavigate();
  if (!d)
    return (
      <Card className="flex flex-wrap items-center gap-x-10 gap-y-4 px-5 py-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-5 w-24" /></div>
        ))}
      </Card>
    );
  const { today, liveStatus, lastSync } = d.live;
  const notOnline = liveStatus.paused + liveStatus.offline;
  return (
    <Card className="flex flex-wrap items-center gap-x-10 gap-y-4 px-5 py-4" aria-label="Today so far">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-2.5 rounded-full bg-good" />
        </span>
        <div>
          <p className="text-[13px] font-semibold text-ink">Today so far</p>
          <p className="text-[12px] text-muted">Synced {lastSync ? fmtRelative(lastSync) : "–"}</p>
        </div>
      </div>
      <LiveStat label="Orders" value={fmtInt(today.orders)} />
      <LiveStat label="Net sales" value={fmtMoney(today.sales)} />
      <LiveStat label="Error rate" value={fmtPct(today.errorRate, 2)} />
      <div className="ml-auto">
        <p className="text-[12px] text-muted">Store listings right now</p>
        <button
          type="button"
          onClick={() => navigate("/stores?status=not_online")}
          className="mt-0.5 flex items-center gap-3 rounded-md text-[13px] hover:underline"
          aria-label={`${liveStatus.online} online, ${liveStatus.paused} paused, ${liveStatus.offline} offline. View stores not online.`}
        >
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-good" aria-hidden /><span className="font-semibold tnum">{liveStatus.online}</span> online</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" aria-hidden /><span className="font-semibold tnum">{liveStatus.paused}</span> paused</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-critical" aria-hidden /><span className="font-semibold tnum">{liveStatus.offline}</span> offline</span>
          {notOnline > 0 && <ArrowRight className="size-3.5 text-muted" aria-hidden />}
        </button>
      </div>
    </Card>
  );
}

function LiveStat({ label, value }) {
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="text-lg font-semibold text-ink tnum">{value}</p>
    </div>
  );
}

function KpiGrid({ kpis, range }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      {(kpis ?? Array.from({ length: 6 })).map((k, i) =>
        k ? (
          <Card key={k.key} as="article" className="flex flex-col justify-between px-4 py-3.5" aria-label={k.label}>
            <p className="text-[13px] font-medium text-ink-2">{k.label}</p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[22px] leading-none sm:text-[26px] font-semibold tracking-tight text-ink">{FORMAT[k.format](k.value)}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
                  <Delta value={k.value} prev={k.prev} goodWhen={k.goodWhen} />
                  <span>{k.note ?? `vs. prior ${range}d`}</span>
                </p>
              </div>
              {k.spark && <span className="hidden shrink-0 sm:block"><Sparkline values={k.spark} width={72} height={28} label={`${k.label} trend over ${range} days`} /></span>}
            </div>
          </Card>
        ) : (
          <Card key={i} className="space-y-3 px-4 py-3.5" aria-hidden>
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-28" />
          </Card>
        ),
      )}
    </div>
  );
}

function OrdersTrend({ d, className }) {
  const [table, setTable] = useState(false);
  const series = (d?.platforms ?? []).map((p) => ({ key: p.id, label: p.name, color: p.color }));
  return (
    <Card className={className} aria-labelledby="trend-h">
      <CardHeader
        id="trend-h"
        title="Orders by platform"
        subtitle="Daily orders, complete days only"
        actions={
          <Button size="sm" variant="ghost" icon={table ? ChartLine : Table2} onClick={() => setTable((t) => !t)} aria-pressed={table}>
            {table ? "Chart" : "Table"}
          </Button>
        }
      />
      {!d ? (
        <div className="px-5 pb-5"><Skeleton className="h-[240px] w-full" /></div>
      ) : (
        <>
          {!table && series.length > 1 && <div className="px-5 pb-1"><Legend series={series} /></div>}
          <TrendChart data={d.trend} series={series} format={fmtInt} axisFormat={fmtCompact} label="Daily orders by platform" showTable={table} />
        </>
      )}
    </Card>
  );
}

function PlatformPanel({ d }) {
  return (
    <Card aria-labelledby="plat-h">
      <CardHeader id="plat-h" title="Platform health" subtitle="Against each platform’s thresholds" actions={<Link to="/settings/platforms" className="text-[13px] font-medium text-brand-700 hover:underline">Thresholds</Link>} />
      {!d ? (
        <div className="space-y-4 px-5 pb-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="px-5 pb-5">
          {d.platforms.length > 1 && (
            <div className="mb-4">
              <p className="mb-1.5 text-[12px] text-muted">Share of orders</p>
              <ShareBar label="Share of orders" parts={d.platforms.map((p) => ({ key: p.id, label: p.name, value: p.orders, color: p.color }))} />
            </div>
          )}
          <ul className="divide-y divide-line">
            {d.platforms.map((p) => {
              const errBad = p.errorRate > p.thresholds.errorRate;
              const ratingBad = p.rating < p.thresholds.minRating;
              return (
                <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                      <PlatformLogo id={p.id} /> {p.name}
                      <span className="text-[12px] font-normal text-muted tnum">{Math.round(p.share * 100)}%</span>
                    </span>
                    {p.connection !== "connected" && <ConnectionBadge status={p.connection} />}
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
                    <div>
                      <dt className="text-muted">Orders</dt>
                      <dd className="font-semibold text-ink tnum">{fmtCompact(p.orders)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Error rate</dt>
                      <dd className={cx("flex items-center gap-1 font-semibold tnum", errBad ? "text-critical-ink" : "text-ink")}>
                        {errBad && <TriangleAlert className="size-3.5" aria-label="Above threshold" />}
                        {fmtPct(p.errorRate, 2)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Rating</dt>
                      <dd className={cx("flex items-center gap-1 font-semibold tnum", ratingBad ? "text-critical-ink" : "text-ink")}>
                        {ratingBad && <TriangleAlert className="size-3.5" aria-label="Below threshold" />}
                        {fmtRating(p.rating)}
                      </dd>
                    </div>
                  </dl>
                  {p.notOnline > 0 && (
                    <p className="mt-2 text-[12px] text-ink-2">
                      <Radio className="mr-1 inline size-3.5 text-serious-ink" aria-hidden />
                      {p.notOnline} {p.notOnline === 1 ? "store" : "stores"} paused or offline now
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Watchlist({ d, className }) {
  const navigate = useNavigate();
  return (
    <Card className={className} aria-labelledby="watch-h">
      <CardHeader
        id="watch-h"
        title="Stores to watch"
        subtitle={d ? `${d.watchlist.length} of ${d.storesInScope} stores outside a threshold this period` : "Stores outside a threshold"}
        actions={<Link to="/stores?health=critical" className="text-[13px] font-medium text-brand-700 hover:underline">All stores</Link>}
      />
      {!d ? (
        <div className="space-y-2 px-5 pb-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : d.watchlist.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Every store is within its thresholds">
          Nothing needs a follow-up for this period. Widen the date range to check for slower trends.
        </EmptyState>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Stores outside a threshold, worst first</caption>
            <thead>
              <tr className="border-y border-line bg-subtle text-left text-[12px] text-muted">
                <th scope="col" className="px-5 py-2 font-medium">Store</th>
                <th scope="col" className="px-3 py-2 font-medium">Health</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Error rate</th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Rating</th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Downtime</th>
                <th scope="col" className="px-5 py-2 text-right font-medium">Open issues</th>
              </tr>
            </thead>
            <tbody>
              {d.watchlist.slice(0, 7).map(({ store, health, m, openIssues }) => (
                <tr
                  key={store.id}
                  onClick={() => navigate(`/stores/${store.id}`)}
                  className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-subtle"
                >
                  <td className="px-5 py-2.5">
                    <Link to={`/stores/${store.id}`} className="font-medium text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                      #{store.number} {store.name}
                    </Link>
                    <p className="text-[12px] text-muted">
                      {store.franchisee} · {describeBreaches(health.breaches)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5"><HealthBadge level={health.level} /></td>
                  <td className="px-3 py-2.5 text-right tnum">{fmtPct(m.errorRate, 2)}</td>
                  <td className="hidden px-3 py-2.5 text-right tnum sm:table-cell">{fmtRating(m.rating)}</td>
                  <td className="hidden px-3 py-2.5 text-right tnum sm:table-cell">{fmtHours(m.downtimeMin)}</td>
                  <td className="px-5 py-2.5 text-right tnum">{openIssues || <span className="text-muted">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function IssuesPanel({ d }) {
  const navigate = useNavigate();
  return (
    <Card aria-labelledby="iss-h" className="flex flex-col">
      <CardHeader
        id="iss-h"
        title="Open issues"
        subtitle={d ? `${d.openIssueCount} open · ${d.criticalOpen} critical` : "By category"}
        actions={<Link to="/issues" className="text-[13px] font-medium text-brand-700 hover:underline">View all</Link>}
      />
      {!d ? (
        <div className="space-y-3 px-5 pb-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : d.openIssueCount === 0 ? (
        <EmptyState icon={Inbox} title="No open issues">Flagged issues for these stores will show here.</EmptyState>
      ) : (
        <div className="space-y-5 px-5 pb-5">
          <BarList
            label="Open issues by category"
            items={d.issueCategories.slice(0, 5).map((c) => ({ label: c.category, value: c.count }))}
            onSelect={(it) => navigate(`/issues?category=${encodeURIComponent(it.label)}`)}
          />
          <div>
            <p className="mb-2 text-[12px] font-medium text-muted">Most urgent</p>
            <ul className="space-y-1">
              {d.recentIssues.slice(0, 4).map((i) => (
                <li key={i.id}>
                  <Link to={`/issues/${i.id}`} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[13px] hover:bg-subtle">
                    <PlatformLogo id={i.platformId} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-ink">{i.title}</span>
                    <SeverityBadge severity={i.severity} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
