/* All report types and the quick reports on the Reports tab. */
import activityReport from "./definitions/activity.js";
import callsReport from "./definitions/calls.js";
import capsReport from "./definitions/caps.js";
import { franchiseesReport, staffReport, storesReport } from "./definitions/directory.js";
import issuesReport from "./definitions/issues.js";
import onboardingReport from "./definitions/onboarding.js";

export const REPORTS = {
  issues: issuesReport,
  ob: onboardingReport,
  cap: capsReport,
  cl: callsReport,
  act: activityReport,
  stores: storesReport,
  frs: franchiseesReport,
  staff: staffReport,
};

export const REPORT_TYPES = [
  { key: "issues", title: "Concerns", icon: "message-square-warning", description: "Issues logged for stores: status, platforms, updates and actions taken.", filters: "Date logged · status · franchisee · store · territory" },
  { key: "ob", title: "Onboarding", icon: "rocket", description: "Onboarding per store and platform: status, progress and days to onboard.", filters: "Date started · status · platform · franchisee · store · territory" },
  { key: "cap", title: "CAPs Monitoring", icon: "list-checks", description: "Corrective Action Plans per store: status, submission due dates, contacts and notes.", filters: "Date added · status · due date · email · franchisee · store · territory" },
  { key: "cl", title: "Call logs", icon: "phone-call", description: "Every call: reason, result, outcome, follow-ups and franchisee contact.", filters: "Call date · outcome · follow-up · franchisee · store · territory" },
  { key: "act", title: "Activity (all categories)", icon: "activity", description: "Concerns, onboarding and calls together in one timeline.", filters: "Activity date · category · franchisee · store · territory" },
  { key: "stores", title: "Stores", icon: "store", description: "Store directory with 3PD, GBP and ezCater coverage, support team and gaps.", filters: "Store status · coverage · GBP · ezCater · team · territory" },
  { key: "frs", title: "Franchisees", icon: "users", description: "Owners with contacts, store counts, coverage and activity.", filters: "Activity · franchisee · store · territory" },
  { key: "staff", title: "FBC / OM", icon: "badge-check", description: "Each FBC and OM with their stores, franchisees and open items.", filters: "Role · franchisee · store · territory" },
];

export const QUICK_REPORTS = [
  { kind: "issues", title: "Open concerns", icon: "circle-alert", preset: { chips: { status: ["Pending", "Work in Progress"] } } },
  { kind: "issues", title: "Concerns logged this week", icon: "calendar-range", preset: { period: "thisweek" } },
  { kind: "ob", title: "Onboarding still in progress", icon: "loader", preset: { chips: { status: ["Pending", "Email Sent/Text Message", "Work in Progress"] } } },
  { kind: "ob", title: "Onboarding started this month", icon: "calendar", preset: { period: "thismonth" } },
  { kind: "cap", title: "Open CAPs", icon: "list-checks", preset: { chips: { status: ["No Action Yet", "Email Sent", "In Progress"] } } },
  { kind: "cap", title: "CAPs overdue or due soon", icon: "alarm-clock", preset: { chips: { due: ["overdue", "today", "soon"] } } },
  { kind: "cl", title: "Calls this week", icon: "phone", preset: { period: "thisweek" } },
  { kind: "cl", title: "Open call follow-ups", icon: "flag", preset: { chips: { fu: ["open"] } } },
  { kind: "stores", title: "Open stores missing GBP", icon: "map-pinned", preset: { chips: { status: ["Open"], gbp: ["no"] } } },
  { kind: "stores", title: "Open stores with no core 3PD", icon: "circle-off", preset: { chips: { status: ["Open"], core: ["0"] } } },
  { kind: "act", title: "All activity — last 7 days", icon: "activity", preset: { period: "lastdays", days: 7 } },
];

/** Report type for the current tab: Call Logs, CAPs, Onboarding, else Concerns. */
export function reportKindForTab(tab, issueSub) {
  if (tab === "calls") return "cl";
  if (tab === "caps") return "cap";
  if (tab === "issues" && issueSub === "onboarding") return "ob";
  return "issues";
}
