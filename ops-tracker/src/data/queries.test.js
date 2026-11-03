import { describe, it, expect } from "vitest";
import { generateDataset } from "./mockData.js";
import { dashboardModel, storesModel, issuesModel, storeProfileModel } from "./queries.js";
import { validateIssue, validateUser } from "./validation.js";

const now = new Date(2026, 10, 3, 15, 0);
const ds = () => ({ ...generateDataset("2026-11-03", now), todayMetrics: [] });

describe("dashboard model", () => {
  it("is deterministic and covers every store", () => {
    const a = dashboardModel(ds(), { range: 7, now });
    const b = dashboardModel(ds(), { range: 7, now });
    expect(a.kpis).toEqual(b.kpis);
    expect(a.storesInScope).toBe(24);
    expect(a.trend).toHaveLength(7);
    expect(a.window.end).toBe("2026-11-02");
  });

  it("platform orders add up to the Orders KPI", () => {
    const d = dashboardModel(ds(), { range: 30, now });
    const total = d.platforms.reduce((s, p) => s + p.orders, 0);
    expect(total).toBe(d.kpis.find((k) => k.key === "orders").value);
  });

  it("filters by platform and franchisee", () => {
    const d = dashboardModel(ds(), { range: 7, platform: "grubhub", franchisee: "Coastal Subs LLC", now });
    expect(d.platforms.map((p) => p.id)).toEqual(["grubhub"]);
    expect(d.storesInScope).toBe(4);
    expect(d.recentIssues.every((i) => i.platformId === "grubhub")).toBe(true);
  });

  it("flags a focused watchlist, not most stores", () => {
    const d = dashboardModel(ds(), { range: 7, now });
    expect(d.watchlist.length).toBeGreaterThan(0);
    expect(d.watchlist.length).toBeLessThan(12);
  });

  it("drops disabled platforms everywhere", () => {
    const data = ds();
    data.platformSettings = data.platformSettings.map((p) => (p.id === "grubhub" ? { ...p, enabled: false } : p));
    const d = dashboardModel(data, { range: 7, now });
    expect(d.platforms.map((p) => p.id)).not.toContain("grubhub");
  });
});

describe("stores, issues, profile", () => {
  it("searches stores by number, city and franchisee", () => {
    expect(storesModel(ds(), { search: "anaheim" })).toHaveLength(1);
    expect(storesModel(ds(), { search: "Nguyen" }).length).toBe(4);
  });

  it("filters issues and keeps counts for tabs", () => {
    const r = issuesModel(ds(), { status: "active" });
    expect(r.list.every((i) => i.status !== "resolved")).toBe(true);
    expect(r.counts.active).toBe(r.list.length);
    expect(r.counts.all).toBe(64);
    const sev = r.list.map((i) => i.severity);
    expect(sev.indexOf("low")).toBeGreaterThanOrEqual(sev.lastIndexOf("critical"));
  });

  it("returns null for unknown store", () => {
    expect(storeProfileModel(ds(), "nope")).toBeNull();
    expect(storeProfileModel(ds(), "s3").platforms).toHaveLength(3);
  });
});

describe("validation", () => {
  it("explains what to fix", () => {
    const e = validateIssue({ title: "x", orderId: "!!" });
    expect(Object.keys(e).sort()).toEqual(["category", "orderId", "platformId", "severity", "storeId", "title"]);
    expect(validateUser({ name: "A B", email: "jordan.lee@example.com", role: "fbc" }, [{ id: "u1", email: "jordan.lee@example.com" }]).email).toMatch(/already/);
  });
});
