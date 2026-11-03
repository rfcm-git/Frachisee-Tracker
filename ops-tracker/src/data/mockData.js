// Deterministic dummy data: stores, franchisees, users, daily 3PD metrics and
// issues. Same seed -> same data, so screenshots and tests are repeatable.
// All names, store numbers and order IDs are fictional.

import { PLATFORMS, ISSUE_CATEGORIES, DEFAULT_THRESHOLDS } from "../lib/constants.js";
import { addDays, dateRange, fromISODate } from "../lib/dates.js";
import { mulberry32, hashString, pick, between } from "../lib/random.js";

export const HISTORY_DAYS = 180;

const FRANCHISEES = [
  "Patel Restaurant Group",
  "Coastal Subs LLC",
  "Nguyen Family Foods",
  "Rivera Hospitality",
  "Summit Sandwich Co.",
  "Bayview Eats Inc.",
];

const LOCATIONS = [
  ["Anaheim", "Katella Ave"], ["Irvine", "Culver Dr"], ["Santa Ana", "Bristol St"], ["Orange", "Chapman Ave"],
  ["Fullerton", "Harbor Blvd"], ["Costa Mesa", "Newport Blvd"], ["Garden Grove", "Brookhurst St"], ["Tustin", "Red Hill Ave"],
  ["Long Beach", "Atlantic Ave"], ["Torrance", "Hawthorne Blvd"], ["Pasadena", "Colorado Blvd"], ["Burbank", "Olive Ave"],
  ["Glendale", "Brand Blvd"], ["Downey", "Firestone Blvd"], ["Whittier", "Whittier Blvd"], ["Huntington Beach", "Beach Blvd"],
  ["Mission Viejo", "Marguerite Pkwy"], ["Lake Forest", "El Toro Rd"], ["Cerritos", "South St"], ["Lakewood", "Del Amo Blvd"],
  ["Buena Park", "Beach Blvd"], ["Yorba Linda", "Imperial Hwy"], ["Placentia", "Kraemer Blvd"], ["Westminster", "Goldenwest St"],
];

export const USERS_SEED = [
  { id: "u1", name: "Jordan Lee", email: "jordan.lee@example.com", role: "admin", region: "SoCal", status: "active" },
  { id: "u2", name: "Priya Shah", email: "priya.shah@example.com", role: "fbc", region: "Orange County", status: "active" },
  { id: "u3", name: "Marcus Bell", email: "marcus.bell@example.com", role: "fbc", region: "Los Angeles", status: "active" },
  { id: "u4", name: "Elena Torres", email: "elena.torres@example.com", role: "area_coach", region: "Orange County", status: "active" },
  { id: "u5", name: "David Kim", email: "david.kim@example.com", role: "area_coach", region: "Los Angeles", status: "active" },
  { id: "u6", name: "Aisha Okafor", email: "aisha.okafor@example.com", role: "om", region: "Orange County", status: "active" },
  { id: "u7", name: "Tom Brennan", email: "tom.brennan@example.com", role: "om", region: "Los Angeles", status: "active" },
  { id: "u8", name: "Sofia Alvarez", email: "sofia.alvarez@example.com", role: "om", region: "Orange County", status: "active" },
  { id: "u9", name: "Kevin Huang", email: "kevin.huang@example.com", role: "fbc", region: "Los Angeles", status: "invited" },
  { id: "u10", name: "Rachel Green", email: "rachel.green@example.com", role: "om", region: "Los Angeles", status: "deactivated" },
];

export const PLATFORM_SETTINGS_SEED = [
  {
    id: "doordash", enabled: true, connection: "connected", syncMinutes: 15,
    thresholds: { ...DEFAULT_THRESHOLDS }, alertOnPause: true, alertEmail: "3pd-alerts@example.com", merchantPortal: "https://merchant-portal.example.com/doordash",
  },
  {
    id: "ubereats", enabled: true, connection: "connected", syncMinutes: 15,
    thresholds: { ...DEFAULT_THRESHOLDS, errorRate: 0.035 }, alertOnPause: true, alertEmail: "3pd-alerts@example.com", merchantPortal: "https://merchant-portal.example.com/ubereats",
  },
  {
    id: "grubhub", enabled: true, connection: "degraded", syncMinutes: 30,
    thresholds: { ...DEFAULT_THRESHOLDS, minRating: 4.3 }, alertOnPause: false, alertEmail: "", merchantPortal: "https://merchant-portal.example.com/grubhub",
  },
];

