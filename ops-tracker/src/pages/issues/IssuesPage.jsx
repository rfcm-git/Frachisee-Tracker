import { useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Plus, SearchX, CircleCheck, Paperclip } from "lucide-react";
import { api } from "../../data/index.js";
import { useQuery } from "../../hooks/useQuery.js";
import { useUrlState } from "../../hooks/useUrlState.js";
import { rowKeyDown } from "../../hooks/useRowNav.js";
import { useApp } from "../../state/appContext.js";
import { PLATFORMS, SEVERITIES, ISSUE_CATEGORIES } from "../../lib/constants.js";
import { fmtRelative } from "../../lib/format.js";
import { PageHeader } from "../../components/layout/AppShell.jsx";
import { Button, Card, EmptyState, ErrorState, Skeleton, Avatar } from "../../components/ui/core.jsx";
import { cx } from "../../lib/cx.js";
import { FilterSelect, SearchInput } from "../../components/ui/forms.jsx";
import { SeverityBadge, StatusBadge, PlatformLogo } from "../../components/ui/badges.jsx";
import { IssueDrawer } from "./IssueDrawer.jsx";

const TABS = [
  { id: "active", label: "Active" },
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "waiting", label: "Waiting on 3PD" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];
const DEFAULTS = { status: "active", severity: "all", platform: "all", category: "all", assignee: "all", q: "" };

export default function IssuesPage() {
  const { issueId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { lookups, openFlagIssue, user } = useApp();
  const [f, setF, reset] = useUrlState(DEFAULTS);
  const searchRef = useRef(null);
  const q = useQuery(() => api.listIssues({ ...f, search: f.q }), [f.status, f.severity, f.platform, f.category, f.assignee, f.q], { topics: ["issues"] });
  const userById = Object.fromEntries(lookups.users.map((u) => [u.id, u]));
  const storeById = Object.fromEntries(lookups.stores.map((s) => [s.id, s]));
  const filtered = f.severity !== "all" || f.platform !== "all" || f.category !== "all" || f.assignee !== "all" || f.q;
  const open = (id) => navigate({ pathname: `/issues/${id}`, search: location.search });

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Issues"
        subtitle="3PD order and listing problems flagged across your stores"
        actions={<Button variant="primary" icon={Plus} onClick={() => openFlagIssue()}>Flag issue</Button>}
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Issue status">
        {TABS.map((t) => {
          const active = f.status === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setF({ status: t.id })}
              className={cx(
                "relative -mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[13.5px] font-medium transition-colors",
                active ? "border-brand-600 text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
              {q.data && <span className={cx("rounded-full px-1.5 text-[11px] tnum", active ? "bg-brand-50 text-brand-700" : "bg-ink/[0.05] text-muted")}>{q.data.counts[t.id]}</span>}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput ref={searchRef} value={f.q} onChange={(v) => setF({ q: v })} label="Search issues" placeholder="ID, order #, store, keyword" className="w-full sm:w-64" />
        <FilterSelect label="Severity" value={f.severity} onChange={(v) => setF({ severity: v })}>
          <option value="all">Any severity</option>
          {SEVERITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </FilterSelect>
        <FilterSelect label="Platform" value={f.platform} onChange={(v) => setF({ platform: v })}>
          <option value="all">All platforms</option>
          {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Category" value={f.category} onChange={(v) => setF({ category: v })} className="max-w-[200px]">
          <option value="all">Any category</option>
          {ISSUE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </FilterSelect>
        <FilterSelect label="Assignee" value={f.assignee} onChange={(v) => setF({ assignee: v })}>
          <option value="all">Anyone</option>
          {user && <option value={user.id}>Assigned to me</option>}
          <option value="unassigned">Unassigned</option>
          {lookups.users.filter((u) => u.status === "active" && u.id !== user?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </FilterSelect>
        {filtered && <Button size="sm" variant="ghost" onClick={() => reset("status")}>Clear filters</Button>}
        {q.data && <p className="ml-auto text-[12px] text-muted" aria-live="polite">{q.data.list.length} {q.data.list.length === 1 ? "issue" : "issues"}</p>}
      </div>

      <Card className={cx("overflow-hidden transition-opacity", q.refreshing && "opacity-70")}>
        {q.error ? (
          <ErrorState error={q.error} onRetry={q.reload} />
        ) : !q.data ? (
          <div className="space-y-2 p-5">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : q.data.list.length === 0 ? (
          filtered ? (
            <EmptyState icon={SearchX} title="No issues match these filters" action={<Button onClick={() => reset("status")}>Clear filters</Button>}>
              Try a different store number or widen the severity and platform filters.
            </EmptyState>
          ) : (
            <EmptyState icon={CircleCheck} title={f.status === "resolved" ? "Nothing resolved yet" : "No issues here"} action={<Button variant="primary" icon={Plus} onClick={() => openFlagIssue()}>Flag issue</Button>}>
              When someone flags a 3PD problem it shows up here. Press N to flag one from anywhere.
            </EmptyState>
          )
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-[13px]">
              <caption className="sr-only">Issues. Use arrow keys to move between rows and Enter to open.</caption>
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[12px] text-muted">
                  <th scope="col" className="px-5 py-2.5 font-medium">Issue</th>
                  <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">Severity</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">Assignee</th>
                  <th scope="col" className="hidden px-5 py-2.5 text-right font-medium sm:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody>
                {q.data.list.map((i) => {
                  const store = storeById[i.storeId];
                  const assignee = userById[i.assigneeId];
                  return (
                    <tr
                      key={i.id}
                      data-row
                      tabIndex={0}
                      aria-label={`${i.id}: ${i.title}`}
                      onClick={() => open(i.id)}
                      onKeyDown={(e) => rowKeyDown(e, () => open(i.id))}
                      className={cx("cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-subtle focus-visible:bg-brand-50 focus-visible:outline-none", issueId === i.id && "bg-brand-50")}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5"><PlatformLogo id={i.platformId} /></span>
                          <div className="min-w-0">
                            <p className="font-medium text-ink">
                              {i.title}
                              {i.screenshot && <Paperclip className="ml-1.5 inline size-3.5 text-muted" aria-label="Has screenshot" />}
                            </p>
                            <p className="text-[12px] text-muted">
                              <span className="tnum">{i.id}</span> · #{store?.number} {store?.city} · {i.category}
                              {i.orderId && <> · <span className="tnum">{i.orderId}</span></>}
                            </p>
                            <div className="mt-1.5 md:hidden"><SeverityBadge severity={i.severity} /></div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 md:table-cell"><SeverityBadge severity={i.severity} /></td>
                      <td className="px-3 py-3"><StatusBadge status={i.status} /></td>
                      <td className="hidden px-3 py-3 lg:table-cell">
                        {assignee ? (
                          <span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar name={assignee.name} size="sm" />{assignee.name}</span>
                        ) : (
                          <span className="text-muted">Unassigned</span>
                        )}
                      </td>
                      <td className="hidden px-5 py-3 text-right whitespace-nowrap text-muted sm:table-cell">{fmtRelative(i.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {issueId && <IssueDrawer id={issueId} onClose={() => navigate({ pathname: "/issues", search: location.search })} />}
    </div>
  );
}
