/*
 * Issues opened vs resolved — grouped columns over the date range, one axis.
 * Colors: categorical slots 1 and 2 of the data-viz reference palette (validated: CVD ΔE 24.7, normal ΔE 33.6, contrast ≥ 3:1).
 * Hover or focus a period for its numbers; "Table" shows the same numbers without hovering.
 */
import { useLayoutEffect, useRef, useState } from "react";
import Icon from "../../components/ui/Icon.jsx";
import { openStoreIssues } from "../../state/dialogs.js";
import { showOpenConcerns } from "../../state/uiStore.js";

const SERIES = [["opened", "Opened"], ["resolved", "Resolved"]];
const HEIGHT = 300;
const PAD = { top: 12, right: 8, bottom: 26, left: 34 };

/** Clean axis ticks from 0 to at least max: 0 / 2 / 4 … or 0 / 5 / 10 … */
function ticksFor(max) {
  const top = Math.max(max, 4);
  const raw = top / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((value) => value >= raw);
  const ticks = [];
  for (let value = 0; value <= top + step * 0.001; value += step) ticks.push(value);
  if (ticks[ticks.length - 1] < top) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Column path: square at the baseline, 4px rounded top. */
function column(x, y, width, height) {
  if (height <= 0) return "";
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function Chart({ trend }) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const [active, setActive] = useState(null);
  const rows = trend.rows;
  const ticks = ticksFor(Math.max(0, ...rows.flatMap((row) => [row.opened, row.resolved])));
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = rows.length ? plotW / rows.length : 0;
  const barW = Math.max(3, Math.min(24, (band * 0.7 - 2) / 2));
  const y = (value) => PAD.top + plotH - (value / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(46 / Math.max(band, 1)));
  const row = active != null ? rows[active] || null : null;
  const tipLeft = active != null ? Math.min(Math.max(PAD.left + band * active + band / 2, 90), width - 90) : 0;

  return <div className="ic-wrap" ref={wrapRef} onMouseLeave={() => setActive(null)}>
    {width > 0 && <svg width={width} height={HEIGHT} role="img" aria-label={`Issues opened vs resolved: ${trend.opened} opened, ${trend.resolved} resolved in this period`}>
      {ticks.map((tick) => <g key={tick}>
        <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} className="ic-grid" />
        <text x={PAD.left - 8} y={y(tick)} className="ic-tick" textAnchor="end" dominantBaseline="middle">{tick.toLocaleString()}</text>
      </g>)}
      {rows.map((item, index) => {
        const x0 = PAD.left + band * index;
        const groupW = barW * 2 + 2;
        const left = x0 + (band - groupW) / 2;
        return <g key={item.long}>
          {active === index && <rect x={x0 + 2} y={PAD.top} width={Math.max(0, band - 4)} height={plotH} rx="6" className="ic-hover" />}
          <path d={column(left, y(item.opened), barW, PAD.top + plotH - y(item.opened))} className="ic-bar s1" />
          <path d={column(left + barW + 2, y(item.resolved), barW, PAD.top + plotH - y(item.resolved))} className="ic-bar s2" />
          {index % labelEvery === 0 && <text x={x0 + band / 2} y={HEIGHT - 8} className="ic-tick" textAnchor="middle">{item.short}</text>}
          <rect x={x0} y={PAD.top} width={band} height={plotH} className="ic-hit" tabIndex={0} role="button"
            aria-label={`${item.long}: ${item.opened} opened, ${item.resolved} resolved, ${item.backlog} open at the end`}
            onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} />
        </g>;
      })}
      <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} className="ic-base" />
    </svg>}
    {row && <div className="ic-tip" role="status" style={{ left: tipLeft }}>
      <div className="ic-tip-h">{row.long}</div>
      <div className="ic-tip-r"><i className="s1" /><b>{row.opened}</b>opened</div>
      <div className="ic-tip-r"><i className="s2" /><b>{row.resolved}</b>resolved</div>
      <div className="ic-tip-f"><b>{row.backlog}</b> still open at the end</div>
    </div>}
  </div>;
}

function ChartTable({ trend }) {
  return <div className="ic-table"><table><thead><tr><th>{trend.unit === "day" ? "Day" : trend.unit === "month" ? "Month" : "Week"}</th><th>Opened</th><th>Resolved</th><th>Open at the end</th></tr></thead>
    <tbody>{trend.rows.map((row) => <tr key={row.long}><td>{row.long}</td><td>{row.opened}</td><td>{row.resolved}</td><td>{row.backlog}</td></tr>)}</tbody></table></div>;
}

export function IssuesChartCard({ trend, label }) {
  const [table, setTable] = useState(false);
  const empty = !trend.opened && !trend.resolved;
  return <section className="dc-card dc-chart" aria-labelledby="ic-title">
    <header className="dc-h">
      <div><h3 id="ic-title">Issues opened vs resolved</h3><span>{label} · by {trend.unit}</span></div>
      <div className="dc-legend" aria-label="Legend">
        {SERIES.map(([key, name]) => <span key={key}><i className={key === "opened" ? "s1" : "s2"} />{name} <b>{trend[key].toLocaleString()}</b></span>)}
        <button type="button" className="dc-toggle" aria-pressed={table} onClick={() => setTable(!table)}><Icon name={table ? "bar-chart-3" : "table-2"} />{table ? "Chart" : "Table"}</button>
      </div>
    </header>
    {empty ? <div className="dc-empty"><Icon name="circle-check" />No issues were opened or resolved in this period.</div>
      : table ? <ChartTable trend={trend} /> : <Chart trend={trend} />}
  </section>;
}

/** The 5 stores with the most open issues. */
export function TopStoresCard({ rows }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return <section className="dc-card dc-top" aria-labelledby="ts-title">
    <header className="dc-h"><div><h3 id="ts-title">Top 5 stores with open issues</h3><span>Most open issues first</span></div>
      <button type="button" className="dc-link" onClick={showOpenConcerns}>All issues<Icon name="arrow-right" /></button></header>
    {rows.length ? <ol className="ts-list">{rows.map((row, index) => <li key={row.num}>
      <button type="button" className="ts-row" onClick={() => openStoreIssues(row.num)} data-tip={`Open store ${row.num}'s issues`}>
        <span className="ts-rank">{index + 1}</span>
        <span className="ts-main"><b>Store {row.num}</b><span>{row.franchisee || "—"}</span>
          <span className="ts-meter" aria-hidden="true"><i style={{ width: `${(row.count / max) * 100}%` }} /></span></span>
        <span className="ts-num"><b>{row.count}</b><span>oldest {row.oldestDays}d</span></span>
      </button>
    </li>)}</ol> : <div className="dc-empty"><Icon name="circle-check" />No open issues.</div>}
  </section>;
}
