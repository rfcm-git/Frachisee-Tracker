import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Plus, Phone, MapPin, Mail, TriangleAlert, Inbox, SearchX, Table2, ChartLine } from "lucide-react";
import { api } from "../../data/index.js";
import { useQuery } from "../../hooks/useQuery.js";
import { useApp } from "../../state/appContext.js";
import { RANGES, ROLE_BY_ID, OPEN_STATUSES } from "../../lib/constants.js";
import { fmtInt, fmtCompact, fmtMoney, fmtPct, fmtRating, fmtHours, fmtDec, fmtRelative } from "../../lib/format.js";
import { PageHeader } from "../../components/layout/AppShell.jsx";
import { Button, Card, CardHeader, Delta, EmptyState, ErrorState, Skeleton, Avatar } from "../../components/ui/core.jsx";
import { cx } from "../../lib/cx.js";
import { Segmented } from "../../components/ui/forms.jsx";
import { HealthBadge, ConnectionBadge, PlatformLogo, SeverityBadge, StatusBadge } from "../../components/ui/badges.jsx";
import { TrendChart, Legend } from "../../components/charts/charts.jsx";

export default function StoreProfilePage() {
  const { storeId } = useParams();
  const { openFlagIssue } = useApp();
  const [range, setRange] = useState(30);
  const q = useQuery(() => api.getStore(storeId, { range }), [storeId, range], { topics: ["issues", "platforms"] });
  const d = q.data;

  const back = (
    <Link to="/stores" className="mb-2 inline-flex items-center gap-1 rounded text-[13px] font-medium text-muted hover:text-ink">
      <ChevronLeft className="size-4" aria-hidden /> Stores
    </Link>
  );

  if (q.error) return <Card><ErrorState error={q.error} onRetry={q.reload} /></Card>;
  if (d === null)
    return (
      <div className="animate-fade-up">
        <PageHeader title="Store not found" breadcrumb={back} />
        <Card><EmptyState icon={SearchX} title="We couldn't find this store" action={<Link to="/stores" className="font-medium text-brand-700 hover:underline">Browse all stores</Link>}>It may have been removed from the 3PD program.</EmptyState></Card>
      </div>
    );

  const s = d?.store;
  return (
    <div className="animate-fade-up">
      <PageHeader
        breadcrumb={back}
        title={s ? <>#{s.number} <span className="font-normal text-ink-2">{s.name}</span></> : <Skeleton className="h-7 w-72" />}
        subtitle={s ? `${s.franchisee} · ${s.region}` : undefined}
        actions={
          <>
            <Segmented label="Metrics period" options={RANGES} value={range} onChange={setRange} />
            <Button variant="primary" icon={Plus} onClick={() => openFlagIssue({ storeId })} disabled={!s}>Flag issue</Button>
          </>
        }
      />

      <div className={cx("space-y-5 transition-opacity", q.refreshing && "opacity-60")}>
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Card className="col-span-2 flex flex-col justify-center gap-2 px-4 py-3.5 lg:col-span-1">
            <p className="text-[13px] font-medium text-ink-2">Health</p>
            {d ? (
              <>
                <HealthBadge level={d.health.level} />
                <p className="text-[12px] text-muted">{d.health.breaches.length ? `${d.health.breaches.length} threshold ${d.health.breaches.length === 1 ? "breach" : "breaches"}` : "Within all thresholds"}</p>
              </>
            ) : <Skeleton className="h-6 w-24" />}
          </Card>
          {[
            ["Orders", "orders", fmtCompact, "up"],
            ["Net sales", "sales", fmtMoney, "up"],
            ["Error rate", "errorRate", (v) => fmtPct(v, 2), "down"],
            ["Avg. rating", "rating", fmtRating, "up"],
          ].map(([label, key, fmt, good]) => (
            <Card key={key} className="px-4 py-3.5">
              <p className="text-[13px] font-medium text-ink-2">{label}</p>
              {d ? (
                <>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{fmt(d.totals[key])}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted"><Delta value={d.totals[key]} prev={d.prevTotals[key]} goodWhen={good} /> vs. prior {range}d</p>
                </>
              ) : (
                <div className="mt-2 space-y-2"><Skeleton className="h-7 w-20" /><Skeleton className="h-3 w-24" /></div>
              )}
            </Card>
          ))}
        </div>

        {/* Per-platform */}
        <section aria-labelledby="pp-h">
          <h2 id="pp-h" className="mb-3 text-[15px] font-semibold text-ink">Platform performance</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {(d?.platforms ?? [0, 1, 2]).map((p, i) =>
              !d ? (
                <Card key={i} className="space-y-3 p-4"><Skeleton className="h-6 w-32" /><Skeleton className="h-24 w-full" /></Card>
              ) : (
                <PlatformCard key={p.id} p={p} range={range} />
              ),
            )}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <StoreTrend d={d} />
          <ErrorTrend d={d} />
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <StoreIssues d={d} storeId={storeId} className="xl:col-span-2" />
          <TeamCard d={d} />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, bad, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={cx("flex items-center gap-1 text-[13px] font-semibold tnum", bad ? "text-critical-ink" : "text-ink")}>
        {bad && <TriangleAlert className="size-3.5" aria-hidden />}
        {value}
        {hint && <span className={cx("text-[11px] font-normal", bad ? "text-critical-ink" : "text-muted")}>{hint}</span>}
      </dd>
    </div>
  );
}

function PlatformCard({ p, range }) {
  const m = p.m;
  const th = p.thresholds;
  const perDay = m ? m.downtimeMin / range : 0;
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold text-ink"><PlatformLogo id={p.id} size="lg" />{p.name}</span>
        <ConnectionBadge status={p.connection?.status} />
      </div>
      <p className="mb-2 text-[12px] text-muted">Listing ID <span className="tnum">{p.connection?.externalId ?? "–"}</span></p>
      {!m ? (
        <p className="py-4 text-[13px] text-muted">No orders on {p.name} in this period.</p>
      ) : (
        <dl className="divide-y divide-line">
          <Metric label="Orders" value={fmtInt(m.orders)} />
          <Metric label="Error rate" value={fmtPct(m.errorRate, 2)} bad={m.errorRate > th.errorRate} hint={`max ${fmtPct(th.errorRate, 1)}`} />
          <Metric label="Rating" value={fmtRating(m.rating)} bad={m.rating < th.minRating} hint={`min ${th.minRating.toFixed(1)}`} />
          <Metric label="Downtime / day" value={fmtHours(perDay)} bad={perDay > th.downtimeMin} hint={`max ${fmtHours(th.downtimeMin)}`} />
          <Metric label="Avg. prep time" value={`${fmtDec(m.prepMin)} min`} />
          <Metric label="Avg. order" value={fmtMoney(m.aov)} />
        </dl>
      )}
    </Card>
  );
}

