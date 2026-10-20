import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { DescPreview, EmptyState, IssueNumber, IssueStatusBadge } from "../../components/ui/common.jsx";
import { useDialog } from "../../components/dialogs/dialogContext.js";
import { historyEntries, isIssueOpen, issueFranchiseeId, issueNumber, normalizeIssueStatus, sortOpenThenRecent } from "../../domain/issues.js";
import { issuePlatforms } from "../../domain/records.js";
import { formatTimestamp } from "../../lib/format.js";
import { oneLine, richHtml } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { DIALOG, findDialog, openFranchiseeInfo, openGroupUpdate, openIssueDetails, openIssueHistory, openLogIssue, openStore, openStoreIssues, openUpdateIssue } from "../../state/dialogs.js";
import { askDeleteIssue } from "./issueActions.js";

const plural = (count, word) => `${count} ${word}${count !== 1 ? "s" : ""}`;

function IssueTable({ ctx, issues, showStore }) {
  return <div className="card" style={{ overflowX: "auto", boxShadow: "none" }}><table className="is-table">
    <thead><tr><th className="c-status">Status</th><th className="c-upd">Updates</th><th className="c-issue">Issue</th>
      {showStore && <th className="c-store">Store</th>}<th className="hide-sm c-logged">Logged</th><th className="c-act">Actions</th></tr></thead>
    <tbody>{issues.map((issue) => {
      const size = issue.group_id ? ctx.issues.filter((item) => item.group_id === issue.group_id).length : 0;
      const steps = historyEntries(issue).length;
      const platforms = issuePlatforms(issue);
      const updated = issue.updated_at && issue.updated_at !== issue.created_at ? formatTimestamp(issue.updated_at) : "";
      return <tr key={issue.id}>
        <td className="c-status"><IssueStatusBadge status={normalizeIssueStatus(issue.status)} /></td>
        <td className="c-upd"><button type="button" className="upd-pill" title={`View all updates (${steps} step${steps !== 1 ? "s" : ""})`} aria-label="View all updates"
          onClick={() => openIssueHistory(issue.id)}><Icon name="history" />{steps}</button></td>
        <td className="c-issue"><div className="ic-top"><IssueNumber number={issueNumber(issue)} />
          {size > 1 && <span className="mtag" title={`Logged to ${size} stores`}><Icon name="layers" />{size} stores</span>}</div>
          <DescPreview html={richHtml(issue.title)} onOpen={() => openIssueDetails(issue.id)} />
          {platforms.length > 0 && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{platforms.join(", ")}</div>}
          {issue.action_taken && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>Last action: {oneLine(issue.action_taken, 120)}</div>}
        </td>
        {showStore && <td className="c-store"><button type="button" className="btn link" style={{ padding: 0, fontWeight: 700 }} title="Show only this store's issues"
          onClick={() => openStoreIssues(issue.store_num || "")}>{String(issue.store_num || "—")}</button></td>}
        <td className="hide-sm muted c-logged" style={{ fontSize: 12 }}>{formatTimestamp(issue.created_at)}{updated && <><br />upd. {updated}</>}</td>
        <td className="c-act"><div className="row-acts">
          <button type="button" className="iconbtn mini" title="Update status" aria-label="Update status"
            onClick={() => (size > 1 ? openGroupUpdate(issue.group_id, issue.id) : openUpdateIssue(issue.id))}><Icon name="refresh-cw" /></button>
          <button type="button" className="iconbtn mini del" title={`Delete issue${size > 1 ? " (this store only)" : ""}`} aria-label="Delete issue"
            onClick={() => askDeleteIssue(issue.id)}><Icon name="trash-2" /></button>
        </div></td>
      </tr>;
    })}</tbody>
  </table></div>;
}

/** All issues of one store (mode "store") or one franchisee (mode "fr"). */
export default function StoreIssuesDialog({ mode, storeNum, franchiseeId }) {
  const ctx = useDataContext();
  const { close } = useDialog();
  const byFranchisee = mode === "fr";

  let issues;
  let title;
  let subtitle;
  let store = null;
  let franchisee = null;
  if (byFranchisee) {
    franchisee = ctx.frById.get(franchiseeId) || null;
    issues = ctx.issues.filter((issue) => (issueFranchiseeId(ctx, issue) || 0) === franchiseeId).sort(sortOpenThenRecent);
    const open = issues.filter(isIssueOpen).length;
    const stores = new Set(issues.map((issue) => String(issue.store_num || ""))).size;
    title = franchisee ? franchisee.name : "Unknown franchisee";
    subtitle = `${plural(stores, "store")} with issues · ${plural(issues.length, "issue")}${open ? ` · ${open} open` : ""}`;
  } else {
    store = ctx.storeByNum.get(storeNum) || null;
    issues = ctx.issues.filter((issue) => String(issue.store_num || "") === storeNum).sort(sortOpenThenRecent);
    const ownerId = store ? store.franchisee_id : issues.find((issue) => issue.franchisee_id)?.franchisee_id;
    const owner = ctx.frById.get(ownerId);
    const open = issues.filter(isIssueOpen).length;
    title = `Store ${storeNum || "—"}`;
    subtitle = `${owner?.name ? `${owner.name} · ` : ""}${plural(issues.length, "issue")}${open ? ` · ${open} open` : ""}`;
  }

  function openInfo() {
    if (byFranchisee) { if (franchisee) openFranchiseeInfo(franchisee.id); return; }
    if (!store) return;
    close();
    const storeWindow = findDialog(DIALOG.store);
    if (!(storeWindow && storeWindow.props.storeId === store.id)) openStore(store.id);
  }

  const canOpen = byFranchisee ? !!franchisee : !!store;
  return <Modal icon="store" modalStyle={{ maxWidth: 920 }} title={title} subtitle={subtitle}
    headExtra={<button type="button" className="btn sm outline round" style={{ marginLeft: "auto" }} disabled={!canOpen} onClick={openInfo}
      title={byFranchisee ? (franchisee ? "Franchisee contact info and support team" : "") : (store ? "Open store information" : "This store is not in the store list")}>
      <Icon name={byFranchisee ? "user-round" : "info"} />{byFranchisee ? "View franchisee information" : "View store information"}</button>}
    footer={<><button type="button" className="btn ghost" onClick={close}>Close</button>
      {!byFranchisee && store && <button type="button" className="btn outline round" onClick={() => openLogIssue(store.id)}><Icon name="plus" />Log issue</button>}</>}>
    {issues.length ? <IssueTable ctx={ctx} issues={issues} showStore={byFranchisee} />
      : <EmptyState icon="circle-check" title={byFranchisee ? "No issues for this franchisee" : "No issues for this store"}>All issues were deleted.</EmptyState>}
  </Modal>;
}
