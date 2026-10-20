import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { IssueNumber, IssueStatusBadge, ObPlatformTag, ObStatusBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { ISSUE_STATES, OB_STATUS_COLOR } from "../../config/constants.js";
import { groupMembers, historyEntries, issueNumber, issueStatusColor, normalizeIssueStatus, shortStatus, statusCounts } from "../../domain/issues.js";
import { obHistory, obPlatformName } from "../../domain/onboarding.js";
import { issuePlatforms } from "../../domain/records.js";
import { formatTimestamp } from "../../lib/format.js";
import { richHtml } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openFranchiseeInfo, openGroupUpdate, openUpdateIssue, openUpdateOnboarding } from "../../state/dialogs.js";

function Timeline({ entries, renderHead, renderExtra }) {
  return <div className="tl">{entries.map((entry, index) => <div className="tl-item" key={`${entry.ts}-${index}`}>
    <div className="tl-dot" style={{ background: entry.color }}>{index + 1}</div>
    <div className="tl-body">
      <div className="tl-head">{renderHead(entry)}<span className="tl-time"><Icon name="clock" />{formatTimestamp(entry.ts)}</span></div>
      {renderExtra(entry)}
    </div>
  </div>)}</div>;
}

/** Steps of one onboarding record. */
function OnboardingHistory({ record }) {
  const entries = obHistory(record).map((entry) => ({ ...entry, color: OB_STATUS_COLOR[entry.status] || "var(--warn)" }));
  return <>
    <div className="h-issue">
      <div className="ic-top"><ObPlatformTag platform={record.platform} /><ObStatusBadge status={record.status} /></div>
      <div className="ttl rt" dangerouslySetInnerHTML={{ __html: record.details ? richHtml(record.details) : "Onboarding request" }} />
      <div className="meta">Started {formatTimestamp(record.created_at)} · {entries.length} step{entries.length !== 1 ? "s" : ""}</div>
    </div>
    {entries.length ? <Timeline entries={entries}
      renderHead={(entry) => (entry.kind === "created"
        ? <><span className="what">Onboarding started</span><ObStatusBadge status={entry.status} /></>
        : entry.prev && entry.prev !== entry.status
          ? <><span className="what">Status changed</span><ObStatusBadge status={entry.prev} /><Icon name="arrow-right" className="arrow" /><ObStatusBadge status={entry.status} /></>
          : <><span className="what">Update</span><ObStatusBadge status={entry.status} /></>)}
      renderExtra={(entry) => (entry.kind !== "created" && entry.action
        ? <div className="tl-act rt" dangerouslySetInnerHTML={{ __html: richHtml(entry.action) }} />
        : entry.kind !== "created" ? <div className="tl-act none">No progress note</div> : null)} />
      : <p className="muted">No steps recorded.</p>}
  </>;
}