const WEEKDAY = [1.1, 0.85, 0.9, 0.95, 1.0, 1.25, 1.3]; // Sun..Sat
const SHARE = { doordash: 0.5, ubereats: 0.32, grubhub: 0.18 };
const AOV = { doordash: 26.5, ubereats: 25.2, grubhub: 24.1 };

function buildStores(rand) {
  return LOCATIONS.map(([city, street], i) => {
    const fr = FRANCHISEES[i % FRANCHISEES.length];
    const isOC = i < 8 || i >= 15;
    return {
      id: `s${i + 1}`,
      number: String(10400 + Math.floor(rand() * 90) * 7 + i * 113),
      name: `${city} – ${street}`,
      city,
      state: "CA",
      region: isOC ? "Orange County" : "Los Angeles",
      franchisee: fr,
      fbcId: isOC ? "u2" : "u3",
      areaCoachId: isOC ? "u4" : "u5",
      omId: isOC ? pick(rand, ["u6", "u8"]) : "u7",
      phone: `(714) 555-${String(1000 + i * 37).slice(-4)}`,
      address: `${100 + Math.floor(rand() * 9800)} ${street}, ${city}, CA`,
      openedYear: 2004 + Math.floor(rand() * 18),
    };
  });
}

// A few stores carry specific problems so the dashboard has a story to tell.
const PROBLEM = {
  s3: { errorBoost: 0.045, downtimeP: 0.18 }, // Santa Ana: chronic missing items
  s10: { ratingDrop: 0.35 }, // Torrance: low ratings
  s14: { downtimeP: 0.3 }, // Downey: tablet keeps going offline
  s19: { spikeFrom: 10, spikePlatform: "ubereats", errorBoost: 0.06 }, // Cerritos: recent UE spike
};

function buildMetrics(stores, today) {
  const rows = [];
  const days = dateRange(addDays(today, -1), HISTORY_DAYS);
  for (const s of stores) {
    const sr = mulberry32(hashString(s.id));
    const base = between(sr, 45, 150);
    const growth = between(sr, -0.0008, 0.0016);
    const prob = PROBLEM[s.id] || {};
    for (const p of PLATFORMS) {
      const pr = mulberry32(hashString(s.id + p.id));
      const errBase = between(pr, 0.012, 0.03) + (prob.spikeFrom ? 0 : prob.errorBoost || 0) * (p.id === "doordash" ? 1 : 0.6);
      const ratingBase = between(pr, 4.55, 4.9) - (prob.ratingDrop || 0);
      const downP = prob.downtimeP ?? 0.05;
      days.forEach((date, di) => {
        const r = mulberry32(hashString(s.id + p.id + date));
        const dow = fromISODate(date).getDay();
        const ageFromEnd = days.length - 1 - di;
        const orders = Math.max(0, Math.round(base * SHARE[p.id] * WEEKDAY[dow] * (1 + growth * di) * between(r, 0.85, 1.15)));
        let err = errBase * between(r, 0.6, 1.4);
        if (prob.spikeFrom && p.id === prob.spikePlatform && ageFromEnd < prob.spikeFrom) err += prob.errorBoost;
        const ratingCount = Math.round(orders * between(r, 0.18, 0.3));
        const rating = Math.min(5, Math.max(3.4, ratingBase + between(r, -0.18, 0.12) - err * 3));
        const downtimeMin = r() < downP ? Math.round(between(r, 25, 240)) : 0;
        rows.push({
          storeId: s.id,
          platformId: p.id,
          date,
          orders,
          sales: Math.round(orders * AOV[p.id] * between(r, 0.92, 1.08) * 100) / 100,
          errorOrders: Math.round(orders * err),
          cancellations: Math.round(orders * between(r, 0.004, 0.02)),
          ratingSum: Math.round(rating * ratingCount * 100) / 100,
          ratingCount,
          downtimeMin,
          prepMinSum: Math.round(orders * between(r, 8.5, 13.5)),
        });
      });
    }
  }
  return rows;
}

