import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { GroupStatusBadge, IssueNumber, IssueStatusBadge, ObPlatformTag, ObStatusBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { franchiseeName } from "../../domain/context.js";
import { historyEntries, issueFranchiseeId, issueNumber, normalizeIssueStatus } from "../../domain/issues.js";
import { obFranchiseeId, obHistory, obPlatformName } from "../../domain/onboarding.js";
import { issuePlatforms } from "../../domain/records.js";
import { formatTimestamp } from "../../lib/format.js";
import { richHtml } from "../../lib/richText.js";
import { compareNumbers } from "../../lib/text.js";
import { useDataContext } from "../../state/dataStore.js";
import { openGroupUpdate, openIssueHistory, openOnboardingHistory, openStore, openUpdateIssue, openUpdateOnboarding } from "../../state/dialogs.js";

const steps = (count) => `${count} step${count !== 1 ? "s" : ""}`;

function Field({ label, children }) {
  return <div className="clv-f"><span className="k">{label}</span><span className="v">{children}</span></div>;
}

function Block({ label, html }) {
  return <div className="clv-block"><span className="k">{label}</span><div className="clv-text rt" dangerouslySetInnerHTML={{ __html: html }} /></div>;
}

function StoreField({ num, store }) {
  return <Field label="Store"><b>{num || "—"}</b>{store && <> · {[store.address, store.city].filter(Boolean).join(", ")}</>}</Field>;
}

/** Everything about one issue (all its stores for a multi-store issue) or one onboarding record. */
function issueModel(ctx, id) {
  const issue = ctx.issues.find((item) => item.id === id);
  if (!issue) return null;
  const members = issue.group_id
    ? ctx.issues.filter((item) => item.group_id === issue.group_id).sort((a, b) => compareNumbers(a.store_num, b.store_num)) : [issue];
  const multi = members.length > 1;
  const store = ctx.storeByNum.get(String(issue.store_num || "")) || null;
  const owner = franchiseeName(ctx, issueFranchiseeId(ctx, issue));
  const count = historyEntries(issue).length;
  return {
    store: multi ? null : store,
    title: `${issueNumber(issue) ? `Issue #${issueNumber(issue)}` : "Concern details"}${multi ? " · multi-store" : ""}`,
    subtitle: multi ? `${members.length} stores` : `Store ${issue.store_num || "—"}${owner ? ` · ${owner}` : ""}`,
    history: () => openIssueHistory(issue.id),
    update: () => (multi ? openGroupUpdate(issue.group_id, issue.id) : openUpdateIssue(issue.id)),
    body: <>
      <div className="id-badges">{multi ? <GroupStatusBadge items={members} /> : <IssueStatusBadge status={normalizeIssueStatus(issue.status)} />}
        {multi && <span className="mtag"><Icon name="layers" />{members.length} stores</span>}
        {issuePlatforms(issue).map((platform) => <span className="tag" key={platform}>{platform}</span>)}</div>
      <div className="clv-grid">
        {!multi && <><StoreField num={issue.store_num} store={store} /><Field label="Franchisee">{owner || "—"}</Field></>}
        <Field label="Logged">{formatTimestamp(issue.created_at)}</Field>
        <Field label="Last updated">{formatTimestamp(issue.updated_at || issue.created_at)} · {steps(count)}</Field>
      </div>
      <Block label="Issue description" html={richHtml(issue.title)} />
      {issue.action_taken && <Block label="Last action taken" html={richHtml(issue.action_taken)} />}
      {multi && <div className="clv-block"><span className="k">Stores in this issue</span><div className="id-stores">{members.map((member) => <div className="id-st" key={member.id}>
        <b>{member.store_num}</b><span>{franchiseeName(ctx, issueFranchiseeId(ctx, member)) || "—"}</span>
        <IssueStatusBadge status={normalizeIssueStatus(member.status)} /><IssueNumber number={issueNumber(member)} /></div>)}</div></div>}
    </>,
  };
}

function onboardingModel(ctx, id) {
  const record = ctx.onboarding.find((item) => item.id === id);
  if (!record) return null;
  const store = ctx.storeByNum.get(String(record.store_num || "")) || null;
  const owner = franchiseeName(ctx, obFranchiseeId(ctx, record));
  const size = record.group_id ? ctx.onboarding.filter((item) => item.group_id === record.group_id).length : 1;
  return {
    store,
    title: `Onboarding · ${obPlatformName(record.platform)}`,
    subtitle: `Store ${record.store_num || "—"}${owner ? ` · ${owner}` : ""}`,
    history: () => openOnboardingHistory(record.id),
    update: () => openUpdateOnboarding(record.id),
    body: <>
      <div className="id-badges"><ObPlatformTag platform={record.platform} /><ObStatusBadge status={record.status} />
        {size > 1 && <span className="mtag"><Icon name="layers" />Request · {size}</span>}</div>
      <div className="clv-grid">
        <StoreField num={record.store_num} store={store} />
        <Field label="Franchisee">{owner || "—"}</Field>
        <Field label="Started">{formatTimestamp(record.created_at)}</Field>
        <Field label="Last updated">{formatTimestamp(record.updated_at || record.created_at)} · {steps(obHistory(record).length)}</Field>
      </div>
      <Block label="Onboarding details" html={record.details ? richHtml(record.details) : '<span class="muted">No details written</span>'} />
      {record.last_update && <Block label="Latest update" html={richHtml(record.last_update)} />}
    </>,
  };
}

export default function IssueDetailsDialog({ kind, id }) {
  const ctx = useDataContext();
  const { close } = useDialog();
  const model = kind === "ob" ? onboardingModel(ctx, id) : issueModel(ctx, id);
  if (!model) return null;
  const then = (action) => () => { close(); action(); };

  return <Modal size="wide" icon="file-text" title={model.title} subtitle={model.subtitle} labelledBy="id_title"
    footer={<>
      {model.store && <button type="button" className="btn ghost" style={{ marginRight: "auto" }} onClick={then(() => openStore(model.store.id))}><Icon name="store" />Open store</button>}
      <button type="button" className="btn ghost" onClick={close}>Close</button>
      <button type="button" className="btn outline round" onClick={then(model.history)}><Icon name="history" />View all updates</button>
      <button type="button" className="btn" onClick={then(model.update)}><Icon name="refresh-cw" />Update status</button>
    </>}>
    {model.body}
  </Modal>;
}
