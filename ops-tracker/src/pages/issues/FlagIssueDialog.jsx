import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../data/index.js";
import { ValidationError } from "../../data/validation.js";
import { useApp } from "../../state/appContext.js";
import { ISSUE_CATEGORIES, PLATFORMS, SEVERITIES } from "../../lib/constants.js";
import { Modal } from "../../components/ui/overlays.jsx";
import { Button } from "../../components/ui/core.jsx";
import { Field, Input, Select, Textarea, Combobox } from "../../components/ui/forms.jsx";

const EMPTY = { storeId: "", platformId: "", category: "", severity: "medium", title: "", orderId: "", description: "", assigneeId: "" };

export function FlagIssueDialog({ prefill, onClose }) {
  const { lookups, user, toast } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ ...EMPTY, ...prefill });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const formRef = useRef(null);

  const storeOptions = useMemo(
    () => lookups.stores.map((s) => ({ value: s.id, label: `#${s.number} · ${s.name}`, search: `${s.number} ${s.name} ${s.franchisee} ${s.city}`, sub: s.franchisee })),
    [lookups.stores],
  );
  const assignable = lookups.users.filter((u) => u.status === "active");
  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const issue = await api.createIssue(form, user?.id);
      toast({ title: `${issue.id} flagged`, body: issue.title, action: { label: "View issue", onClick: () => navigate(`/issues/${issue.id}`) } });
      onClose();
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.fields);
        // Move focus to the first field that needs attention.
        requestAnimationFrame(() => formRef.current?.querySelector("[aria-invalid=true]")?.focus());
      } else setFormError(err.message || "The issue wasn't saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Flag an issue"
      description="Log a 3PD problem for a store so the right person can follow up."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="flag-issue-form" loading={saving}>Flag issue</Button>
        </>
      }
    >
      <form id="flag-issue-form" ref={formRef} onSubmit={submit} noValidate className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        {formError && <p role="alert" className="rounded-lg bg-critical-bg px-3 py-2 text-[13px] text-critical-ink sm:col-span-2">{formError}</p>}
        <Field label="Store" required error={errors.storeId} className="sm:col-span-2">
          <Combobox
            options={storeOptions}
            value={form.storeId}
            onChange={set("storeId")}
            placeholder="Search store #, city or franchisee"
            renderOption={(o) => (
              <span>
                {o.label} <span className="text-muted">· {o.sub}</span>
              </span>
            )}
            data-autofocus
          />
        </Field>
        <Field label="Platform" required error={errors.platformId}>
          <Select value={form.platformId} onChange={set("platformId")}>
            <option value="">Choose…</option>
            {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Category" required error={errors.category}>
          <Select value={form.category} onChange={set("category")}>
            <option value="">Choose…</option>
            {ISSUE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Summary" required error={errors.title} hint="One line, e.g. “Footlong missing from 3-item order”" className="sm:col-span-2">
          <Input value={form.title} onChange={set("title")} maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Severity" required error={errors.severity}>
          <Select value={form.severity} onChange={set("severity")}>
            {SEVERITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Order ID" error={errors.orderId} hint="Optional">
          <Input value={form.orderId} onChange={set("orderId")} placeholder="#8F3A2C" autoComplete="off" />
        </Field>
        <Field label="Details" hint="What happened, who you spoke to, anything the 3PD said." className="sm:col-span-2">
          <Textarea value={form.description} onChange={set("description")} rows={3} />
        </Field>
        <Field label="Assign to" hint="Leave empty to triage later" className="sm:col-span-2">
          <Select value={form.assigneeId} onChange={set("assigneeId")}>
            <option value="">Unassigned</option>
            {assignable.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
