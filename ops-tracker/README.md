# 3PD Ops Tracker

An internal dashboard for Subway FBCs, area coaches and OMs. It monitors DoorDash, Uber Eats and Grubhub performance and order issues across franchisee stores.

Built with React 19, React Router 7, Tailwind CSS 4 and Vite 8. Data comes from Supabase (PostgreSQL), or from built-in dummy data when Supabase isn't configured.

This app is separate from the Franchisee Tracker in the repository root. It has its own `package.json` and does not touch that app's database.

## Run it

```powershell
cd ops-tracker
npm.cmd install
npm.cmd run dev        # http://localhost:5180, demo data
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `preview` | Production build / serve it |
| `npm run lint` | ESLint, including React Hooks rules |
| `npm test` | Unit tests (Vitest): metric math, view models, validation |
| `npm run e2e` | Builds, then runs every page at 1440px and 390px in Microsoft Edge (Playwright), with an axe WCAG 2.2 AA scan, a sideways-scroll check and console errors, plus 11 key flows. Screenshots go to `scripts/out/`. |
| `npm run seed` | Prints SQL that loads the dummy data into Supabase |
| `npm run terms` | Regenerates `docs/TERMS-OF-SERVICE.md` from the in-app terms |

## Pages

| Route | Page |
|---|---|
| `/` | **Dashboard.** Today-so-far strip with live listing status, 6 KPI tiles vs. the prior period, orders by platform, platform health against thresholds, stores to watch, and open issues by category. Filters (range, platform, franchisee) live in the URL. Auto-refreshes every 60s. |
| `/issues`, `/issues/:id` | **Issue tracker.** Status tabs with counts, search and filters, a keyboard-navigable table, and a detail drawer with triage (status, severity, assignee; saves with Undo), the screenshot, an activity log and notes. |
| `/stores`, `/stores/:id` | **Stores and store profiles.** Health, live listing status per platform, per-platform metrics against thresholds, orders and error-rate trends, issues, and the store team. |
| `/settings/platforms` | **3PD settings.** Turn platforms on/off (with confirmation), test connections, set thresholds, sync interval and pause alerts. |
| `/settings/users` | **User management.** Invite (with validation), change roles, deactivate/reactivate, filters. |
| `/terms` | Internal terms of service (draft) |

The user/team menu is at top right.

## Keyboard

`Ctrl K` or `/` search · `N` flag issue · `G` then `D`/`I`/`S`/`P`/`U` go to a page · `?` shortcut list · `↑`/`↓` + `Enter` in tables · `←`/`→` on a focused chart · `Esc` closes.

## Connect Supabase

1. Create a **new** Supabase project, then run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor. This creates the tables, RLS policies and an issue-number sequence.
2. Optional demo data: `npm run seed > supabase/seed.sql`, then run that file.
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Users sign in through Supabase Auth. A `profiles` row (role, status) controls what they can do.

Metrics are stored as daily sums per store and platform (`daily_metrics`); the app derives the rates. Whatever syncs data from the 3PD merchant APIs or reports should write to that table and `store_platforms`.

## Code map

```
src/
  styles/index.css      design tokens (@theme), motion, reduced-motion rules
  lib/                  constants, formatting, dates, seeded random, metric math
  data/                 mockData (dummy data), queries (view models), validation,
                        mockSource / supabaseSource (same API), index (picks one)
  hooks/                useQuery, useUrlState, useHotkeys, useFocusTrap, useRowNav
  state/                AppProvider: current user, lookups, toasts, global dialogs
  components/ui         Button, Card, badges, forms, Modal/Menu/Toast
  components/charts     Sparkline, TrendChart, BarList, ShareBar
  components/layout     AppShell, CommandPalette, ShortcutsDialog
  pages/                dashboard, issues, stores, settings, terms
docs/COMPONENTS.md      component library and design rules
docs/TERMS-OF-SERVICE.md
supabase/schema.sql
scripts/                e2e.mjs + flows.mjs (browser checks), export-seed.mjs, terms-md.mjs
```
