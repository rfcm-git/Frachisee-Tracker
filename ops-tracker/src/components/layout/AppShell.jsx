import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import {
  LayoutDashboard, TriangleAlert, Store, SlidersHorizontal, Users, Search, Plus, Menu as MenuIcon,
  X, ChevronDown, Keyboard, ScrollText, LogOut, RotateCcw, UserCog, Database, Clapperboard,
} from "lucide-react";
import { useApp } from "../../state/appContext.js";
import { useHotkeys } from "../../hooks/useHotkeys.js";
import { useQuery } from "../../hooks/useQuery.js";
import { api } from "../../data/index.js";
import { ROLE_BY_ID } from "../../lib/constants.js";
import { Avatar, Button, Kbd } from "../ui/core.jsx";
import { cx } from "../../lib/cx.js";
import { Menu } from "../ui/overlays.jsx";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { playIntro } from "../../intro/settings.js";

export function Logo({ compact = false }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-lg" aria-label="3PD Ops Tracker, go to dashboard">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-600" aria-hidden>
        <svg viewBox="0 0 32 32" className="size-5"><path d="M5 21 12.5 13l5.5 5 9-10" fill="none" stroke="var(--color-mustard)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px] font-bold tracking-tight text-ink">3PD Ops</span>
          <span className="block text-[11px] font-medium text-muted">Subway franchise network</span>
        </span>
      )}
    </Link>
  );
}

function NavItem({ to, icon: Icon, label, count, end, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors duration-150",
          isActive ? "bg-brand-50 text-brand-800" : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-2 bottom-2 -left-3 w-[3px] origin-center animate-fade-in rounded-r bg-brand-600" aria-hidden />}
          <Icon className={cx("size-[18px] shrink-0", isActive ? "text-brand-600" : "text-muted group-hover:text-ink-2")} aria-hidden />
          <span className="flex-1">{label}</span>
          {count > 0 && (
            <span className="rounded-full bg-critical-bg px-1.5 text-[11px] font-semibold text-critical-ink tnum" aria-label={`${count} critical open`}>
              {count}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ onNavigate, criticalCount }) {
  const { openShortcuts } = useApp();
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-6 px-3 py-4">
      <div className="px-2">
        <Logo />
      </div>
      <div className="space-y-0.5">
        <NavItem to="/" end icon={LayoutDashboard} label="Dashboard" onNavigate={onNavigate} />
        <NavItem to="/issues" icon={TriangleAlert} label="Issues" count={criticalCount} onNavigate={onNavigate} />
        <NavItem to="/stores" icon={Store} label="Stores" onNavigate={onNavigate} />
      </div>
      <div>
        <p className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wider text-muted uppercase">Admin</p>
        <div className="space-y-0.5">
          <NavItem to="/settings/platforms" icon={SlidersHorizontal} label="3PD settings" onNavigate={onNavigate} />
          <NavItem to="/settings/users" icon={Users} label="Users" onNavigate={onNavigate} />
        </div>
      </div>
      <div className="mt-auto space-y-2 px-2.5">
        <button type="button" onClick={openShortcuts} className="flex items-center gap-2 rounded-md text-[12px] text-muted hover:text-ink">
          <Keyboard className="size-4" aria-hidden /> Keyboard shortcuts <Kbd>?</Kbd>
        </button>
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <Database className="size-4" aria-hidden />
          {api.kind === "demo" ? "Demo data" : "Supabase"}
        </p>
      </div>
    </nav>
  );
}

function UserMenu() {
  const { user, toast } = useApp();
  const navigate = useNavigate();
  if (!user) return <span className="skeleton size-8 rounded-full" />;
  const items = [
    {
      header: (
        <div>
          <p className="text-sm font-semibold text-ink">{user.name}</p>
          <p className="text-[12px] text-muted">{user.email}</p>
        </div>
      ),
    },
    { divider: true },
    { label: "Team & users", icon: UserCog, onSelect: () => navigate("/settings/users") },
    { label: "3PD settings", icon: SlidersHorizontal, onSelect: () => navigate("/settings/platforms") },
    { label: "Terms of service", icon: ScrollText, onSelect: () => navigate("/terms") },
    { label: "Play intro", icon: Clapperboard, onSelect: playIntro },
    ...(api.kind === "demo"
      ? [{ label: "Reset demo data", icon: RotateCcw, onSelect: () => api.resetDemoData().then(() => toast({ title: "Demo data reset", body: "Issues, users and settings are back to the original sample." })) }]
      : []),
    { divider: true },
    { label: "Sign out", icon: LogOut, onSelect: () => toast({ type: "info", title: "Sign-in isn't set up in demo mode", body: "Connect Supabase Auth to enable sign out." }) },
  ];
  return (
    <Menu
      label="Account and team settings"
      items={items}
      trigger={(props) => (
        <button type="button" {...props} className="flex h-9 items-center gap-2 rounded-lg pr-1.5 pl-1 hover:bg-ink/[0.04]">
          <Avatar name={user.name} />
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-[13px] font-semibold text-ink">{user.name}</span>
            <span className="block text-[11px] text-muted">{ROLE_BY_ID[user.role]?.label}</span>
          </span>
          <ChevronDown className="size-4 text-muted" aria-hidden />
        </button>
      )}
    />
  );
}

function MobileNav({ onClose, criticalCount }) {
  const ref = useRef(null);
  useFocusTrap(ref, onClose, true);
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 animate-fade-in bg-ink/30" onClick={onClose} aria-hidden />
      <aside ref={ref} role="dialog" aria-modal="true" aria-label="Navigation" tabIndex={-1} className="relative h-full w-64 animate-slide-in-left border-r border-line bg-surface outline-none">
        <button type="button" onClick={onClose} className="absolute top-4 right-3 grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5" aria-label="Close navigation">
          <X className="size-4" aria-hidden />
        </button>
        <Sidebar criticalCount={criticalCount} onNavigate={onClose} />
      </aside>
    </div>
  );
}

