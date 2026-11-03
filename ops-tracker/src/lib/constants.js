// Domain vocabulary shared by the UI, mock data and Supabase adapter.

export const PLATFORMS = [
  { id: "doordash", name: "DoorDash", short: "DD", color: "var(--color-series-2)", strong: "var(--color-series-2-strong)" },
  { id: "ubereats", name: "Uber Eats", short: "UE", color: "var(--color-series-3)", strong: "var(--color-series-3-strong)" },
  { id: "grubhub", name: "Grubhub", short: "GH", color: "var(--color-series-1)", strong: "var(--color-series-1-strong)" },
];
export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

export const SEVERITIES = [
  { id: "critical", label: "Critical", rank: 0 },
  { id: "high", label: "High", rank: 1 },
  { id: "medium", label: "Medium", rank: 2 },
  { id: "low", label: "Low", rank: 3 },
];
export const SEVERITY_BY_ID = Object.fromEntries(SEVERITIES.map((s) => [s.id, s]));

export const ISSUE_STATUSES = [
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "waiting", label: "Waiting on 3PD" },
  { id: "resolved", label: "Resolved" },
];
export const STATUS_BY_ID = Object.fromEntries(ISSUE_STATUSES.map((s) => [s.id, s]));
export const OPEN_STATUSES = ["open", "in_progress", "waiting"];

export const ISSUE_CATEGORIES = [
  "Missing items",
  "Wrong order",
  "Store paused / offline",
  "Menu or price mismatch",
  "Long Dasher / courier wait",
  "Tablet or POS integration",
  "Customer complaint",
  "Payout discrepancy",
];

export const ROLES = [
  { id: "admin", label: "Admin", desc: "Full access, including 3PD settings and users" },
  { id: "fbc", label: "FBC", desc: "Franchisee business consultant; manages issues for assigned stores" },
  { id: "area_coach", label: "Area coach", desc: "Views and flags issues for their area" },
  { id: "om", label: "OM", desc: "Operations manager; views and flags issues for their stores" },
];
export const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));

export const RANGES = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "90 days" },
];

export const DEFAULT_THRESHOLDS = { errorRate: 0.04, minRating: 4.4, downtimeMin: 120 };
