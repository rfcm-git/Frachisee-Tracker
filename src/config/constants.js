/* Shared constants for the whole app. */

export const DEFAULT_SUPABASE_URL = "https://pwgxzzkzvhqajlgkbziu.supabase.co";
export const DEFAULT_SUPABASE_KEY = "sb_publishable_xcn3uRSFsyYZC3cDhOOVIw_pAsEd1o7";

/** Password asked before restoring a backup or deleting a franchisee. */
export const ADMIN_PASSWORD = "Sup3rUs3r!";

/** Delivery platforms stored on each store. Foodja is kept in the data but hidden in the app. */
export const PLATFORMS = [["ue", "Uber Eats"], ["dd", "DoorDash"], ["gh", "Grubhub"], ["ez", "ezCater"], ["wm", "Walmart"], ["fj", "Foodja"]];
export const PLATFORMS_UI = PLATFORMS.filter(([key]) => key !== "fj");
export const PLATFORM_SHORT = { ue: "UE", dd: "DD", gh: "GH", ez: "EZ", wm: "WM", fj: "FJ" };
/** Status of a store on a delivery app. The same four statuses are used by onboarding records (OB_STATES), and the two are kept in sync. */
export const PLATFORM_STATES = ["Onboarded", "Work in Progress", "Not enrolled", "Exempted"];
/** The three core delivery apps used for coverage numbers. */
export const CORE3 = [["ue", "Uber Eats"], ["dd", "DoorDash"], ["gh", "Grubhub"]];

export const STORE_STATES = ["Open", "Temporarily closed", "Closed"];

export const ISSUE_PLATFORMS = ["Uber Eats", "DoorDash", "Grubhub", "ezCater", "Walmart", "Google Business Profile/SOCi", "Menu Manager", "Others"];
export const ISSUE_STATES = ["Pending", "Work in Progress", "Resolved"];
export const ISSUE_STATUS_COLOR = { Pending: "var(--danger)", "Work in Progress": "var(--warn)", Resolved: "var(--ok)" };

/**
 * Platforms on the Onboarding tab. ezCater records live in the same table but have their own tab;
 * Walmart has its own tab and table (WM_STAGES), and its older onboarding records are kept but hidden.
 */
export const OB_PLATFORMS = [["ue", "Uber Eats"], ["dd", "DoorDash"], ["gh", "Grubhub"]];
/** Every platform with onboarding records: the Onboarding tab's plus ezCater (reports, emails, names). */
export const OB_ALL_PLATFORMS = [...OB_PLATFORMS, ["ez", "ezCater"]];
/** Platforms the onboarding "3PD status" filter applies to (ezCater has its own). */
export const OB_CORE = ["ue", "dd", "gh"];
export const OB_STATES = ["Not enrolled", "Work in Progress", "Onboarded", "Exempted"];
export const OB_STATUS_COLOR = { "Not enrolled": "var(--danger)", "Work in Progress": "var(--warn)", Onboarded: "var(--ok)", Exempted: "var(--idle)" };

/** Walmart tab: Walmart Marketplace onboarding stages, in order. Account Created is done. */
export const WM_STAGES = ["Awaiting App", "Payment Setup", "Account Created", "Exempted"];
/** Amber = waiting on the owner, purple = in progress, green = done, grey = exempted (red is kept for errors). */
export const WM_STAGE_COLOR = { "Awaiting App": "var(--warn)", "Payment Setup": "#7a4fc2", "Account Created": "var(--ok)", Exempted: "var(--idle)" };
/** The store's Walmart status (Delivery Platforms) for each stage. */
export const WM_STAGE_PLATFORM = { "Awaiting App": "Work in Progress", "Payment Setup": "Work in Progress", "Account Created": "Onboarded", Exempted: "Exempted" };
/** What to do next at each stage. */
export const WM_NEXT_STEP = {
  "Awaiting App": "Contact the owner and get the Walmart Marketplace application submitted.",
  "Payment Setup": "Follow up with the owner to finish payment setup.",
  "Account Created": "Done — the store is onboarded on Walmart.",
  Exempted: "No action needed.",
};

/** CAPs (Corrective Action Plan) monitoring: one record per store. New stores always start at the first status. */
export const CAP_STATES = ["No Action Yet", "Email Sent", "In Progress", "Completed"];
export const CAP_STATUS_COLOR = { "No Action Yet": "var(--danger)", "Email Sent": "#2f7fbf", "In Progress": "var(--warn)", Completed: "var(--ok)" };
/** A CAP counts as "due soon" (and gets a reminder) this many days before its submission due date. */
export const CAP_DUE_SOON_DAYS = 3;

