// Ctrl/Cmd+K (or "/") jump-to: pages, stores, issues and quick actions.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LayoutDashboard, TriangleAlert, Store, SlidersHorizontal, Users, Plus, ScrollText, CornerDownLeft } from "lucide-react";
import { useApp } from "../../state/appContext.js";
import { api } from "../../data/index.js";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { Kbd } from "../ui/core.jsx";
import { cx } from "../../lib/cx.js";

const PAGES = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, hint: "G D" },
  { label: "Issues", to: "/issues", icon: TriangleAlert, hint: "G I" },
  { label: "Stores", to: "/stores", icon: Store, hint: "G S" },
  { label: "3PD settings", to: "/settings/platforms", icon: SlidersHorizontal, hint: "G P" },
  { label: "Users", to: "/settings/users", icon: Users, hint: "G U" },
  { label: "Terms of service", to: "/terms", icon: ScrollText },
];

export function CommandPalette({ open, onClose }) {
  if (!open) return null;
  return <Palette onClose={onClose} />;
}

function Palette({ onClose }) {
  const { lookups, openFlagIssue } = useApp();
  const navigate = useNavigate();
  const ref = useRef(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [issues, setIssues] = useState([]);
  useFocusTrap(ref, onClose, true);

  useEffect(() => {
    let alive = true;
    api.listIssues({ status: "all" }).then((r) => alive && setIssues(r.list));
    return () => {
      alive = false;
    };
  }, []);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const match = (s) => !query || s.toLowerCase().includes(query);
    const groups = [];
    const actions = [{ id: "a-flag", label: "Flag a new issue", icon: Plus, hint: "N", run: () => openFlagIssue() }].filter((a) => match(a.label));
    if (actions.length) groups.push({ name: "Actions", items: actions });
    const pages = PAGES.filter((p) => match(p.label)).map((p) => ({ id: p.to, label: p.label, icon: p.icon, hint: p.hint, run: () => navigate(p.to) }));
    if (pages.length) groups.push({ name: "Pages", items: pages });
    if (query) {
      const stores = lookups.stores
        .filter((s) => match(`${s.number} ${s.name} ${s.franchisee}`))
        .slice(0, 6)
        .map((s) => ({ id: s.id, label: `#${s.number} · ${s.name}`, sub: s.franchisee, icon: Store, run: () => navigate(`/stores/${s.id}`) }));
      if (stores.length) groups.push({ name: "Stores", items: stores });
      const iss = issues
        .filter((i) => match(`${i.id} ${i.title} ${i.orderId}`))
        .slice(0, 6)
        .map((i) => ({ id: i.id, label: `${i.id} · ${i.title}`, icon: TriangleAlert, run: () => navigate(`/issues/${i.id}`) }));
      if (iss.length) groups.push({ name: "Issues", items: iss });
    }
    return groups;
  }, [q, lookups.stores, issues, navigate, openFlagIssue]);

  const flat = results.flatMap((g) => g.items);
  const safeActive = Math.min(active, Math.max(0, flat.length - 1));

  function run(item) {
    onClose();
    item.run();
  }
  function onKeyDown(e) {
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, flat.length - 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
    else if (e.key === "Enter" && flat[safeActive]) (e.preventDefault(), run(flat[safeActive]));
  }

  let n = -1;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-ink/30" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Search and jump to" className="relative w-full max-w-xl animate-pop-in overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-muted" aria-hidden />
          <input
            data-autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={flat[safeActive] ? `${listId}-${safeActive}` : undefined}
            aria-label="Search stores, issues and pages"
            value={q}
            onChange={(e) => (setQ(e.target.value), setActive(0))}
            onKeyDown={onKeyDown}
            placeholder="Search by store #, city, franchisee, issue ID…"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
          {flat.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-muted">
              Nothing matches “{q}”. Try a store number like 10512, a city, or an issue ID like ISS-1204.
            </p>
          )}
          {results.map((g) => (
            <div key={g.name} role="group" aria-label={g.name} className="mb-1">
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{g.name}</p>
              {g.items.map((item) => {
                n += 1;
                const idx = n;
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    id={`${listId}-${idx}`}
                    role="option"
                    aria-selected={idx === safeActive}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => run(item)}
                    className={cx("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13.5px]", idx === safeActive && "bg-brand-50")}
                  >
                    <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                      {item.sub && <span className="ml-2 text-[12px] text-muted">{item.sub}</span>}
                    </span>
                    {idx === safeActive ? <CornerDownLeft className="size-3.5 text-muted" aria-hidden /> : item.hint && <span className="text-[11px] text-muted">{item.hint}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
