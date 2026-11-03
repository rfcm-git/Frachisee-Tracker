// Charts: Sparkline, TrendChart, BarList, ShareBar.
// Specs: 2px lines, hairline solid grid, legend for 2+ series, text in ink
// tokens (never series color), tooltip on hover AND keyboard focus, and a
// table view so no value depends on hovering.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cx } from "../../lib/cx.js";
import { fmtDay } from "../../lib/format.js";

function useWidth(ref, fallback = 320) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Round axis ticks: 0 / 50 / 100 ... */
function niceTicks(max, count = 4) {
  if (!max || max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(+v.toFixed(10));
  if (ticks[ticks.length - 1] < max) ticks.push(+(ticks[ticks.length - 1] + step).toFixed(10));
  return ticks;
}

/** 12-point trend in the de-emphasis hue, the latest point in the accent. */
export function Sparkline({ values, width = 96, height = 28, label }) {
  const pts = values.filter((v) => v != null);
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const coords = values.map((v, i) => (v == null ? null : [i * step, height - 3 - ((v - min) / span) * (height - 6)]));
  const d = coords.filter(Boolean).map((c, i) => `${i ? "L" : "M"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join("");
  const last = coords.filter(Boolean).at(-1);
  return (
    <svg width={width} height={height} viewBox={`-2 0 ${width + 4} ${height}`} role="img" aria-label={label} className="overflow-visible">
      <path d={d} fill="none" stroke="#a9a79f" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="var(--color-brand-600)" stroke="var(--color-surface)" strokeWidth="1.5" />
    </svg>
  );
}

export function Legend({ series, kind = "line" }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          {kind === "line" ? (
            <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: s.color }} aria-hidden />
          ) : (
            <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          )}
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Multi-series line chart over days. Crosshair snaps to the nearest day;
 * the tooltip lists every series. Focus the chart and use arrow keys to step
 * through days.
 */
export function TrendChart({ data, series, height = 240, format = (v) => v, axisFormat = format, label, showTable = false, emptyText = "No data for this period." }) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const [hover, setHover] = useState(null);
  const descId = useId();
  const pad = { top: 12, right: 12, bottom: 26, left: 44 };
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;

  const max = useMemo(() => Math.max(0, ...data.flatMap((d) => series.map((s) => d[s.key] ?? 0))), [data, series]);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const x = (i) => pad.left + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => pad.top + ih - (v / top) * ih;

  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 72))));
  const hasData = data.some((d) => series.some((s) => d[s.key]));

  if (showTable) {
    return (
      <div className="max-h-[300px] overflow-auto px-5 pb-4">
        <table className="w-full text-[13px] tnum">
          <caption className="sr-only">{label}</caption>
          <thead className="sticky top-0 bg-surface text-left text-[12px] text-muted">
            <tr>
              <th scope="col" className="py-2 font-medium">Date</th>
              {series.map((s) => <th key={s.key} scope="col" className="py-2 text-right font-medium">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.date} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-normal text-ink-2">{fmtDay(d.date)}</th>
                {series.map((s) => <td key={s.key} className="py-1.5 text-right">{d[s.key] == null ? "–" : format(d[s.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function indexFromPointer(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - pad.left;
    return Math.max(0, Math.min(data.length - 1, Math.round((px / iw) * (data.length - 1))));
  }
  function onKeyDown(e) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "Escape") return setHover(null);
    const cur = hover ?? data.length - 1;
    const next = e.key === "Home" ? 0 : e.key === "End" ? data.length - 1 : cur + (e.key === "ArrowRight" ? 1 : -1);
    setHover(Math.max(0, Math.min(data.length - 1, next)));
  }

  const h = hover != null ? data[hover] : null;
  const tipLeft = hover != null ? x(hover) : 0;
  const flip = tipLeft > width - 190;

  return (
    <div ref={wrapRef} className="relative overflow-hidden px-2 pb-2">
      {!hasData && <p className="absolute inset-0 grid place-items-center text-[13px] text-muted">{emptyText}</p>}
      <p id={descId} className="sr-only">Use left and right arrow keys to read values for each day.</p>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label}
        aria-describedby={descId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
        onPointerMove={(e) => setHover(indexFromPointer(e))}
        onPointerLeave={() => setHover(null)}
        className="block touch-pan-y rounded-md focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-axis)" : "var(--color-grid)"} strokeWidth="1" shapeRendering="crispEdges" />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-axis-text text-[11px] tnum">{axisFormat(t)}</text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            (i === data.length - 1 || data.length - 1 - i >= labelEvery * 0.6) && (
              <text key={d.date} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} className="fill-axis-text text-[11px]">
                {fmtDay(d.date)}
              </text>
            )
          ) : null,
        )}
        {hasData && series.map((s) => {
          const path = data.map((d, i) => (d[s.key] == null ? null : `${x(i).toFixed(1)},${y(d[s.key]).toFixed(1)}`)).filter(Boolean);
          return <polyline key={s.key} className="chart-line" points={path.join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {h && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + ih} stroke="var(--color-line-strong)" strokeWidth="1" />
            {series.map((s) => h[s.key] != null && <circle key={s.key} cx={x(hover)} cy={y(h[s.key])} r="4" fill={s.color} stroke="var(--color-surface)" strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-line bg-surface px-3 py-2 shadow-[var(--shadow-pop)]"
          style={{ left: flip ? undefined : tipLeft + 14, right: flip ? width - tipLeft + 6 : undefined }}
          role="status"
          aria-live="polite"
        >
          <p className="mb-1 text-[12px] text-muted">{fmtDay(h.date)}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center gap-2 text-[13px]">
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="font-semibold text-ink tnum">{h[s.key] == null ? "–" : format(h[s.key])}</span>
              <span className="text-muted">{s.label}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars (single series). Value at the bar tip. */
export function BarList({ items, format = (v) => v, color = "var(--color-brand-500)", onSelect, label }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5" aria-label={label}>
      {items.map((it) => {
        const content = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-ink-2">{it.label}</span>
              <span className="font-semibold text-ink tnum">{format(it.value)}</span>
            </span>
            <span className="mt-1 block h-2 rounded-full bg-ink/[0.05]">
              <span className="block h-2 rounded-full transition-[width] duration-300 ease-out" style={{ width: `${(it.value / max) * 100}%`, background: color }} />
            </span>
          </>
        );
        return (
          <li key={it.label}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(it)} className="block w-full rounded-md text-left hover:bg-ink/[0.02]">
                {content}
              </button>
            ) : content}
          </li>
        );
      })}
    </ul>
  );
}

/** One whole split into parts (order share by platform), with a 2px surface gap. */
export function ShareBar({ parts, label }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(", ")}`}>
        {parts.map((p) => (
          <span key={p.key} className={cx("h-full first:rounded-l-full last:rounded-r-full transition-[width] duration-300 ease-out")} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${Math.round((p.value / total) * 100)}%`} />
        ))}
      </div>
    </div>
  );
}
