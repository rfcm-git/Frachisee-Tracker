// In-browser data source on generated dummy data. Edits (issues, users,
// settings) are kept in localStorage so the demo survives a reload.

import { generateDataset, buildTodayRows } from "./mockData.js";
import { dashboardModel, storesModel, storeProfileModel, issuesModel } from "./queries.js";
import { validateIssue, validateUser, validateThresholds, ValidationError } from "./validation.js";
import { toISODate } from "../lib/dates.js";

const STORAGE_KEY = "opsTracker.v1";

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

export function createMockSource({ latency = [220, 650], now = () => new Date(), persist = true } = {}) {
  let ds = null;
  const listeners = new Set();

  function load() {
    if (ds) return ds;
    const n = now();
    ds = generateDataset(toISODate(n), n);
    const saved = persist ? readSaved() : null;
    if (saved?.version === 1) {
      if (saved.issues) ds.issues = saved.issues;
      if (saved.users) ds.users = saved.users;
      if (saved.platformSettings) ds.platformSettings = saved.platformSettings;
    }
    return ds;
  }

  function save() {
    if (!persist) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, issues: ds.issues, users: ds.users, platformSettings: ds.platformSettings }));
    } catch {
      /* storage unavailable: edits last for this session only */
    }
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const delay = () => (latency ? wait(latency[0] + Math.random() * (latency[1] - latency[0])) : Promise.resolve());
  const changed = (topic) => listeners.forEach((fn) => fn(topic));
  const withToday = () => {
    const d = load();
    d.todayMetrics = buildTodayRows(d.stores, d.today, now());
    return d;
  };

  return {
    kind: "demo",
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async getCurrentUser() {
      return load().users[0];
    },
    async getLookups() {
      const d = load();
      return { stores: d.stores, franchisees: d.franchisees, users: d.users };
    },
    async getDashboard(params) {
      await delay();
      return dashboardModel(withToday(), { ...params, now: now() });
    },
    async listStores(params) {
      await delay();
      return storesModel(load(), params);
    },
    async getStore(id, params) {
      await delay();
      return storeProfileModel(load(), id, params);
    },
    async listIssues(params) {
      await delay();
      return issuesModel(load(), params);
    },
    async getIssue(id) {
      await delay();
      const d = load();
      const issue = d.issues.find((i) => i.id === id);
      if (!issue) return null;
      return { issue, store: d.stores.find((s) => s.id === issue.storeId) };
    },
    async createIssue(input, userId) {
      const errors = validateIssue(input);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      await delay();
      const d = load();
      const max = d.issues.reduce((m, i) => Math.max(m, Number(i.id.split("-")[1])), 1200);
      const id = `ISS-${max + 1}`;
      const at = now().toISOString();
      const issue = {
        id, storeId: input.storeId, platformId: input.platformId, category: input.category, severity: input.severity,
        status: "open", title: input.title.trim(), description: (input.description ?? "").trim(),
        orderId: input.orderId ? "#" + input.orderId.trim().replace(/^#/, "").toUpperCase() : "",
        reporterId: userId, assigneeId: input.assigneeId || null, createdAt: at, updatedAt: at,
        screenshot: input.screenshot ?? null,
        events: [{ id: `${id}-e0`, at, userId, type: "created", text: "Flagged the issue" }],
      };
      if (issue.assigneeId) issue.events.push({ id: `${id}-e1`, at, userId, type: "assigned", text: "Assigned the issue", meta: issue.assigneeId });
      d.issues = [issue, ...d.issues];
      save();
      changed("issues");
      return issue;
    },
    async updateIssue(id, patch, userId) {
      await delay();
      const d = load();
      const idx = d.issues.findIndex((i) => i.id === id);
      if (idx < 0) throw new Error("This issue no longer exists. Refresh the list.");
      const prev = d.issues[idx];
      const at = now().toISOString();
      const events = [...prev.events];
      const add = (e) => events.push({ id: `${id}-e${events.length}-${Date.now()}`, at, userId, ...e });
      if (patch.status && patch.status !== prev.status) add({ type: "status", text: "Changed status", meta: patch.status });
      if ("assigneeId" in patch && patch.assigneeId !== prev.assigneeId) add({ type: "assigned", text: patch.assigneeId ? "Assigned the issue" : "Unassigned the issue", meta: patch.assigneeId });
      if (patch.severity && patch.severity !== prev.severity) add({ type: "severity", text: "Changed severity", meta: patch.severity });
      if (patch.comment?.trim()) add({ type: "comment", text: patch.comment.trim() });
      const { comment: _comment, ...fields } = patch;
      const next = { ...prev, ...fields, events, updatedAt: at };
      d.issues = d.issues.map((i, k) => (k === idx ? next : i));
      save();
      changed("issues");
      return next;
    },
    async listPlatforms() {
      await delay();
      return load().platformSettings;
    },
    async updatePlatform(id, patch) {
      if (patch.thresholds) {
        const errors = validateThresholds(patch.thresholds);
        if (Object.keys(errors).length) throw new ValidationError(errors);
      }
      await delay();
      const d = load();
      d.platformSettings = d.platformSettings.map((p) => (p.id === id ? { ...p, ...patch, thresholds: { ...p.thresholds, ...(patch.thresholds ?? {}) } } : p));
      save();
      changed("platforms");
      return d.platformSettings.find((p) => p.id === id);
    },
    async testConnection(id) {
      await wait(latency ? 900 : 0);
      const d = load();
      const at = now().toISOString();
      d.platformSettings = d.platformSettings.map((p) => (p.id === id ? { ...p, lastSync: at } : p));
      save();
      changed("platforms");
      const p = d.platformSettings.find((x) => x.id === id);
      return p.connection === "connected"
        ? { ok: true, message: "Connection healthy. Latest data synced." }
        : { ok: false, message: "Reachable, but the last 3 syncs were slow. Data may lag up to 45 minutes." };
    },
    async listUsers() {
      await delay();
      return load().users;
    },
    async inviteUser(input) {
      const d = load();
      const errors = validateUser(input, d.users);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      await delay();
      const user = { id: `u${Date.now()}`, name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role, region: input.region || "SoCal", status: "invited", lastActive: null };
      d.users = [...d.users, user];
      save();
      changed("users");
      return user;
    },
    async updateUser(id, patch) {
      await delay();
      const d = load();
      if (patch.status === "deactivated" && d.users[0].id === id) throw new Error("You can't deactivate your own account.");
      d.users = d.users.map((u) => (u.id === id ? { ...u, ...patch } : u));
      save();
      changed("users");
      return d.users.find((u) => u.id === id);
    },
    async resetDemoData() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      ds = null;
      load();
      changed("all");
    },
  };
}
