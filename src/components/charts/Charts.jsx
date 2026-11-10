/* Small SVG/CSS charts used in Call Logs insights. */
import Icon from "../ui/Icon.jsx";
import { clickableProps } from "../ui/clickable.js";
import { formatNumber, percent } from "../../lib/format.js";

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