function StoreTrend({ d }) {
  const [table, setTable] = useState(false);
  const series = (d?.platforms ?? []).map((p) => ({ key: p.id, label: p.name, color: p.color }));
  return (
    <Card>
      <CardHeader title="Daily orders" subtitle="By platform" actions={<Button size="sm" variant="ghost" icon={table ? ChartLine : Table2} onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? "Chart" : "Table"}</Button>} />
      {!d ? <div className="px-5 pb-5"><Skeleton className="h-[220px] w-full" /></div> : (
        <>
          {!table && <div className="px-5 pb-1"><Legend series={series} /></div>}
          <TrendChart data={d.trend} series={series} height={220} format={fmtInt} label="Daily orders by platform for this store" showTable={table} />
        </>
      )}
    </Card>
  );
}

function ErrorTrend({ d }) {
  const [table, setTable] = useState(false);
  const series = [{ key: "value", label: "Error rate", color: "var(--color-ink-2)" }];
  return (
    <Card>
      <CardHeader title="Order error rate" subtitle="All platforms, daily" actions={<Button size="sm" variant="ghost" icon={table ? ChartLine : Table2} onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? "Chart" : "Table"}</Button>} />
      {!d ? <div className="px-5 pb-5"><Skeleton className="h-[220px] w-full" /></div> : (
        <TrendChart data={d.errorTrend} series={series} height={244} format={(v) => fmtPct(v, 2)} axisFormat={(v) => fmtPct(v, Number.isInteger(Math.round(v * 1e6) / 1e4) ? 0 : 1)} label="Daily order error rate for this store" showTable={table} />
      )}
    </Card>
  );
}

function StoreIssues({ d, storeId, className }) {
  const { openFlagIssue } = useApp();
  const open = d?.issues.filter((i) => OPEN_STATUSES.includes(i.status)) ?? [];
  const recent = d?.issues.slice(0, 8) ?? [];
  return (
    <Card className={className}>
      <CardHeader
        title="Issues"
        subtitle={d ? `${open.length} open · ${d.issues.length} total` : undefined}
        actions={d?.issues.length ? <Link to={`/issues?status=all&q=${encodeURIComponent(d.store.number)}`} className="text-[13px] font-medium text-brand-700 hover:underline">See all</Link> : null}
      />
      {!d ? <div className="space-y-2 px-5 pb-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : recent.length === 0 ? (
        <EmptyState icon={Inbox} title="No issues for this store" action={<Button icon={Plus} onClick={() => openFlagIssue({ storeId })}>Flag issue</Button>}>
          Anything flagged for this store will be listed here with its status.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {recent.map((i) => (
            <li key={i.id}>
              <Link to={`/issues/${i.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-subtle">
                <PlatformLogo id={i.platformId} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{i.title}</span>
                  <span className="text-[12px] text-muted">{i.id} · {i.category} · {fmtRelative(i.createdAt)}</span>
                </span>
                <SeverityBadge severity={i.severity} />
                <StatusBadge status={i.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TeamCard({ d }) {
  const s = d?.store;
  return (
    <Card>
      <CardHeader title="Store & team" />
      {!d ? <div className="space-y-3 px-5 pb-5"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : (
        <div className="space-y-4 px-5 pb-5 text-[13px]">
          <ul className="space-y-2 text-ink-2">
            <li className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />{s.address}</li>
            <li className="flex gap-2"><Phone className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /><a href={`tel:${s.phone}`} className="hover:underline">{s.phone}</a></li>
          </ul>
          <ul className="space-y-3 border-t border-line pt-4">
            {[["FBC", d.team.fbc], ["Area coach", d.team.areaCoach], ["OM", d.team.om]].map(([role, u]) => u && (
              <li key={role} className="flex items-center gap-3">
                <Avatar name={u.name} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{u.name}</p>
                  <p className="text-[12px] text-muted">{role === "FBC" ? ROLE_BY_ID.fbc.label : role}</p>
                </div>
                <a href={`mailto:${u.email}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink" aria-label={`Email ${u.name}`}><Mail className="size-4" aria-hidden /></a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