/** Rows for the current day so far, scaled by business hours elapsed (10am-10pm). */
export function buildTodayRows(stores, today, now = new Date()) {
  const hour = now.getHours() + now.getMinutes() / 60;
  const frac = Math.min(1, Math.max(0, (hour - 10) / 12));
  const rows = [];
  for (const s of stores) {
    for (const p of PLATFORMS) {
      const r = mulberry32(hashString(s.id + p.id + today));
      const full = Math.round(between(r, 45, 150) * SHARE[p.id] * WEEKDAY[fromISODate(today).getDay()]);
      const orders = Math.round(full * frac);
      const errorOrders = Math.round(orders * between(r, 0.01, PROBLEM[s.id] ? 0.07 : 0.03));
      const ratingCount = Math.round(orders * 0.22);
      rows.push({
        storeId: s.id, platformId: p.id, date: today, orders,
        sales: Math.round(orders * AOV[p.id] * 100) / 100,
        errorOrders, cancellations: Math.round(orders * 0.01),
        ratingSum: Math.round(ratingCount * between(r, 4.3, 4.85) * 100) / 100, ratingCount,
        downtimeMin: 0, prepMinSum: Math.round(orders * between(r, 9, 13)),
      });
    }
  }
  return rows;
}

/** Current live status of each store on each platform. */
function buildConnections(stores, rand) {
  const out = [];
  for (const s of stores) {
    for (const p of PLATFORMS) {
      let status = "online";
      if (s.id === "s14" && p.id === "doordash") status = "offline";
      else if (s.id === "s3" && p.id === "ubereats") status = "paused";
      else if (rand() < 0.04) status = "paused";
      if (s.id === "s22" && p.id === "grubhub") status = "not_listed";
      out.push({ storeId: s.id, platformId: p.id, status, externalId: `${p.short}-${s.number}`, since: null });
    }
  }
  return out;
}

const ISSUE_TEMPLATES = {
  "Missing items": ["Customer reports missing cookies and drink", "Footlong missing from 3-item order", "Chips and sides left out of bag"],
  "Wrong order": ["Wrong protein on two sandwiches", "Order handed to the wrong courier", "Customer received another customer's bag"],
  "Store paused / offline": ["Store auto-paused during lunch rush", "Store showing closed during posted hours", "Paused after tablet logout"],
  "Menu or price mismatch": ["Footlong price differs from in-store menu", "Seasonal sub still listed after removal", "Combo upcharge not applied"],
  "Long Dasher / courier wait": ["Courier waited 18+ minutes at pickup", "Repeated late pickups during dinner", "Orders sitting ready with no courier"],
  "Tablet or POS integration": ["Orders not printing from tablet", "POS integration dropping modifiers", "Tablet battery dying mid-shift"],
  "Customer complaint": ["Cold food complaint escalated by 3PD", "Customer disputes bag seal", "Allergy note ignored"],
  "Payout discrepancy": ["Weekly payout short vs. order total", "Error charge on refunded order", "Commission rate applied incorrectly"],
};

const SCREENSHOTS = {
  "Missing items": "/screenshots/order-missing-items.svg",
  "Wrong order": "/screenshots/order-missing-items.svg",
  "Store paused / offline": "/screenshots/store-paused.svg",
  "Menu or price mismatch": "/screenshots/menu-price-mismatch.svg",
};

const ASSIGNABLE = ["u2", "u3", "u4", "u5", "u6", "u7", "u8"];

function orderId(rand, platformId) {
  const chars = "ABCDEF0123456789";
  const len = platformId === "grubhub" ? 9 : 6;
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(rand() * chars.length)];
  return platformId === "grubhub" ? s.replace(/[A-F]/g, (c) => String(c.charCodeAt(0) % 10)) : s;
}

