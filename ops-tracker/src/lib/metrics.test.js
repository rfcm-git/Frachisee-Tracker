import { describe, it, expect } from "vitest";
import { sumRows, storeHealth, windows, dailyByPlatform, bucket } from "./metrics.js";

const row = (o) => ({ storeId: "s1", platformId: "doordash", date: "2026-11-01", orders: 100, sales: 2500, errorOrders: 3, cancellations: 1, ratingSum: 90, ratingCount: 20, downtimeMin: 0, prepMinSum: 1000, ...o });

describe("metrics", () => {
  it("derives ratios from summed totals, not averaged ratios", () => {
    const m = sumRows([row({ orders: 100, errorOrders: 10 }), row({ orders: 300, errorOrders: 2 })]);
    expect(m.orders).toBe(400);
    expect(m.errorRate).toBeCloseTo(12 / 400);
    expect(m.rating).toBeCloseTo(4.5);
    expect(m.aov).toBeCloseTo(12.5);
  });

  it("returns nulls (not NaN) for empty input", () => {
    const m = sumRows([]);
    expect(m.errorRate).toBeNull();
    expect(m.rating).toBeNull();
  });

  it("judges health against thresholds; downtime is per day", () => {
    const th = { errorRate: 0.04, minRating: 4.4, downtimeMin: 120 };
    expect(storeHealth({ errorRate: 0.02, rating: 4.6, downtimeMin: 500 }, th, 7).level).toBe("good");
    expect(storeHealth({ errorRate: 0.02, rating: 4.6, downtimeMin: 900 }, th, 7)).toEqual({ level: "watch", breaches: ["downtime"] });
    expect(storeHealth({ errorRate: 0.05, rating: 4.3, downtimeMin: 0 }, th).level).toBe("critical");
    expect(storeHealth({ errorRate: 0.07, rating: 4.8, downtimeMin: 0 }, th).level).toBe("critical");
  });

  it("builds comparison windows of equal length", () => {
    expect(windows("2026-11-02", 7)).toEqual({ start: "2026-10-27", end: "2026-11-02", prevStart: "2026-10-20", prevEnd: "2026-10-26" });
  });

  it("fills every day of a daily series, including days with no rows", () => {
    const s = dailyByPlatform([row({ date: "2026-11-02", orders: 5 })], "2026-11-02", 3);
    expect(s.map((d) => d.date)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(s[2]).toMatchObject({ doordash: 5, total: 5, ubereats: 0 });
  });

  it("buckets long series to 12 points for sparklines", () => {
    expect(bucket(Array.from({ length: 90 }, (_, i) => i), 12)).toHaveLength(12);
    expect(bucket([1, 2, 3], 12)).toEqual([1, 2, 3]);
  });
});
