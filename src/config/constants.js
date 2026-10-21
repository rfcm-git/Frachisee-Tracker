/* Shared constants for the whole app. */

export const DEFAULT_SUPABASE_URL = "https://pwgxzzkzvhqajlgkbziu.supabase.co";
export const DEFAULT_SUPABASE_KEY = "sb_publishable_xcn3uRSFsyYZC3cDhOOVIw_pAsEd1o7";

/** Password asked before restoring a backup or deleting a franchisee. */
export const ADMIN_PASSWORD = "Sup3rUs3r!";

/** Delivery platforms stored on each store. Foodja is kept in the data but hidden in the app. */
export const PLATFORMS = [["ue", "Uber Eats"], ["dd", "DoorDash"], ["gh", "Grubhub"], ["ez", "ezCater"], ["fj", "Foodja"]];
export const PLATFORMS_UI = PLATFORMS.filter(([key]) => key !== "fj");
export const PLATFORM_SHORT = { ue: "UE", dd: "DD", gh: "GH", ez: "EZ", fj: "FJ" };
export const PLATFORM_STATES = ["Active", "Pending", "Not enrolled", "Exempted"];
/** The three core delivery apps used for coverage numbers. */
export const CORE3 = [["ue", "Uber Eats"], ["dd", "DoorDash"], ["gh", "Grubhub"]];

export const STORE_STATES = ["Open", "Temporarily closed", "Closed"];

export const ISSUE_PLATFORMS = ["Uber Eats", "DoorDash", "Grubhub", "ezCater", "Google Business Profile/SOCi", "Menu Manager", "Others"];
export const ISSUE_STATES = ["Pending", "Work in Progress", "Resolved"];
export const ISSUE_STATUS_COLOR = { Pending: "var(--danger)", "Work in Progress": "var(--warn)", Resolved: "var(--ok)" };

export const OB_PLATFORMS = [["ue", "Uber Eats"], ["dd", "DoorDash"], ["gh", "Grubhub"], ["ez", "ezCater"]];
export const OB_CORE = ["ue", "dd", "gh"];
export const OB_STATES = ["Pending", "Email Sent/Text Message", "Work in Progress", "Onboarded", "Exempted"];
export const OB_STATUS_COLOR = { Pending: "var(--warn)", "Email Sent/Text Message": "#2f7fbf", "Work in Progress": "#7a4fc2", Onboarded: "var(--ok)", Exempted: "var(--idle)" };

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
export const PAGE_OPTIONS = { fr: [10, 25, 50, 100], frst: [5, 12, 25, 50], st: [5, 12, 25, 50], is: [10, 25, 50, 100], ob: [10, 25, 50, 100], cl: [10, 25, 50, 100] };
export const PAGE_DEFAULTS = { fr: 25, frst: 12, st: 50, is: 25, ob: 25, cl: 25 };

export const TABS = ["dashboard", "franchisees", "stores", "staff", "issues", "calls", "reports"];

export const PAGE_TITLES = {
  dashboard: ["Dashboard", "Stores, 3PD coverage and issues at a glance"],
  franchisees: ["Franchisees", "Owners, contacts and their stores"],
  stores: ["All Stores", "Every store with platforms and status"],
  staff: ["FBC / OM", "Field consultants and operations managers"],
  concerns: ["Issues · Concerns", "Log, track and report 3PD issues"],
  onboarding: ["Issues · Onboarding", "Track 3PD and ezCater onboarding for each store and platform"],
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
  frCard: "ft2_frcard",
  callInsights: "ft2_cl_ins",
  callReminded: "ft2_cl_reminded",
  callSnooze: "ft2_cl_snooze",
  notifications: "ft2_notifications",
  notifyPosition: "ft2_notify_pos",
  links: "ft2_links",
  linksSeeded: "ft2_links_seeded",
  report: (kind) => (kind === "issues" ? "ft2_report" : kind === "ob" ? "ft2_report_ob" : `ft2_report_${kind}`),
  uiSession: "ft2_ui_state",
};