/** Steps of an issue; for a multi-store issue, identical steps are merged and list their stores. */
function IssueHistory({ ctx, members }) {
  const issue = members[0];
  let entries;
  if (members.length > 1) {
    const merged = new Map();
    members.forEach((member) => historyEntries(member).forEach((entry) => {
      const key = [entry.ts, entry.kind, entry.prev || "", entry.status || "", entry.action || ""].join("|");
      if (!merged.has(key)) merged.set(key, { ...entry, stores: [] });
      merged.get(key).stores.push(member.store_num);
    }));
    entries = [...merged.values()].sort((a, b) => new Date(a.ts) - new Date(b.ts));
    entries.forEach((entry) => { if (entry.stores.length === members.length) entry.stores = [`All ${members.length} stores`]; });
  } else {
    entries = historyEntries(issue).map((entry) => ({ ...entry, stores: [] }));
  }
  entries = entries.map((entry) => ({ ...entry, status: entry.status ? normalizeIssueStatus(entry.status) : null, prev: entry.prev ? normalizeIssueStatus(entry.prev) : null }))
    .map((entry) => ({ ...entry, color: entry.status ? issueStatusColor(entry.status) : "var(--idle)" }));

  const counts = statusCounts(members);
  const statuses = ISSUE_STATES.filter((status) => counts[status]);
  const franchisees = [...new Set(members.map((member) => member.franchisee_id).filter(Boolean))].map((id) => ctx.frById.get(id)).filter(Boolean);
  const platforms = issuePlatforms(issue);

  return <>
    <div className="h-issue">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {statuses.length > 1 ? <><span className="badge b-progress" title={statuses.map((status) => `${counts[status]} ${status}`).join(" · ")}>Mixed</span>
          <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{statuses.map((status) => `${counts[status]} ${shortStatus(status)}`).join(" · ")}</div></>
          : <IssueStatusBadge status={statuses[0]} />}
        {members.length > 1 && <span className="mtag"><Icon name="layers" />{members.length} stores</span>}
        {members.map((member) => <IssueNumber key={member.id} number={issueNumber(member)} />)}
      </div>
      <div className="ttl rt" dangerouslySetInnerHTML={{ __html: richHtml(issue.title) }} />
      {platforms.length > 0 && <div className="chips" style={{ margin: "6px 0" }}>{platforms.map((platform) => <span className="tag" key={platform}>{platform}</span>)}</div>}
      <div className="meta">Logged {formatTimestamp(issue.created_at)} · {entries.length} step{entries.length !== 1 ? "s" : ""}</div>
      {franchisees.length > 0 && <div className="fr-btns">{franchisees.map((franchisee) => <button type="button" key={franchisee.id} className="fr-btn" title="View franchisee info"
        onClick={() => openFranchiseeInfo(franchisee.id, issue.group_id || "")}><Icon name="user-round" />{franchisee.name}</button>)}</div>}
    </div>
    <Timeline entries={entries}
      renderHead={(entry) => (entry.kind === "created"
        ? <><span className="what">Issue logged</span><IssueStatusBadge status={entry.status} /></>
        : entry.prev && entry.status && entry.prev !== entry.status
          ? <><span className="what">Status changed</span><IssueStatusBadge status={entry.prev} /><Icon name="arrow-right" className="arrow" /><IssueStatusBadge status={entry.status} /></>
          : <><span className="what">Update</span><IssueStatusBadge status={entry.status} /></>)}
      renderExtra={(entry) => <>
        {entry.kind !== "created" && entry.action && <div className="tl-act rt" dangerouslySetInnerHTML={{ __html: richHtml(entry.action) }} />}
        {entry.kind !== "created" && !entry.action && <div className="tl-act none">No action description</div>}
        {entry.stores.length > 0 && <div className="tl-stores">{entry.stores.map((store) => <span key={store}>{store}</span>)}</div>}
        {entry.legacy && <div className="tl-legacy">Latest update only — earlier steps were not recorded before history tracking started.</div>}
      </>} />
  </>;
}

/**
 * Update history of an issue, a multi-store issue or an onboarding record.
 * kind: "issue" (issueId) | "group" (groupId, fromId) | "onboarding" (onboardingId)
 */
export default function HistoryDialog({ kind, issueId, groupId, fromId, onboardingId }) {
  const ctx = useDataContext();
  const { close } = useDialog();

  if (kind === "onboarding") {
    const record = ctx.onboarding.find((item) => item.id === onboardingId);
    if (!record) return null;
    const store = ctx.storeByNum.get(String(record.store_num || ""));
    const owner = store ? ctx.frById.get(store.franchisee_id) : null;
    return <Modal icon="history" modalStyle={{ maxWidth: 640 }} title={`Onboarding updates · Store ${record.store_num} · ${obPlatformName(record.platform)}`} subtitle={owner?.name || ""}
      footer={<><button type="button" className="btn ghost" onClick={close}>Close</button>
        <button type="button" className="btn outline round" onClick={() => { close(); openUpdateOnboarding(record.id); }}><Icon name="refresh-cw" />Update status</button></>}>
      <OnboardingHistory record={record} />
    </Modal>;
  }

  // A single issue that belongs to a multi-store issue shows the whole group.
  let members = [];
  let groupKey = groupId;
  let focusId = fromId;
  if (kind === "issue") {
    const issue = ctx.issues.find((item) => item.id === issueId);
    if (issue?.group_id && ctx.issues.filter((item) => item.group_id === issue.group_id).length > 1) {
      groupKey = issue.group_id;
      focusId = issue.id;
      members = groupMembers(ctx.issues, groupKey);
    } else if (issue) {
      members = [issue];
      groupKey = null;
    }
  } else {
    members = groupMembers(ctx.issues, groupKey);
  }
  if (!members.length) return null;

  const isGroup = !!groupKey;
  const owner = ctx.frById.get(members[0].franchisee_id);
  const title = isGroup ? "Issue updates · Multi-store issue" : `Issue updates · Store ${members[0].store_num || ""}`;
  const subtitle = isGroup ? `${members.length} stores` : owner?.name || "";

  function goToUpdate() {
    close();
    if (isGroup) openGroupUpdate(groupKey, focusId);
    else openUpdateIssue(members[0].id);
  }

  return <Modal icon="history" modalStyle={{ maxWidth: 640 }} title={title} subtitle={subtitle}
    footer={<><button type="button" className="btn ghost" onClick={close}>Close</button>
      <button type="button" className="btn outline round" onClick={goToUpdate}><Icon name="refresh-cw" />Update status</button></>}>
    <IssueHistory ctx={ctx} members={members} />
  </Modal>;
}
