import { useState } from "react";
import { ExternalLink, PlugZap } from "lucide-react";
import { api } from "../../data/index.js";
import { ValidationError } from "../../data/validation.js";
import { useQuery } from "../../hooks/useQuery.js";
import { useApp } from "../../state/appContext.js";
import { PLATFORM_BY_ID } from "../../lib/constants.js";
import { fmtRelative } from "../../lib/format.js";
import { PageHeader } from "../../components/layout/AppShell.jsx";
import { Button, Card, ErrorState, Skeleton } from "../../components/ui/core.jsx";
import { Field, Input, Select, Switch } from "../../components/ui/forms.jsx";
import { Modal } from "../../components/ui/overlays.jsx";
import { ConnectionBadge, PlatformLogo } from "../../components/ui/badges.jsx";

export default function PlatformSettingsPage() {
  const q = useQuery(() => api.listPlatforms(), [], { topics: ["platforms"] });
  return (
    <div className="animate-fade-up">
      <PageHeader title="3PD settings" subtitle="Connections, sync and the thresholds that decide when a store needs attention" />
      {q.error ? (
        <Card><ErrorState error={q.error} onRetry={q.reload} /></Card>
      ) : !q.data ? (
        <div className="space-y-5">{[0, 1, 2].map((i) => <Card key={i} className="space-y-4 p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-28 w-full" /></Card>)}</div>
      ) : (
        <div className="space-y-5">
          {q.data.map((p) => <PlatformForm key={p.id + JSON.stringify(toForm(p))} settings={p} />)}
        </div>
      )}
    </div>
  );
}

/** Thresholds are shown in the units people think in (%, stars, minutes). */
const toForm = (s) => ({
  errorRate: String(+(s.thresholds.errorRate * 100).toFixed(2)),
  minRating: String(s.thresholds.minRating),
  downtimeMin: String(s.thresholds.downtimeMin),
  syncMinutes: String(s.syncMinutes),
  alertOnPause: s.alertOnPause,
  alertEmail: s.alertEmail,
});

