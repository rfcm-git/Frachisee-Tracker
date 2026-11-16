/*
 * "Needs action today": one work list across the tracker, most urgent first.
 *   followup  — call follow-ups that are due
 *   issue     — issues open for a week or more
 *   email     — stores being onboarded (3PDs, ezCater, Walmart) that were never emailed
 */
import { callFollowUpDue, callFranchiseeName } from "../../domain/calls.js";
import { franchiseeName } from "../../domain/context.js";
import { isIssueOpen, issueFranchiseeId, issueNumber } from "../../domain/issues.js";
import { obHistory, obIsOpen, obOnTab, obPlatformName } from "../../domain/onboarding.js";
import { OB_EMAIL_NOTE } from "../../domain/onboardingEmail.js";
import { issuePlatforms, primaryTerritory } from "../../domain/records.js";
import { normalizeWmStage, wmIsOpen } from "../../domain/walmart.js";
import { richToPlain } from "../../lib/richText.js";
import { ezRows } from "../ezcater/ezcaterSelectors.js";

/** Issues open at least this many days are listed. */
export const OLD_ISSUE_DAYS = 7;

export const ACTION_TYPES = [
  ["followup", "Follow-ups", "phone-call"],
  ["issue", "Issues", "triangle-alert"],
  ["email", "Not emailed", "mail"],
];

const DAY = 864e5;
const daysSince = (ts, now) => Math.max(0, Math.floor((now - new Date(ts).getTime()) / DAY));
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * Every item: { key, type, urgency (0 = most urgent), severity ("critical" | "warning" | ""), num, franchisee, what, detail,
 *               when (text), whenTip, sortTime, action: { label, kind, id } }.
 */
export function needsAction(ctx, territory, now = Date.now()) {
  const inTerritory = (num) => !territory || primaryTerritory(ctx.storeByNum.get(String(num ?? "")) || {}) === territory;
  const items = [];

  // Call follow-ups that are due.
  ctx.callLogs.forEach((call) => {
    if (!callFollowUpDue(call, now)) return;
    const stores = call.store_num ? [String(call.store_num)] : (ctx.storesByFr.get(call.franchisee_id) || []).map((store) => String(store.num));
    if (territory && !stores.some(inTerritory)) return;
    const late = daysSince(call.next_follow_up_at, now);
    items.push({
      key: `call-${call.id}`, type: "followup", urgency: late ? 1 : 2, severity: late ? "critical" : "warning",
      num: call.store_num ? String(call.store_num) : "", franchisee: callFranchiseeName(ctx, call), what: "Call follow-up due",
      detail: richToPlain(call.reason || "").replace(/\s+/g, " ").trim().slice(0, 90),
      when: late ? `${plural(late, "day")} late` : "Today", whenTip: `Due ${new Date(call.next_follow_up_at).toLocaleString()}`,
      sortTime: new Date(call.next_follow_up_at).getTime(), action: { label: "Follow up", kind: "followup", id: call.id },
    });
  });

  // Issues open a week or more.
  ctx.issues.forEach((issue) => {
    if (!isIssueOpen(issue) || !issue.store_num || !inTerritory(issue.store_num)) return;
    const age = daysSince(issue.created_at, now);
    if (age < OLD_ISSUE_DAYS) return;
    const title = richToPlain(issue.title || "").replace(/\s+/g, " ").trim();
    items.push({
      key: `issue-${issue.id}`, type: "issue", urgency: age >= 14 ? 2 : 4, severity: age >= 14 ? "warning" : "",
      num: String(issue.store_num), franchisee: franchiseeName(ctx, issueFranchiseeId(ctx, issue)),
      what: `Issue ${issueNumber(issue) ? `#${issueNumber(issue)} ` : ""}open ${plural(age, "day")}`, detail: [issuePlatforms(issue).join(", "), title].filter(Boolean).join(" · ").slice(0, 90),
      when: `${plural(age, "day")} old`, whenTip: `Logged ${new Date(issue.created_at).toLocaleDateString()}`,
      sortTime: new Date(issue.created_at).getTime(), action: { label: "Update", kind: "issue", id: issue.id },
    });
  });

  // Onboarding stores never emailed: 3PDs (one entry per store), ezCater, Walmart.
  const emailItem = (record, label, detail, kind) => ({
    key: `${kind}-${record.id}`, type: "email", urgency: 5, severity: "",
    num: String(record.store_num), franchisee: franchiseeName(ctx, ctx.storeByNum.get(String(record.store_num))?.franchisee_id), what: `${label} — not emailed yet`, detail,
    when: `Added ${plural(daysSince(record.created_at, now), "day")} ago`, whenTip: `Added ${new Date(record.created_at).toLocaleDateString()}`,
    sortTime: new Date(record.created_at).getTime(), action: { label: "Email", kind, id: record.id },
  });
  const threePd = new Map();
  ctx.onboarding.filter((record) => obOnTab(record) && obIsOpen(record) && inTerritory(record.store_num)).forEach((record) => {
    const num = String(record.store_num);
    const group = threePd.get(num) || { record, platforms: [], emailed: false };
    group.platforms.push(obPlatformName(record.platform));
    if (obHistory(record).some((entry) => String(entry.action || "").trim() === OB_EMAIL_NOTE)) group.emailed = true;
    threePd.set(num, group);
  });
  threePd.forEach((group) => { if (!group.emailed) items.push(emailItem(group.record, "3PDs", group.platforms.join(", "), "obEmail")); });
  ezRows(ctx).filter((row) => obIsOpen(row.record) && !row.emailedAt && inTerritory(row.record.store_num))
    .forEach((row) => items.push(emailItem(row.record, "ezCater", row.record.status, "obEmail")));
  ctx.walmart.filter((record) => wmIsOpen(record) && !record.last_email_at && inTerritory(record.store_num))
    .forEach((record) => items.push(emailItem(record, "Walmart", normalizeWmStage(record.stage), "wmEmail")));

  return items.sort((a, b) => a.urgency - b.urgency || a.sortTime - b.sortTime);
}

/** Item counts per type. */
export const actionCounts = (items) => Object.fromEntries(ACTION_TYPES.map(([type]) => [type, items.filter((item) => item.type === type).length]));

