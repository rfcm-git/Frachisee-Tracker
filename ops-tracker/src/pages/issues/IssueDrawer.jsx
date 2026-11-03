import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, ExternalLink, MessageSquare, CircleDot, UserPlus, Flag, TriangleAlert, SearchX } from "lucide-react";
import { api } from "../../data/index.js";
import { useQuery } from "../../hooks/useQuery.js";
import { useApp } from "../../state/appContext.js";
import { ISSUE_STATUSES, SEVERITIES, STATUS_BY_ID, SEVERITY_BY_ID } from "../../lib/constants.js";
import { fmtDateTime, fmtRelative } from "../../lib/format.js";
import { Modal } from "../../components/ui/overlays.jsx";
import { Button, Skeleton, Avatar, EmptyState, ErrorState } from "../../components/ui/core.jsx";
import { Field, Select, Textarea } from "../../components/ui/forms.jsx";
import { SeverityBadge, StatusBadge, PlatformTag } from "../../components/ui/badges.jsx";

const EVENT_ICON = { created: Flag, status: CircleDot, assigned: UserPlus, severity: TriangleAlert, comment: MessageSquare };

export function IssueDrawer({ id, onClose }) {
  const q = useQuery(() => api.getIssue(id), [id], { topics: ["issues"] });
  const data = q.data;
  return (
    <Modal open onClose={onClose} variant="drawer" title={data ? data.issue.id : "Issue"} description={data ? `${data.issue.category} · flagged ${fmtRelative(data.issue.createdAt)}` : undefined}>
      {q.error ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : data === undefined ? (
        <div className="space-y-4 p-5"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>
      ) : data === null ? (
        <EmptyState icon={SearchX} title="Issue not found">It may have been removed, or the link is wrong. Close this panel to go back to the list.</EmptyState>
      ) : (
        <IssueBody key={data.issue.id} issue={data.issue} store={data.store} />
      )}
    </Modal>
  );
}

