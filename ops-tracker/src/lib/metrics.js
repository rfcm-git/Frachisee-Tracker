// Pure aggregation over daily metric rows. Used by both data sources, so the
// numbers on screen do not depend on where the rows came from.
//
// Row shape: { storeId, platformId, date, orders, sales, errorOrders,
//              cancellations, ratingSum, ratingCount, downtimeMin, prepMinSum }

import { DEFAULT_THRESHOLDS, PLATFORMS } from "./constants.js";
import { addDays, dateRange } from "./dates.js";

export function emptyTotals() {
  return { orders: 0, sales: 0, errorOrders: 0, cancellations: 0, ratingSum: 0, ratingCount: 0, downtimeMin: 0, prepMinSum: 0 };
}

export function addInto(t, r) {
  t.orders += r.orders;
  t.sales += r.sales;
  t.errorOrders += r.errorOrders;
  t.cancellations += r.cancellations;
  t.ratingSum += r.ratingSum;
  t.ratingCount += r.ratingCount;
  t.downtimeMin += r.downtimeMin;
  t.prepMinSum += r.prepMinSum;
  return t;
}

/** Turn summed totals into the ratios people read. */
export function derive(t) {
  return {
    orders: t.orders,
    sales: t.sales,
    aov: t.orders ? t.sales / t.orders : null,
    errorRate: t.orders ? t.errorOrders / t.orders : null,
    cancelRate: t.orders ? t.cancellations / t.orders : null,
    rating: t.ratingCount ? t.ratingSum / t.ratingCount : null,
    downtimeMin: t.downtimeMin,
    prepMin: t.orders ? t.prepMinSum / t.orders : null,
  };
}

export function sumRows(rows) {
  return derive(rows.reduce(addInto, emptyTotals()));
}

export function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, emptyTotals());
    addInto(map.get(k), r);
  }
  return map;
}

export function inRange(rows, start, end) {
  return rows.filter((r) => r.date >= start && r.date <= end);
}

/** Window of `days` ending on `end`, and the window before it. */
export function windows(end, days) {
  const start = addDays(end, -(days - 1));
  return { start, end, prevStart: addDays(start, -days), prevEnd: addDays(start, -1) };
}

/** Daily series per platform: [{ date, doordash, ubereats, grubhub, total }]. */
export function dailyByPlatform(rows, end, days, field = "orders") {
  const dates = dateRange(end, days);
  const idx = new Map(dates.map((d, i) => [d, i]));
  const out = dates.map((date) => {
    const o = { date, total: 0 };
    for (const p of PLATFORMS) o[p.id] = 0;
    return o;
  });
  for (const r of rows) {
    const i = idx.get(r.date);
    if (i == null) continue;
    out[i][r.platformId] += r[field];
    out[i].total += r[field];
  }
  return out;
}

/** Daily series of a derived metric (e.g. errorRate) across all rows. */
export function dailyDerived(rows, end, days, metric) {
  const dates = dateRange(end, days);
  const grouped = groupBy(rows, (r) => r.date);
  return dates.map((date) => {
    const t = grouped.get(date);
    return { date, value: t ? derive(t)[metric] : null };
  });
}

/**
 * Health of a store from its derived metrics and the strictest thresholds.
 * critical: two or more breaches, or error rate at 1.5x threshold.
 * Downtime threshold is minutes per day, so the period total is averaged over `days`.
 */
export function storeHealth(m, th = DEFAULT_THRESHOLDS, days = 1) {
  const breaches = [];
  if (m.errorRate != null && m.errorRate > th.errorRate) breaches.push("errorRate");
  if (m.rating != null && m.rating < th.minRating) breaches.push("rating");
  if (m.downtimeMin != null && m.downtimeMin / days > th.downtimeMin) breaches.push("downtime");
  let level = "good";
  if (breaches.length >= 2 || (m.errorRate ?? 0) > th.errorRate * 1.5) level = "critical";
  else if (breaches.length === 1) level = "watch";
  return { level, breaches };
}

/** Bucket a daily series into `n` points (for 12-point sparklines). */
export function bucket(values, n = 12) {
  if (values.length <= n) return values;
  const size = values.length / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const slice = values.slice(Math.floor(i * size), Math.floor((i + 1) * size)).filter((v) => v != null);
    out.push(slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null);
  }
  return out;
}
