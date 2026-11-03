import { useState } from "react";
import { UserPlus, Ellipsis, SearchX, Mail, UserX, UserCheck } from "lucide-react";
import { api } from "../../data/index.js";
import { ValidationError } from "../../data/validation.js";
import { useQuery } from "../../hooks/useQuery.js";
import { useUrlState } from "../../hooks/useUrlState.js";
import { useApp } from "../../state/appContext.js";
import { ROLES, ROLE_BY_ID } from "../../lib/constants.js";
import { fmtRelative } from "../../lib/format.js";
import { PageHeader } from "../../components/layout/AppShell.jsx";
import { Avatar, Button, Card, EmptyState, ErrorState, Skeleton } from "../../components/ui/core.jsx";
import { cx } from "../../lib/cx.js";
import { Field, FilterSelect, Input, SearchInput, Select } from "../../components/ui/forms.jsx";
import { Menu, Modal } from "../../components/ui/overlays.jsx";
import { Pill } from "../../components/ui/badges.jsx";

const STATUS = {
  active: { tone: "good", label: "Active" },
  invited: { tone: "info", label: "Invited" },
  deactivated: { tone: "neutral", label: "Deactivated" },
};

export default function UsersPage() {
  const { user: me, toast } = useApp();
  const [f, setF, reset] = useUrlState({ q: "", role: "all", status: "all" });
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(null);
  const q = useQuery(() => api.listUsers(), [], { topics: ["users"] });
  const isAdmin = me?.role === "admin";

  const query = f.q.trim().toLowerCase();
  const list = (q.data ?? []).filter(
    (u) => (f.role === "all" || u.role === f.role) && (f.status === "all" || u.status === f.status) && (!query || `${u.name} ${u.email} ${u.region}`.toLowerCase().includes(query)),
  );
  const filtered = f.q || f.role !== "all" || f.status !== "all";

  async function update(u, patch, message) {
    setBusy(u.id);
    try {
      await api.updateUser(u.id, patch);
      toast({ title: message });
    } catch (e) {
      toast({ type: "error", title: "Not saved", body: e.message });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Users"
        subtitle="Who can see and act on 3PD data, and what they can change"
        actions={isAdmin && <Button variant="primary" icon={UserPlus} onClick={() => setInviting(true)}>Invite user</Button>}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SearchInput value={f.q} onChange={(v) => setF({ q: v })} label="Search users" placeholder="Name, email or region" className="w-full sm:w-64" />
            <FilterSelect label="Role" value={f.role} onChange={(v) => setF({ role: v })}>
              <option value="all">All roles</option>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </FilterSelect>
            <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ status: v })}>
              <option value="all">Any status</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="deactivated">Deactivated</option>
            </FilterSelect>
            {filtered && <Button size="sm" variant="ghost" onClick={() => reset()}>Clear filters</Button>}
          </div>

          <Card className="overflow-hidden">
            {q.error ? (
              <ErrorState error={q.error} onRetry={q.reload} />
            ) : !q.data ? (
              <div className="space-y-2 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : list.length === 0 ? (
              <EmptyState icon={SearchX} title="No one matches" action={<Button onClick={() => reset()}>Clear filters</Button>}>Try another name, or clear the role and status filters.</EmptyState>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full text-[13px]">
                  <caption className="sr-only">Team members</caption>
                  <thead>
                    <tr className="border-b border-line bg-subtle text-left text-[12px] text-muted">
                      <th scope="col" className="px-5 py-2.5 font-medium">Name</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Role</th>
                      <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">Region</th>
                      <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Status</th>
                      <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">Last active</th>
                      <th scope="col" className="w-12 px-3 py-2.5"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((u) => {
                      const self = u.id === me?.id;
                      return (
                        <tr key={u.id} className={cx("border-b border-line last:border-0", u.status === "deactivated" && "text-muted")}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={u.name} />
                              <div className="min-w-0">
                                <p className="font-medium text-ink">{u.name}{self && <span className="ml-1.5 text-[12px] font-normal text-muted">(you)</span>}</p>
                                <p className="truncate text-[12px] text-muted">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {isAdmin && !self && u.status !== "deactivated" ? (
                              <select
                                aria-label={`Role for ${u.name}`}
                                value={u.role}
                                disabled={busy === u.id}
                                onChange={(e) => update(u, { role: e.target.value }, `${u.name} is now ${ROLE_BY_ID[e.target.value].label}`)}
                                className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15 focus:outline-none"
                              >
                                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                              </select>
                            ) : (
                              <span>{ROLE_BY_ID[u.role]?.label}</span>
                            )}
                          </td>
                          <td className="hidden px-3 py-3 md:table-cell">{u.region}</td>
                          <td className="hidden px-3 py-3 sm:table-cell"><Pill tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Pill></td>
                          <td className="hidden px-3 py-3 text-muted lg:table-cell">{u.lastActive ? fmtRelative(u.lastActive) : "Never signed in"}</td>
                          <td className="px-3 py-3 text-right">
                            {isAdmin && !self && (
                              <Menu
                                label={`Actions for ${u.name}`}
                                items={[
                                  ...(u.status === "invited" ? [{ label: "Resend invite", icon: Mail, onSelect: () => toast({ title: `Invite re-sent to ${u.email}` }) }] : []),
                                  u.status === "deactivated"
                                    ? { label: "Reactivate", icon: UserCheck, onSelect: () => update(u, { status: "active" }, `${u.name} reactivated`) }
                                    : { label: "Deactivate", icon: UserX, danger: true, onSelect: () => setConfirm(u) },
                                ]}
                                trigger={(props) => (
                                  <button type="button" {...props} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink">
                                    <Ellipsis className="size-4" aria-hidden />
                                  </button>
                                )}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <Card as="aside" className="h-fit p-5" aria-labelledby="roles-h">
          <h2 id="roles-h" className="text-[15px] font-semibold text-ink">Roles</h2>
          <dl className="mt-3 space-y-3 text-[13px]">
            {ROLES.map((r) => (
              <div key={r.id}>
                <dt className="font-medium text-ink">{r.label}</dt>
                <dd className="text-muted">{r.desc}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm ? `Deactivate ${confirm.name}?` : ""}
        description="They'll lose access right away. Issues they flagged or own stay in the tracker. You can reactivate them later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} data-autofocus>Cancel</Button>
            <Button variant="danger" loading={busy === confirm?.id} onClick={() => update(confirm, { status: "deactivated" }, `${confirm.name} deactivated`)}>Deactivate</Button>
          </>
        }
      />
    </div>
  );
}

function InviteDialog({ onClose }) {
  const { toast } = useApp();
  const [form, setForm] = useState({ name: "", email: "", role: "om", region: "Orange County" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors(({ [k]: _drop, ...rest }) => rest);
  };
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.inviteUser(form);
      toast({ title: `Invite sent to ${form.email.trim()}`, body: "They'll appear as Invited until they sign in." });
      onClose();
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.fields);
      else toast({ type: "error", title: "Invite not sent", body: err.message });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Invite a teammate"
      description="They'll get an email with a sign-in link."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="invite-form" loading={saving}>Send invite</Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit} noValidate className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name} className="sm:col-span-2">
          <Input value={form.name} onChange={set("name")} autoComplete="off" data-autofocus />
        </Field>
        <Field label="Work email" required error={errors.email} className="sm:col-span-2">
          <Input type="email" value={form.email} onChange={set("email")} autoComplete="off" placeholder="name@company.com" />
        </Field>
        <Field label="Role" required error={errors.role} hint={ROLE_BY_ID[form.role]?.desc}>
          <Select value={form.role} onChange={set("role")}>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </Field>
        <Field label="Region">
          <Select value={form.region} onChange={set("region")}>
            <option>Orange County</option>
            <option>Los Angeles</option>
            <option>SoCal</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