function IssueBody({ issue, store }) {
  const { lookups, user, toast } = useApp();
  const [saving, setSaving] = useState(null);
  const [note, setNote] = useState("");
  const statusRef = useRef(null);
  const userById = Object.fromEntries(lookups.users.map((u) => [u.id, u]));
  const assignable = lookups.users.filter((u) => u.status === "active");

  async function save(field, patch, message, undoPatch) {
    setSaving(field);
    try {
      await api.updateIssue(issue.id, patch, user?.id);
      toast({
        title: message,
        action: undoPatch ? { label: "Undo", onClick: () => api.updateIssue(issue.id, undoPatch, user?.id) } : undefined,
      });
      if (field === "note") setNote("");
      // The resolve button disappears; keep keyboard focus inside the panel.
      if (field === "resolve") requestAnimationFrame(() => statusRef.current?.focus());
    } catch (e) {
      toast({ type: "error", title: "Not saved", body: e.message || "Try again in a moment." });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6 px-5 py-5">
      <div>
        <h3 className="text-lg font-semibold text-ink">{issue.title}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SeverityBadge severity={issue.severity} />
          <StatusBadge status={issue.status} />
        </div>
      </div>

      {/* Triage controls save immediately */}
      <div className="grid gap-3 rounded-xl border border-line bg-subtle p-4 sm:grid-cols-3">
        <Field label="Status">
          <Select
            ref={statusRef}
            value={issue.status}
            disabled={saving === "status"}
            onChange={(e) => save("status", { status: e.target.value }, `Status set to ${STATUS_BY_ID[e.target.value].label}`, { status: issue.status })}
          >
            {ISSUE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Severity">
          <Select value={issue.severity} disabled={saving === "severity"} onChange={(e) => save("severity", { severity: e.target.value }, `Severity set to ${SEVERITY_BY_ID[e.target.value].label}`)}>
            {SEVERITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Assignee">
          <Select
            value={issue.assigneeId ?? ""}
            disabled={saving === "assignee"}
            onChange={(e) => save("assignee", { assigneeId: e.target.value || null }, e.target.value ? `Assigned to ${userById[e.target.value]?.name}` : "Unassigned")}
          >
            <option value="">Unassigned</option>
            {assignable.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        {issue.status !== "resolved" && (
          <div className="sm:col-span-3">
            <Button variant="primary" icon={CircleCheck} loading={saving === "resolve"} onClick={() => save("resolve", { status: "resolved" }, `${issue.id} resolved`, { status: issue.status })}>
              Mark resolved
            </Button>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
        <div className="col-span-2">
          <dt className="text-muted">Store</dt>
          <dd>
            <Link to={`/stores/${store.id}`} className="font-medium text-brand-700 hover:underline">#{store.number} {store.name}</Link>
            <span className="text-muted"> · {store.franchisee}</span>
          </dd>
        </div>
        <div><dt className="text-muted">Platform</dt><dd className="mt-0.5"><PlatformTag id={issue.platformId} /></dd></div>
        <div><dt className="text-muted">Order ID</dt><dd className="tnum">{issue.orderId || "–"}</dd></div>
        <div><dt className="text-muted">Flagged by</dt><dd>{userById[issue.reporterId]?.name ?? "–"}</dd></div>
        <div><dt className="text-muted">Flagged</dt><dd>{fmtDateTime(issue.createdAt)}</dd></div>
      </dl>

      {issue.description && (
        <section>
          <h4 className="mb-1.5 text-[13px] font-semibold text-ink">Details</h4>
          <p className="text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{issue.description}</p>
        </section>
      )}

      {issue.screenshot && (
        <section>
          <h4 className="mb-1.5 text-[13px] font-semibold text-ink">Screenshot</h4>
          <figure className="overflow-hidden rounded-xl border border-line">
            <a href={issue.screenshot} target="_blank" rel="noreferrer" className="block bg-subtle" aria-label="Open screenshot full size in a new tab">
              <img src={issue.screenshot} alt={`3PD screenshot attached to ${issue.id}: ${issue.title}`} className="max-h-72 w-full object-contain" loading="lazy" />
            </a>
            <figcaption className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px] text-muted">
              Sample merchant-portal capture
              <ExternalLink className="size-3.5" aria-hidden />
            </figcaption>
          </figure>
        </section>
      )}

      <section aria-labelledby="activity-h">
        <h4 id="activity-h" className="mb-3 text-[13px] font-semibold text-ink">Activity</h4>
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-line">
          {[...issue.events].reverse().map((ev) => {
            const Icon = EVENT_ICON[ev.type] ?? CircleDot;
            const who = userById[ev.userId]?.name ?? "Someone";
            let text = ev.text;
            if (ev.type === "status") text = `Changed status to ${STATUS_BY_ID[ev.meta]?.label ?? ev.meta}`;
            if (ev.type === "assigned") text = ev.meta ? `Assigned to ${userById[ev.meta]?.name ?? "a teammate"}` : "Removed the assignee";
            if (ev.type === "severity") text = `Changed severity to ${SEVERITY_BY_ID[ev.meta]?.label ?? ev.meta}`;
            return (
              <li key={ev.id} className="relative flex gap-3">
                <span className="z-10 grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted"><Icon className="size-3.5" aria-hidden /></span>
                <div className="min-w-0 text-[13px]">
                  {ev.type === "comment" ? (
                    <>
                      <p><span className="font-medium text-ink">{who}</span> <span className="text-muted">added a note · {fmtRelative(ev.at)}</span></p>
                      <p className="mt-1 rounded-lg bg-subtle px-3 py-2 text-ink-2">{text}</p>
                    </>
                  ) : (
                    <p><span className="font-medium text-ink">{who}</span> <span className="text-ink-2">{text.charAt(0).toLowerCase() + text.slice(1)}</span> <span className="text-muted">· {fmtRelative(ev.at)}</span></p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) save("note", { comment: note }, "Note added");
        }}
        className="space-y-2"
      >
        <Field label="Add a note" hint="Calls, 3PD case numbers, what the store said.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.currentTarget.form.requestSubmit()} />
        </Field>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-muted">Ctrl + Enter to post</span>
          <div className="flex items-center gap-2">
            <Avatar name={user?.name} size="sm" />
            <Button type="submit" loading={saving === "note"} disabled={!note.trim()}>Post note</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