export const CALL_OUTCOMES = ["Answered", "No answer / voicemail", "Follow-up required", "Requested more info", "Completed"];
export const CALL_OUTCOME_CLASS = {
  Answered: "cl-o-ans", "No answer / voicemail": "cl-o-nva", "Follow-up required": "cl-o-fu", "Requested more info": "cl-o-info", Completed: "cl-o-done",
};
/** Outcomes counted as "answered" in summaries. */
export const CALL_ANSWERED = ["Answered", "Completed", "Requested more info"];

export const STAFF_ROLES = ["FBC", "OM", "OM & FBC"];

/** Dashboard chart colors. */
export const CHART_COLORS = {
  green: "#008938", lime: "#8cc63f", yellow: "#ffc600", red: "#c0392b", redSoft: "#e9968c",
  orange: "#e08a00", gray: "#c9d3c4", ok: "#1a9850", teal: "#2f9e8f",
};

/** Date-period choices shared by the Concerns filter and the report builder. */
export const PERIODS = [
  ["all", "All dates"], ["today", "Today"], ["thisweek", "This week"], ["thismonth", "This month"], ["thisyear", "This year"],
  ["lastdays", "Last N days…"], ["day", "Pick a day…"], ["week", "Pick a week…"], ["month", "Pick a month…"], ["year", "Pick a year…"], ["range", "Date range…"],
];

/** Paged lists: allowed and default page sizes. */
export const PAGE_OPTIONS = { fr: [10, 25, 50, 100], frst: [5, 12, 25, 50], st: [5, 12, 25, 50], is: [10, 25, 50, 100], ob: [10, 25, 50, 100], ez: [10, 25, 50, 100], cl: [10, 25, 50, 100], cap: [10, 25, 50, 100], wm: [10, 25, 50, 100] };
export const PAGE_DEFAULTS = { fr: 25, frst: 12, st: 50, is: 25, ob: 25, ez: 25, cl: 25, cap: 25, wm: 25 };

export const TABS = ["dashboard", "search", "franchisees", "stores", "staff", "issues", "onboarding", "ezcater", "walmart", "caps", "calls", "reports"];

export const PAGE_TITLES = {
  dashboard: ["Dashboard", "Stores, 3PD coverage and issues at a glance"],
  search: ["Search", "Find any franchisee, store, FBC / OM, issue, CAP or call — use # @ and filters to be specific"],
  franchisees: ["Franchisees", "Owners, contacts and their stores"],
  stores: ["All Stores", "Every store with platforms and status"],
  staff: ["FBC / OM", "Field consultants and operations managers"],
  issues: ["Issues", "Log, track and report 3PD issues"],
  onboarding: ["3PDs", "Onboarding · Uber Eats, DoorDash and Grubhub for each store and platform"],
  ezcater: ["ezCater", "Onboarding · ezCater catering — who still needs to onboard and where each store is"],
  walmart: ["Walmart", "Onboarding · Walmart Marketplace — who still needs to onboard and where each store is"],
  caps: ["CAP", "Corrective Action Plan — track each store from first contact to completed"],
  calls: ["Call Logs", "Every call made to franchisees — reasons, results and follow-ups"],
  reports: ["Reports", "Build any report — Excel or PDF, by date, territory, franchisee, store and category"],
};

/** Time zones offered for report dates. */
export const REPORT_TIME_ZONES = [
  ["local", "My computer's time zone"],
  ["America/Los_Angeles", "Pacific Time (PST/PDT)"],
  ["Asia/Manila", "Philippine Time (PHT)"],
];

/** Browser storage keys (kept from the original app so saved preferences survive). */
export const STORAGE_KEYS = {
  url: "ft2_url",
  key: "ft2_key",
  idle: "ft2_idle",
  pageSize: (which) => `ft2_ps_${which}`,
  issueView: "ft2_isview",
  sidebar: "ft2_sb",
  navOnboarding: "ft2_nav_ob",
  frCard: "ft2_frcard",
  callInsights: "ft2_cl_ins",
  callReminded: "ft2_cl_reminded",
  callSnooze: "ft2_cl_snooze",
  capReminded: "ft2_cap_reminded",
  schedules: "ft2_schedules",
  scheduleState: "ft2_schedule_state",
  capLastImport: "ft2_cap_last_import",
  capEmail: "ft2_cap_email",
  obEmail: "ft2_ob_email",
  wmEmail: "ft2_wm_email",
  ezEmail: "ft2_ez_email",
  notifications: "ft2_notifications",
  notifyPosition: "ft2_notify_pos",
  links: "ft2_links",
  linksSeeded: "ft2_links_seeded",
  report: (kind) => (kind === "issues" ? "ft2_report" : kind === "ob" ? "ft2_report_ob" : `ft2_report_${kind}`),
  uiSession: "ft2_ui_state",
  recentSearches: "ft2_recent_search",
};
