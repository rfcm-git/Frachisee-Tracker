/* Small SVG/CSS charts used on the dashboard and in Call Logs insights. */
import Icon from "../ui/Icon.jsx";
import { InfoTip } from "../ui/common.jsx";
import { clickableProps } from "../ui/clickable.js";
import { formatNumber, percent } from "../../lib/format.js";

export function DashboardCard({ title, icon, tip, className = "", children }) {
  return <section className={`db-card ${className}`}>
    <header><Icon name={icon} /><h3>{title}</h3>{tip && <InfoTip text={tip} />}</header>
    <div className="db-body">{children}</div>
  </section>;
}

/** Props that make a chart part clickable when it has an action. */
const actionProps = (act, onSelect) => (act && onSelect ? clickableProps(() => onSelect(act)) : {});

/**
 * Horizontal bars. rows: [{ label, value, color, tip, act }] or [{ label, parts: [{ label, value, color, act }] }]
 * full: each stacked row fills the width. valueMode: "count" | "coverage" (count + % of liveCount) | "platform" (% active)
 * onSelect(act) is called when a bar with an action is clicked.
 */
export function HorizontalBars({ rows, full = false, empty = "No data yet", liveCount = 0, valueMode = "count", onSelect }) {
  if (!rows.length) return <div className="db-empty">{empty}</div>;
  const max = Math.max(1, ...rows.map((row) => (row.parts ? row.parts.reduce((sum, part) => sum + part.value, 0) : row.value)));
  return <div className="db-hb">{rows.map((row) => {
    const total = row.parts ? row.parts.reduce((sum, part) => sum + part.value, 0) : row.value;
    const base = full ? total : max;
    let value;
    if (valueMode === "coverage") value = <>{formatNumber(total)}<small> {percent(total, liveCount)}%</small></>;
    else if (valueMode === "platform") value = <small>{percent(row.parts?.[0]?.value || 0, total)}% active</small>;
    else value = formatNumber(total);
    return <div key={row.label} className="db-hr">
      <span className="l" title={row.label}>{row.label}</span>
      <span className="track">
        {row.parts
          ? row.parts.map((part) => (part.value ? <span key={part.label} className={`seg${part.act ? " click" : ""}`}
            style={{ width: `${(part.value / Math.max(1, base)) * 100}%`, background: part.color }}
            data-tip={`${row.label} · ${part.label}: ${formatNumber(part.value)}${total ? ` (${percent(part.value, total)}%)` : ""}`}
            {...actionProps(part.act, onSelect)} /> : null))
          : <span className={`seg${row.act ? " click" : ""}`} style={{ width: `${(row.value / max) * 100}%`, background: row.color || "var(--green)" }}
            data-tip={row.tip || `${row.label}: ${formatNumber(row.value)}`} {...actionProps(row.act, onSelect)} />}
      </span>
      <b className="v">{value}</b>
    </div>;
  })}</div>;
}

/** Donut with a legend. segments: [{ label, value, color, tip, act }] */
export function DonutChart({ segments, center, sub, onSelect }) {
  const size = 150;
  const thickness = 22;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let offset = 0;
  const arcs = total ? segments.filter((segment) => segment.value > 0).map((segment) => {
    const length = (segment.value / total) * circumference;
    const arc = { ...segment, length, offset };
    offset += length;
    return arc;
  }) : [];
  return <div className="db-donut">
    <div className="db-dw">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {arcs.length ? arcs.map((segment) => <circle key={segment.label} className="db-arc" cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={segment.color} strokeWidth={thickness}
          strokeDasharray={`${segment.length} ${circumference - segment.length}`} strokeDashoffset={-segment.offset}
          data-tip={`${segment.label}: ${formatNumber(segment.value)} (${percent(segment.value, total)}%)${segment.tip ? ` — ${segment.tip}` : ""}`}
          style={segment.act && onSelect ? { cursor: "pointer" } : undefined} onClick={segment.act && onSelect ? () => onSelect(segment.act) : undefined} />)
          : <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e8eee3" strokeWidth={thickness} />}
      </svg>
      <div className="db-dc"><b>{center}</b><span>{sub}</span></div>
    </div>
    <div className="db-legend">{segments.map((segment) => <div key={segment.label} className={`db-lg${segment.act ? " click" : ""}`} data-tip={segment.tip || segment.label}
      {...actionProps(segment.act, onSelect)}>
      <span className="sw" style={{ background: segment.color }} /><span className="l">{segment.label}</span>
      <b>{formatNumber(segment.value)}</b><span className="p">{percent(segment.value, total)}%</span>
    </div>)}</div>
  </div>;
}

/** Logged vs resolved per week. weeks: [{ label, logged, resolved }] */
export function WeeklyColumns({ weeks }) {
  const max = Math.max(1, ...weeks.map((week) => Math.max(week.logged, week.resolved)));
  return <>
    <div className="db-cols">{weeks.map((week) => <div key={week.label} className="db-col"><div className="bars">
      <span className="b logged" style={{ height: `${(week.logged / max) * 100}%` }} data-tip={`Week of ${week.label} · Logged: ${week.logged}`} />
      <span className="b resolved" style={{ height: `${(week.resolved / max) * 100}%` }} data-tip={`Week of ${week.label} · Resolved: ${week.resolved}`} />
    </div><span className="x">{week.label}</span></div>)}</div>
    <div className="db-key"><span><i style={{ background: "var(--green)" }} />Logged</span><span><i style={{ background: "var(--lime)" }} />Resolved</span></div>
  </>;
}

/** Color key under a chart. items: [[color, label]] */
export function ChartKey({ items }) {
  return <div className="db-key">{items.map(([color, label]) => <span key={label}><i style={{ background: color }} />{label}</span>)}</div>;
}

/** Summary card used on the dashboard and Call Logs. */
export function KpiCard({ icon, label, value, sub, tip, tone, onClick }) {
  return <div className={`db-kpi${tone ? ` ${tone}` : ""}${onClick ? " click" : ""}`} data-tip={tip} {...(onClick ? clickableProps(onClick) : {})}>
    <span className="ic"><Icon name={icon} /></span>
    <div className="tx"><span className="lb">{label}</span><b>{value}</b>{sub && <span className="sb">{sub}</span>}</div>
  </div>;
}