export function AppShell() {
  const { openPalette, openFlagIssue, openShortcuts } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const issues = useQuery(() => api.listIssues({ status: "active", severity: "critical" }), [], { topics: ["issues"] });

  useHotkeys({
    "mod+k": openPalette,
    "/": openPalette,
    n: () => openFlagIssue(),
    "?": openShortcuts,
    "g d": () => navigate("/"),
    "g i": () => navigate("/issues"),
    "g s": () => navigate("/stores"),
    "g p": () => navigate("/settings/platforms"),
    "g u": () => navigate("/settings/users"),
  });

  // Move focus to the page heading after navigation so screen readers announce it.
  useEffect(() => {
    const h = document.querySelector("main h1");
    if (h && document.activeElement === document.body) h.focus({ preventScroll: true });
  }, [location.pathname]);

  const critical = issues.data?.list.length ?? 0;

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-[var(--shadow-pop)]">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line bg-surface lg:block">
        <Sidebar criticalCount={critical} />
      </aside>
      {navOpen && <MobileNav onClose={() => setNavOpen(false)} criticalCount={critical} />}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setNavOpen(true)} className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-ink/5 lg:hidden" aria-label="Open navigation">
            <MenuIcon className="size-5" aria-hidden />
          </button>
          <div className="lg:hidden"><Logo compact /></div>
          <button
            type="button"
            onClick={openPalette}
            className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-line-strong bg-subtle px-3 text-[13px] text-muted transition-colors hover:border-ink-2/40 hover:text-ink-2 sm:flex"
          >
            <Search className="size-4" aria-hidden />
            <span className="flex-1 text-left">Search stores, issues, pages…</span>
            <Kbd>Ctrl K</Kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" className="sm:hidden" onClick={openPalette} aria-label="Search" icon={Search} />
            <Button variant="primary" icon={Plus} onClick={() => openFlagIssue()} title="Flag an issue (N)">
              <span className="hidden sm:inline">Flag issue</span>
              <span className="sr-only sm:hidden">Flag issue</span>
            </Button>
            <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
            <UserMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] px-4 py-6 outline-none sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {breadcrumb}
        <h1 tabIndex={-1} className="text-[22px] font-semibold tracking-tight text-ink outline-none">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
