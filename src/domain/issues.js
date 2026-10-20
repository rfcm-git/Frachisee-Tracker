/* Concerns (issues): status, history and grouping helpers. */
import { ISSUE_STATES, ISSUE_STATUS_COLOR } from "../config/constants.js";

/** Old status names are mapped to the current ones. */
export function normalizeIssueStatus(status) {
  if (status === "Open") return "Pending";
  if (status === "In progress") return "Work in Progress";
  return status || "Pending";
}

export const isIssueOpen = (issue) => normalizeIssueStatus(issue.status) !== "Resolved";

export const issueStatusClass = (status) => (status === "Resolved" ? "b-resolved" : status === "Work in Progress" ? "b-progress" : "b-open");

export const issueStatusColor = (status) => ISSUE_STATUS_COLOR[status] || "var(--idle)";

export const shortStatus = (status) => (status === "Work in Progress" ? "WIP" : status);

export const issueNumber = (issue) => (issue?.issue_no ? String(issue.issue_no) : "");

function storedHistory(issue) {
  try {
    const list = Array.isArray(issue.history) ? issue.history : JSON.parse(issue.history || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Every step of an issue, oldest first.
 * Issues logged before history existed get their known steps rebuilt.
 */
export function historyEntries(issue) {
  const list = storedHistory(issue).slice();
  if (list.length) return list.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const changed = issue.action_taken || (issue.updated_at && issue.created_at && Math.abs(new Date(issue.updated_at) - new Date(issue.created_at)) > 60000);
  const out = [{ ts: issue.created_at, kind: "created", status: changed ? null : normalizeIssueStatus(issue.status) }];
  if (changed) out.push({ ts: issue.updated_at || issue.created_at, kind: "update", status: normalizeIssueStatus(issue.status), action: issue.action_taken || "", legacy: true });
  return out;
}

/** Franchisee of an issue: saved on the issue, or found from its store. */
export function issueFranchiseeId(ctx, issue) {
  if (issue.franchisee_id) return issue.franchisee_id;
  const store = ctx.storeByNum.get(String(issue.store_num || ""));
  return store ? store.franchisee_id : null;
}

/** When the issue was resolved (last "Resolved" step), or null when still open. */
export function resolvedAt(issue) {
  if (isIssueOpen(issue)) return null;
  const steps = historyEntries(issue).filter((entry) => normalizeIssueStatus(entry.status || "") === "Resolved");
  return new Date((steps.length ? steps[steps.length - 1].ts : null) || issue.updated_at || issue.created_at);
}

/** Days open (still open) or days to resolve, one decimal. */
export function issueDays(issue) {
  const start = new Date(issue.created_at);
  if (Number.isNaN(start.getTime())) return "";
  const end = isIssueOpen(issue) ? new Date() : resolvedAt(issue);
  return Math.max(0, Math.round(((end - start) / 864e5) * 10) / 10);
}

/** Issues sharing the same group (multi-store issue), sorted by store number. */
export const groupMembers = (issues, groupId) => issues.filter((item) => item.group_id === groupId)
  .sort((a, b) => String(a.store_num || "").localeCompare(String(b.store_num || "")));

export const groupSize = (issues, issue) => (issue.group_id ? issues.filter((item) => item.group_id === issue.group_id).length : 1);

/** {Pending: 2, Resolved: 1} */
export function statusCounts(issues) {
  const counts = {};
  issues.forEach((issue) => { const status = normalizeIssueStatus(issue.status); counts[status] = (counts[status] || 0) + 1; });
  return counts;
}

/** [{status, count, shortLabel, color}] in the standard order. */
export const statusSummary = (issues) => {
  const counts = statusCounts(issues);
  return ISSUE_STATES.filter((status) => counts[status]).map((status) => ({ status, count: counts[status], shortLabel: shortStatus(status), color: issueStatusColor(status) }));
};

/** Open first, then most recently updated. */
export const sortOpenThenRecent = (a, b) => (!isIssueOpen(a)) - (!isIssueOpen(b))
  || new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);

/** Open first, then newest id. */
export const sortOpenThenNewest = (a, b) => (!isIssueOpen(a)) - (!isIssueOpen(b)) || b.id - a.id;

/** Latest activity timestamp of a list of records. */
export const lastActivity = (items) => items.map((item) => item.updated_at || item.created_at).sort().pop();