function PlatformForm({ settings }) {
  const { toast } = useApp();
  const p = PLATFORM_BY_ID[settings.id];
  const [form, setForm] = useState(() => toForm(settings));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const initial = toForm(settings);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors(({ [k]: _drop, ...rest }) => rest);
  };

  async function save(e) {
    e.preventDefault();
    const local = {};
    if (form.alertOnPause && form.alertEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.alertEmail)) local.alertEmail = "Enter a valid email or leave it empty.";
    if (form.alertOnPause && !form.alertEmail.trim()) local.alertEmail = "Add an email so pause alerts have somewhere to go.";
    if (Object.keys(local).length) return setErrors(local);
    setSaving(true);
    try {
      await api.updatePlatform(settings.id, {
        thresholds: { errorRate: Number(form.errorRate) / 100, minRating: Number(form.minRating), downtimeMin: Number(form.downtimeMin) },
        syncMinutes: Number(form.syncMinutes),
        alertOnPause: form.alertOnPause,
        alertEmail: form.alertEmail.trim(),
      });
      toast({ title: `${p.name} settings saved`, body: "Dashboard health and the watchlist now use the new thresholds." });
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.fields);
      else toast({ type: "error", title: "Settings not saved", body: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function setEnabled(enabled) {
    setConfirmDisable(false);
    try {
      await api.updatePlatform(settings.id, { enabled });
      toast({ title: `${p.name} ${enabled ? "turned on" : "turned off"}`, body: enabled ? "Its data is back on the dashboard." : "Its data is hidden from the dashboard and store health until you turn it back on." });
    } catch (err) {
      toast({ type: "error", title: "Couldn't change this", body: err.message });
    }
  }

  async function test() {
    setTesting(true);
    const r = await api.testConnection(settings.id);
    setTesting(false);
    toast({ type: r.ok ? "success" : "info", title: r.ok ? `${p.name} is connected` : `${p.name} is slow`, body: r.message });
  }

  const headingId = `pf-${settings.id}`;
  return (
    <Card as="section" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <PlatformLogo id={settings.id} size="lg" />
          <div>
            <h2 id={headingId} className="text-[15px] font-semibold text-ink">{p.name}</h2>
            <p className="text-[12px] text-muted">Last sync {settings.lastSync ? fmtRelative(settings.lastSync) : "never"} · every {settings.syncMinutes} min</p>
          </div>
          <ConnectionBadge status={settings.enabled ? settings.connection : "not_listed"} />
        </div>
        <div className="flex items-center gap-2">
          <a href={settings.merchantPortal} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink-2 hover:bg-ink/5">
            Merchant portal <ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
          </a>
          <Button size="sm" icon={PlugZap} loading={testing} onClick={test} disabled={!settings.enabled}>Test connection</Button>
        </div>
      </div>

      <div className="px-5 py-4">
        <Switch
          label={`Track ${p.name}`}
          description="When off, this platform is hidden from the dashboard, store health and the watchlist."
          checked={settings.enabled}
          onChange={(v) => (v ? setEnabled(true) : setConfirmDisable(true))}
        />
      </div>

      {settings.enabled && (
        <form onSubmit={save} noValidate className="border-t border-line">
          <fieldset className="px-5 py-4">
            <legend className="sr-only">Alert thresholds</legend>
            <h3 className="text-[13px] font-semibold text-ink">Alert thresholds</h3>
            <p className="mb-3 text-[12px] text-muted">A store is on watch after one breach and at risk after two (or an error rate 1.5× the limit).</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Max order error rate (%)" error={errors.errorRate} hint="Typical: 3–5%">
                <Input type="number" inputMode="decimal" step="0.1" min="0.1" max="50" value={form.errorRate} onChange={set("errorRate")} />
              </Field>
              <Field label="Min avg. rating" error={errors.minRating} hint="1.0 to 5.0">
                <Input type="number" inputMode="decimal" step="0.1" min="1" max="5" value={form.minRating} onChange={set("minRating")} />
              </Field>
              <Field label="Max downtime (min / day)" error={errors.downtimeMin} hint="Paused or offline time">
                <Input type="number" inputMode="numeric" step="5" min="0" max="1440" value={form.downtimeMin} onChange={set("downtimeMin")} />
              </Field>
            </div>
          </fieldset>
          <fieldset className="grid gap-4 border-t border-line px-5 py-4 sm:grid-cols-3">
            <legend className="sr-only">Sync and alerts</legend>
            <Field label="Sync frequency">
              <Select value={form.syncMinutes} onChange={set("syncMinutes")}>
                {[5, 15, 30, 60].map((m) => <option key={m} value={m}>Every {m} minutes</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2 space-y-3">
              <Switch label="Email when a store is paused or goes offline" checked={form.alertOnPause} onChange={set("alertOnPause")} />
              <Field label="Alert email" error={errors.alertEmail} hint="A shared inbox works best">
                <Input type="email" value={form.alertEmail} onChange={set("alertEmail")} placeholder="3pd-alerts@yourcompany.com" disabled={!form.alertOnPause} autoComplete="off" />
              </Field>
            </div>
          </fieldset>
          <div className="flex items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3">
            {dirty && <span className="mr-auto text-[12px] text-warning-ink" role="status">Unsaved changes</span>}
            <Button variant="ghost" disabled={!dirty || saving} onClick={() => (setForm(initial), setErrors({}))}>Discard</Button>
            <Button variant="primary" type="submit" loading={saving} disabled={!dirty}>Save {p.name} settings</Button>
          </div>
        </form>
      )}

      <Modal
        open={confirmDisable}
        onClose={() => setConfirmDisable(false)}
        size="sm"
        title={`Stop tracking ${p.name}?`}
        description="Its orders, ratings and store status will be hidden from the dashboard and store health. Issues already flagged stay in the tracker. You can turn it back on at any time."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDisable(false)} data-autofocus>Keep tracking</Button>
            <Button variant="danger" onClick={() => setEnabled(false)}>Stop tracking</Button>
          </>
        }
      />
    </Card>
  );
}
