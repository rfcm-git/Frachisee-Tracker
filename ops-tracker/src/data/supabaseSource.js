// Supabase data source. Loads tables into the same dataset shape the mock
// source uses, then reuses the pure view-model functions in queries.js.
// Schema: supabase/schema.sql. Row Level Security limits what each user sees.

import { createClient } from "@supabase/supabase-js";
import { dashboardModel, storesModel, storeProfileModel, issuesModel } from "./queries.js";
import { validateIssue, validateUser, validateThresholds, ValidationError } from "./validation.js";
import { HISTORY_DAYS } from "./mockData.js";
import { addDays, toISODate } from "../lib/dates.js";

const CACHE_MS = 60_000;

const store = (r) => ({
  id: r.id, number: r.store_number, name: r.name, city: r.city, state: r.state, region: r.region,
  franchisee: r.franchisee, fbcId: r.fbc_id, areaCoachId: r.area_coach_id, omId: r.om_id,
  phone: r.phone, address: r.address, openedYear: r.opened_year,
});
const metric = (r) => ({
  storeId: r.store_id, platformId: r.platform_id, date: r.date, orders: r.orders, sales: Number(r.sales),
  errorOrders: r.error_orders, cancellations: r.cancellations, ratingSum: Number(r.rating_sum),
  ratingCount: r.rating_count, downtimeMin: r.downtime_min, prepMinSum: r.prep_min_sum,
});
const event = (r) => ({ id: r.id, at: r.created_at, userId: r.user_id, type: r.type, text: r.text, meta: r.meta });
const issue = (r) => ({
  id: r.id, storeId: r.store_id, platformId: r.platform_id, category: r.category, severity: r.severity, status: r.status,
  title: r.title, description: r.description ?? "", orderId: r.order_id ?? "", reporterId: r.reporter_id,
  assigneeId: r.assignee_id, createdAt: r.created_at, updatedAt: r.updated_at, screenshot: r.screenshot_url,
  events: (r.issue_events ?? []).map(event).sort((a, b) => a.at.localeCompare(b.at)),
});
const user = (r) => ({ id: r.id, name: r.full_name, email: r.email, role: r.role, region: r.region, status: r.status, lastActive: r.last_active_at });
const setting = (r) => ({
  id: r.platform_id, enabled: r.enabled, connection: r.connection, syncMinutes: r.sync_minutes,
  thresholds: { errorRate: Number(r.error_rate_threshold), minRating: Number(r.min_rating), downtimeMin: r.downtime_min_threshold },
  alertOnPause: r.alert_on_pause, alertEmail: r.alert_email ?? "", merchantPortal: r.merchant_portal_url ?? "", lastSync: r.last_sync_at,
});

