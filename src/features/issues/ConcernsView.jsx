import { useMemo } from "react";
import Icon from "../../components/ui/Icon.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { DescPreview, EmptyState, GroupStatusBadge, IssueNumber } from "../../components/ui/common.jsx";
import { clickableProps } from "../../components/ui/clickable.js";
import { usePaged } from "../../hooks/usePaged.js";
import { useToolbarCount } from "../../hooks/useToolbarCount.js";
import { franchiseeName } from "../../domain/context.js";
import { isIssueOpen, issueNumber, issueStatusClass, lastActivity, normalizeIssueStatus, statusSummary } from "../../domain/issues.js";
import { issuePlatforms } from "../../domain/records.js";
import { searchQuery } from "../../domain/search.js";
import { formatTimestamp } from "../../lib/format.js";
import { richHtml } from "../../lib/richText.js";
import { useDataContext } from "../../state/dataStore.js";
import { openFranchiseeIssues, openGroupHistory, openGroupUpdate, openIssueDetails, openIssueHistory, openStoreIssues } from "../../state/dialogs.js";
import { useUiStore } from "../../state/uiStore.js";
import IssueFilters from "./IssueFilters.jsx";
import { historyCount, issueMatchers, issuesByFranchisee, issuesByIssue, issuesByStore } from "./issueSelectors.js";

const plural = (count, word) => `${count} ${word}${count !== 1 ? "s" : ""}`;

function StatusSummary({ items }) {
  return <div className="ssum">{statusSummary(items).map((item) => <span className="ss" key={item.status}><span className="d" style={{ background: item.color }} />{item.count} {item.shortLabel}</span>)}</div>;
}

function CountCell({ count, open }) {
  return <td className="c-cnt"><span className="cnt-pill">{count}</span>{open > 0 && <span className="muted" style={{ fontSize: 11.5, marginLeft: 6 }}>{open} open</span>}</td>;
}

function OpenDotCell({ open }) {
  return <span className="idot-col" style={{ display: "inline-flex", width: 14 }}>{open ? <span className="idot" title={`${open} issue${open === 1 ? "" : "s"} pending / not resolved`} /> : null}</span>;
}

function ByStoreTable({ rows, ctx }) {
  const { items, pagerProps } = usePaged("is", rows);
  return <div className="card" style={{ overflowX: "auto" }}><table className="is-table"><thead><tr>
    <th className="c-snum">Store #</th><th className="c-cnt">Issues</th><th>Franchisee</th><th className="hide-sm">Status</th><th className="hide-sm c-logged">Last activity</th><th className="c-go" aria-label="Open" />
  </tr></thead><tbody>
    {items.map((row) => <tr className="click" key={row.num || "__none__"} {...clickableProps(() => openStoreIssues(row.num))}>
      <td className="store c-snum"><OpenDotCell open={row.open} />{row.num || "—"}</td>
      <CountCell count={row.items.length} open={row.open} />
      <td>{franchiseeName(ctx, row.franchiseeId) || "—"}</td>
      <td className="hide-sm"><StatusSummary items={row.items} /></td>
      <td className="hide-sm muted c-logged" style={{ fontSize: 12 }}>{formatTimestamp(new Date(row.last).toISOString())}</td>
      <td className="c-go"><Icon name="chevron-right" className="muted" /></td>
    </tr>)}
  </tbody></table><Pagination {...pagerProps} /></div>;
}

function ByFranchiseeTable({ rows, ctx }) {
  const { items, pagerProps } = usePaged("is", rows);
  return <div className="card" style={{ overflowX: "auto" }}><table className="is-table"><thead><tr>
    <th>Franchisee</th><th className="c-cnt">Issues</th><th className="c-cnt">Stores</th><th className="hide-sm">Status</th><th className="hide-sm c-logged">Last activity</th><th className="c-go" aria-label="Open" />
  </tr></thead><tbody>
    {items.map((row) => <tr className="click" key={row.franchiseeId || 0} {...clickableProps(() => openFranchiseeIssues(row.franchiseeId || 0))}>
      <td><OpenDotCell open={row.open} /><b style={{ fontWeight: 600 }}>{franchiseeName(ctx, row.franchiseeId) || "Unknown franchisee"}</b></td>
      <CountCell count={row.items.length} open={row.open} />
      <td className="c-cnt muted" style={{ fontSize: 12.5 }}>{plural(row.stores, "store")}</td>
      <td className="hide-sm"><StatusSummary items={row.items} /></td>
      <td className="hide-sm muted c-logged" style={{ fontSize: 12 }}>{formatTimestamp(new Date(row.last).toISOString())}</td>
      <td className="c-go"><Icon name="chevron-right" className="muted" /></td>
    </tr>)}
  </tbody></table><Pagination {...pagerProps} /></div>;
}