function buildIssues(stores, now) {
  const rand = mulberry32(42);
  const issues = [];
  const weighted = [...stores, stores[2], stores[2], stores[2], stores[13], stores[13], stores[18], stores[18], stores[9]];
  for (let i = 0; i < 64; i++) {
    const store = pick(rand, weighted);
    const platform = pick(rand, [...PLATFORMS, PLATFORMS[0], PLATFORMS[1]]);
    const category = pick(rand, ISSUE_CATEGORIES);
    const ageHours = Math.pow(rand(), 1.6) * 24 * 40;
    const created = new Date(now.getTime() - ageHours * 3600000);
    const severity = category === "Store paused / offline" || category === "Tablet or POS integration"
      ? pick(rand, ["critical", "high", "high"])
      : pick(rand, ["high", "medium", "medium", "low", "low"]);
    let status;
    if (ageHours > 24 * 10) status = rand() < 0.88 ? "resolved" : pick(rand, ["waiting", "in_progress"]);
    else if (ageHours > 24 * 2) status = pick(rand, ["resolved", "in_progress", "waiting", "open"]);
    else status = pick(rand, ["open", "open", "in_progress"]);
    const assigneeId = status === "open" && rand() < 0.4 ? null : store.region === "Orange County" ? pick(rand, ["u2", "u4", "u6", "u8"]) : pick(rand, ["u3", "u5", "u7"]);
    const reporterId = pick(rand, ASSIGNABLE);
    const updated = new Date(Math.min(now.getTime(), created.getTime() + rand() * ageHours * 3600000));
    const title = pick(rand, ISSUE_TEMPLATES[category]);
    const id = `ISS-${String(1201 + i)}`;
    const events = [{ id: `${id}-e0`, at: created.toISOString(), userId: reporterId, type: "created", text: "Flagged the issue" }];
    if (assigneeId) events.push({ id: `${id}-e1`, at: new Date(created.getTime() + 20 * 60000).toISOString(), userId: "u1", type: "assigned", text: "Assigned the issue", meta: assigneeId });
    if (status !== "open") events.push({ id: `${id}-e2`, at: updated.toISOString(), userId: assigneeId || reporterId, type: "status", text: "Changed status", meta: status });
    if (status === "waiting") events.push({ id: `${id}-e3`, at: updated.toISOString(), userId: assigneeId || reporterId, type: "comment", text: `Opened a support case with ${platform.name}. Waiting for their reply.` });
    issues.push({
      id,
      storeId: store.id,
      platformId: platform.id,
      category,
      severity,
      status,
      title,
      description: `${title}. Reported via ${platform.name} merchant portal. Store team confirmed on follow-up call.`,
      orderId: ["Missing items", "Wrong order", "Customer complaint", "Payout discrepancy"].includes(category) ? `#${orderId(rand, platform.id)}` : "",
      reporterId,
      assigneeId,
      createdAt: created.toISOString(),
      updatedAt: updated.toISOString(),
      screenshot: SCREENSHOTS[category] && rand() < 0.75 ? SCREENSHOTS[category] : null,
      events,
    });
  }
  return issues.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function generateDataset(today, now = new Date()) {
  const rand = mulberry32(7);
  const stores = buildStores(rand);
  return {
    today,
    stores,
    franchisees: FRANCHISEES,
    metrics: buildMetrics(stores, today),
    connections: buildConnections(stores, mulberry32(99)),
    issues: buildIssues(stores, now),
    users: USERS_SEED.map((u, i) => ({ ...u, lastActive: new Date(now.getTime() - (i * 7 + 1) * 3600000 * (u.status === "active" ? 1 : 30)).toISOString() })),
    platformSettings: PLATFORM_SETTINGS_SEED.map((p) => ({ ...p, thresholds: { ...p.thresholds }, lastSync: new Date(now.getTime() - (p.connection === "degraded" ? 47 : 4) * 60000).toISOString() })),
  };
}