async function all(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

/** Page through a large table (PostgREST caps responses at 1,000 rows by default). */
async function paged(build, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const rows = await all(build().range(from, from + pageSize - 1));
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

export function createSupabaseSource(url, key) {
  const sb = createClient(url, key);
  const listeners = new Set();
  let cache = null;
  let cachedAt = 0;

  async function load(force = false) {
    if (!force && cache && Date.now() - cachedAt < CACHE_MS) return cache;
    const today = toISODate(new Date());
    const since = addDays(today, -HISTORY_DAYS);
    const [stores, metrics, todayMetrics, connections, issues, users, settings] = await Promise.all([
      all(sb.from("stores").select("*").order("store_number")),
      paged(() => sb.from("daily_metrics").select("*").gte("date", since).lt("date", today).order("date")),
      all(sb.from("daily_metrics").select("*").eq("date", today)),
      all(sb.from("store_platforms").select("store_id, platform_id, status, external_id, status_since")),
      all(sb.from("issues").select("*, issue_events(*)").order("created_at", { ascending: false })),
      all(sb.from("profiles").select("*").order("full_name")),
      all(sb.from("platform_settings").select("*")),
    ]);
    cache = {
      today,
      stores: stores.map(store),
      franchisees: [...new Set(stores.map((s) => s.franchisee))].sort(),
      metrics: metrics.map(metric),
      todayMetrics: todayMetrics.map(metric),
      connections: connections.map((c) => ({ storeId: c.store_id, platformId: c.platform_id, status: c.status, externalId: c.external_id, since: c.status_since })),
      issues: issues.map(issue),
      users: users.map(user),
      platformSettings: settings.map(setting),
    };
    cachedAt = Date.now();
    return cache;
  }

  const changed = async (topic) => {
    cachedAt = 0;
    listeners.forEach((fn) => fn(topic));
  };

  async function currentUser() {
    const { data } = await sb.auth.getUser();
    const ds = await load();
    return ds.users.find((u) => u.id === data?.user?.id) ?? ds.users[0];
  }

  return {
    kind: "supabase",
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getCurrentUser: currentUser,
    async getLookups() {
      const d = await load();
      return { stores: d.stores, franchisees: d.franchisees, users: d.users };
    },
    getDashboard: async (p) => dashboardModel(await load(), p),
    listStores: async (p) => storesModel(await load(), p),
    getStore: async (id, p) => storeProfileModel(await load(), id, p),
    listIssues: async (p) => issuesModel(await load(), p),
    async getIssue(id) {
      const d = await load();
      const i = d.issues.find((x) => x.id === id);
      return i ? { issue: i, store: d.stores.find((s) => s.id === i.storeId) } : null;
    },
    async createIssue(input, userId) {
      const errors = validateIssue(input);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      const row = await all(sb.from("issues").insert({
        store_id: input.storeId, platform_id: input.platformId, category: input.category, severity: input.severity,
        title: input.title.trim(), description: input.description?.trim() || null,
        order_id: input.orderId ? "#" + input.orderId.trim().replace(/^#/, "").toUpperCase() : null,
        reporter_id: userId, assignee_id: input.assigneeId || null,
      }).select().single());
      await all(sb.from("issue_events").insert({ issue_id: row.id, user_id: userId, type: "created", text: "Flagged the issue" }));
      await changed("issues");
      return issue(row);
    },
    async updateIssue(id, patch, userId) {
      const fields = {};
      if (patch.status) fields.status = patch.status;
      if ("assigneeId" in patch) fields.assignee_id = patch.assigneeId;
      if (patch.severity) fields.severity = patch.severity;
      const events = [];
      if (patch.status) events.push({ type: "status", text: "Changed status", meta: patch.status });
      if ("assigneeId" in patch) events.push({ type: "assigned", text: patch.assigneeId ? "Assigned the issue" : "Unassigned the issue", meta: patch.assigneeId });
      if (patch.severity) events.push({ type: "severity", text: "Changed severity", meta: patch.severity });
      if (patch.comment?.trim()) events.push({ type: "comment", text: patch.comment.trim() });
      if (Object.keys(fields).length) await all(sb.from("issues").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id));
      if (events.length) await all(sb.from("issue_events").insert(events.map((e) => ({ ...e, issue_id: id, user_id: userId }))));
      await changed("issues");
    },
    listPlatforms: async () => (await load()).platformSettings,
    async updatePlatform(id, patch) {
      if (patch.thresholds) {
        const errors = validateThresholds(patch.thresholds);
        if (Object.keys(errors).length) throw new ValidationError(errors);
      }
      const f = {};
      if ("enabled" in patch) f.enabled = patch.enabled;
      if ("syncMinutes" in patch) f.sync_minutes = patch.syncMinutes;
      if ("alertOnPause" in patch) f.alert_on_pause = patch.alertOnPause;
      if ("alertEmail" in patch) f.alert_email = patch.alertEmail || null;
      if (patch.thresholds) {
        f.error_rate_threshold = patch.thresholds.errorRate;
        f.min_rating = patch.thresholds.minRating;
        f.downtime_min_threshold = patch.thresholds.downtimeMin;
      }
      await all(sb.from("platform_settings").update(f).eq("platform_id", id));
      await changed("platforms");
    },
    async testConnection(id) {
      const { data, error } = await sb.functions.invoke("test-3pd-connection", { body: { platform: id } });
      if (error) return { ok: false, message: "Couldn't reach the sync service. Check the Edge Function logs." };
      await changed("platforms");
      return data;
    },
    listUsers: async () => (await load()).users,
    async inviteUser(input) {
      const d = await load();
      const errors = validateUser(input, d.users);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      // Sending the invite email needs the service role, so it runs in an Edge Function.
      const { error } = await sb.functions.invoke("invite-user", { body: input });
      if (error) throw new Error("The invite wasn't sent. Try again, or ask an admin to check the invite-user function.");
      await changed("users");
    },
    async updateUser(id, patch) {
      const f = {};
      if (patch.role) f.role = patch.role;
      if (patch.status) f.status = patch.status;
      if (patch.region) f.region = patch.region;
      await all(sb.from("profiles").update(f).eq("id", id));
      await changed("users");
    },
    async resetDemoData() {
      await load(true);
      await changed("all");
    },
  };
}