function ByIssueTable({ rows, ctx }) {
  const { items, pagerProps } = usePaged("is", rows);
  return <div className="card" style={{ overflowX: "auto" }}><table className="is-table"><thead><tr>
    <th className="c-status">Status</th><th className="c-upd">Updates</th><th className="c-issue">Issue</th><th className="hide-sm c-store">Store</th><th className="hide-sm">Franchisee</th><th className="hide-sm c-logged">Logged</th><th className="c-go" aria-label="Open" />
  </tr></thead><tbody>
    {items.map((entry) => {
      const group = entry.kind === "group";
      const first = entry.items[0];
      const nums = entry.items.map((issue) => issue.store_num);
      const owners = [...new Set(entry.items.map((issue) => franchiseeName(ctx, issue.franchisee_id)).filter(Boolean))];
      const steps = group ? Math.max(...entry.items.map(historyCount)) : historyCount(first);
      const updated = group ? lastActivity(entry.items) : first.updated_at;
      const open = () => (group ? openGroupUpdate(entry.groupId) : openStoreIssues(first.store_num || ""));
      const platforms = issuePlatforms(first);
      return <tr className="click" key={group ? entry.groupId : first.id} title={group ? "Update this multi-store issue" : "Open this store’s issues"} {...clickableProps(open)}>
        <td className="c-status">{group ? <GroupStatusBadge items={entry.items} /> : <span className={`badge ${issueStatusClass(normalizeIssueStatus(first.status))}`}>{normalizeIssueStatus(first.status)}</span>}</td>
        <td className="c-upd"><button type="button" className="upd-pill" title={`View all updates (${steps} step${steps === 1 ? "" : "s"})`} aria-label="View all updates"
          onClick={(event) => { event.stopPropagation(); if (group) openGroupHistory(entry.groupId); else openIssueHistory(first.id); }}><Icon name="history" />{steps}</button></td>
        <td className="c-issue">
          {group && <span className="mtag"><Icon name="layers" />{entry.items.length} stores</span>}
          <IssueNumber number={issueNumber(first)} suffix={group && entry.items.length > 1 && issueNumber(first) ? ` +${entry.items.length - 1}` : ""} />
          <DescPreview html={richHtml(first.title)} onOpen={() => openIssueDetails(first.id)} />
          {platforms.length > 0 && <><br /><span className="muted" style={{ fontSize: 11.5 }}>{platforms.join(", ")}</span></>}
        </td>
        <td className="hide-sm store c-store" style={group ? { fontSize: 12.5 } : undefined}>
          {group ? `${nums.slice(0, 4).join(", ")}${nums.length > 4 ? ` +${nums.length - 4} more` : ""}` : first.store_num || "—"}</td>
        <td className="hide-sm">{group ? (owners.length > 1 ? `${owners.length} franchisees` : owners[0] || "") : franchiseeName(ctx, first.franchisee_id)}</td>
        <td className="hide-sm muted c-logged" style={{ fontSize: 12 }}>{formatTimestamp(first.created_at)}
          {updated && updated !== first.created_at && <><br />upd. {formatTimestamp(updated)}</>}</td>
        <td className="c-go"><Icon name="chevron-right" className="muted" /></td>
      </tr>;
    })}
  </tbody></table><Pagination {...pagerProps} /></div>;
}

export default function ConcernsView() {
  const ctx = useDataContext();
  const view = useUiStore((state) => state.issueView);
  const filter = useUiStore((state) => state.issueFilter);
  const search = useUiStore((state) => state.search);

  const { rows, countText } = useMemo(() => {
    const matchers = issueMatchers(ctx, filter, searchQuery(search));
    if (view === "fr") {
      const list = issuesByFranchisee(ctx, matchers, filter.sort);
      return { rows: list, countText: `${plural(list.length, "franchisee")} · ${list.filter((row) => row.open).length} with open issues` };
    }
    if (view === "issue") {
      const list = issuesByIssue(ctx, matchers, filter.sort);
      return { rows: list, countText: `${plural(list.length, "issue")} · ${list.filter((entry) => entry.items.some(isIssueOpen)).length} open` };
    }
    const list = issuesByStore(ctx, matchers, filter.sort);
    return { rows: list, countText: `${plural(list.length, "store")} · ${plural(ctx.issues.filter(isIssueOpen).length, "open issue")}` };
  }, [ctx, view, filter, search]);
  useToolbarCount(countText);

  let content;
  if (!ctx.issues.length) content = <EmptyState icon="clipboard-list" title="No issues logged">Use "Log issue" or "Multi-store issue" to add one.</EmptyState>;
  else if (!rows.length) content = <EmptyState icon="search-x" title="No issues match">Try a different search or filter.</EmptyState>;
  else if (view === "fr") content = <ByFranchiseeTable rows={rows} ctx={ctx} />;
  else if (view === "issue") content = <ByIssueTable rows={rows} ctx={ctx} />;
  else content = <ByStoreTable rows={rows} ctx={ctx} />;

  return <><IssueFilters />{content}</>;
}
