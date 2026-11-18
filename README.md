# Franchisee Tracker

3PD Helpdesk Franchisee Tracker: a React + Vite frontend and a Node (Express) backend API. Data lives in Supabase; only the backend talks to it.

```text
Browser (frontend, React)  ──HTTP /api──▶  backend (Express)  ──▶  Supabase (Postgres)
```

## Project structure

```text
package.json          workspace root: one install and one lockfile for both apps, scripts to run them together
frontend/             React + Vite app (UI, business rules, reports, 3D intro)
  src/                app code (see "How the frontend code is organized" below)
  public/, scripts/   intro models and fonts, and the script that builds them
  docs/INTRO.md       the 3D intro
  .env.example        frontend settings (backend address)
backend/              Express API in front of Supabase
  src/server.js       starts the API (reads backend/.env)
  src/app.js          the Express app: CORS, JSON, routes, error responses
  src/routes/         tables.js (row access), settings.js (app_settings), auth.js (admin password)
  src/db.js           Supabase queries (paged reads, team-safe updates, next free ids…)
  src/tables.js       the tables the API may touch
  test/               API tests (fake database, no network)
  .env.example        backend settings (Supabase, admin password, CORS)
```

## Setup

Needs Node.js 22.9 or newer. From the project folder:

```powershell
npm.cmd install                                   # installs frontend and backend dependencies
Copy-Item backend\.env.example backend\.env       # then fill in the values
Copy-Item frontend\.env.example frontend\.env
```

Using `npm.cmd` in PowerShell avoids the `npm.ps1` execution-policy error without changing your system's script policy.

### Environment variables

`backend/.env` (never committed):

| Variable | What it is |
| --- | --- |
| `PORT` | Port the API listens on (default `4000`). |
| `SUPABASE_URL` | The Supabase project URL. |
| `SUPABASE_PUBLISHABLE_KEY` | The project's publishable (anon) key. The API uses it so the database's row-level security rules apply exactly as before. |
| `ADMIN_PASSWORD` | Password asked before deletes, imports and backup restores. Checked by the API; it is no longer in the browser code. |
| `CORS_ORIGINS` | Comma-separated frontend addresses allowed to call the API (default `http://localhost:5173`). |
| `JSON_LIMIT` | Largest request body (default `25mb`; imports and restores send many rows). |

`frontend/.env`:

| Variable | What it is |
| --- | --- |
| `VITE_API_BASE_URL` | Address of the backend, e.g. `http://localhost:4000`. Leave empty when the API is served from the same address as the app under `/api`. Read at build time. |

## Run locally

```powershell
npm.cmd run dev            # backend (port 4000) and frontend (port 5173) together
npm.cmd run dev:backend    # backend only, restarts on changes
npm.cmd run dev:frontend   # frontend only
npm.cmd run start:backend  # backend without watching (production style)
npm.cmd run build          # frontend production bundle in frontend/dist/
npm.cmd run lint           # ESLint for both
npm.cmd test               # backend API tests
```

Open <http://localhost:5173>. Check the backend with <http://localhost:4000/api/health> (`{"ok":true,"database":true}` when Supabase is reachable).

All libraries (Lucide icons, Excel and PDF export, Supabase on the backend) come from npm. Only the Inter font loads from Google Fonts. The Excel and PDF libraries download on first use.

## Backend API

All responses are JSON. Errors are `{ "error": { "message", "code", "details", "hint" } }`, keeping Supabase's error codes so the app's messages (duplicate store number, missing migration, and so on) still apply. Only the app's tables are allowed: `franchisees`, `stores`, `staff`, `issues`, `onboarding`, `call_logs`, `walmart`, `coverage_snapshots`, `app_settings`.

| Method and path | Does |
| --- | --- |
| `GET /api/health` | API up and database reachable |
| `POST /api/auth/password` `{ password }` | Checks the admin password (401 when wrong) |
| `GET /api/settings/:key` · `PUT /api/settings/:key` `{ value }` | Shared settings (email templates, links, reminders) |
| `GET /api/tables/:table` | Every row |
| `GET /api/tables/:table/rows/:id` | One row (`{ row: null }` when gone) |
| `GET /api/tables/:table/columns/:column` | Whether a column exists (older databases) |
| `POST /api/tables/:table/rows` `{ rows }` | Insert |
| `POST /api/tables/:table/rows/next-ids` `{ rows, select }` | Insert with the next free numeric ids |
| `PUT /api/tables/:table/rows` `{ rows, onConflict }` | Insert or overwrite |
| `PATCH /api/tables/:table/rows/:id` `{ patch, updated_at }` | Team-safe update; 409 when someone saved first |
| `PATCH /api/tables/:table/rows` `{ column, value, patch }` | Update every matching row |
| `DELETE /api/tables/:table/rows` `{ column, value }` or `{ column, values }` | Delete matching rows |
| `POST /api/tables/:table/updated-at` `{ ids }` | Current `updated_at` of several rows |

The API has no login of its own, the same as the app before the split: anyone who can reach it can read and change the data that the publishable key allows.

## 3D intro

When the tracker opens, a 3D animation is its loading screen: a street scene that ends on a two-storey Subway store with red awnings and glass windows showing the inside and **3PD HELPDESK / MGBD** on its roof sign. A circular loading ring with the percentage inside appears beside the animation when it starts, and the tracker opens once the animation has finished and its data has loaded. It also has **Skip intro** (`Esc`) and **Don't show the intro again**. It plays once per browser tab session, and **Settings → Play intro** replays it. Add `?intro=1` to the address to force it to play, or `?intro=0` to turn it off. `npm.cmd run intro:assets -w frontend` rebuilds its models and font. See [frontend/docs/INTRO.md](frontend/docs/INTRO.md) for settings, replacing the models, and accessibility.

## Database updates

Some tabs need a table that older databases don't have yet. Run the matching script once in Supabase (SQL Editor → New query → paste → Run). Each script can safely be run again.

- `migrate-coverage-snapshots.sql` — daily delivery-app coverage snapshots for the Dashboard trends. Until it is run, the coverage card shows today's number without a trend.
- `migrate-walmart.sql` — Walmart tab (Walmart Marketplace onboarding: Awaiting App → Payment Setup → Account Created, plus Exempted). Until it is run, the Walmart tab shows a reminder and other tabs work as before.
- `migrate-onboarding-statuses.sql` — one set of statuses for onboarding and Delivery Platforms (Not enrolled · Work in Progress · Onboarded · Exempted), a one-time sync of the two, and Walmart as an onboarding platform. Until it is run, the app shows the new statuses but saving an onboarding status asks you to run it.

## Deploy

The two parts deploy separately:

- **Frontend (Vercel, static):** set the project's Root Directory to `frontend`, build command `npm run build`, output directory `dist`, and the environment variable `VITE_API_BASE_URL` to the backend's public address.
- **Backend (any Node host):** run `npm install` then `npm run start -w backend` with the variables from `backend/.env.example` set on the host, and `CORS_ORIGINS` set to the frontend's address. `backend/src/app.js` exports the Express app without starting it, for hosts that want the app object.

## How the frontend code is organized

Paths below are inside `frontend/`.

```text
src/
  main.jsx, App.jsx        entry point; App starts the connection, idle refresh and session restore
  config/constants.js      platforms, statuses, page sizes, storage keys, titles
  lib/                     framework-free helpers: formatting, rich text, date periods, storage, errors, Excel loader
  domain/                  business rules on plain data (no React):
    context.js             builds the indexed "data context" (lookups by id / store number, search text, open counts)
    records.js             reading row fields (contacts, platforms, store status, roles…)
    search.js              tab searches (Franchisees / All Stores: own details only; other tabs: #store, @franchisee) and ranking
    issues.js, onboarding.js, calls.js, staff.js
  services/api.js          calls to the backend API (same function names and results as the old direct Supabase access)
  state/                   app state (zustand stores) and actions
    dataStore.js           loaded tables, connection status; useDataContext()
    uiStore.js             tab, search, filters, paging, layout preferences, session save/restore
    dialogStore.js         stack of open dialogs; dialogs.js has a named opener for each dialog
    appActions.js          connect, load, disconnect, backup / restore
    feedback.js, toastStore.js
  reports/                 report engine shared by every report
    reportEngine.js        report state, filtering, summary/group sheets, download
    workbook.js, pdf.js    the report is built once as a plain workbook, then written as .xlsx or .pdf
    definitions/           one file per report type (concerns, onboarding, calls, activity, stores, franchisees, FBC/OM)
    catalog.js             report types and quick reports
  components/
    layout/                app shell, sidebar, top bar, toolbar, workspace
    ui/                    Modal, Icon (+ iconRegistry), Pagination, FilterMenu, RichTextEditor, StorePicker, badges…
    charts/                bars, donut, weekly columns, KPI cards
    dialogs/               DialogHost (renders the dialog stack) and confirm / password / conflict dialogs
  features/                one folder per screen, each with its view, dialogs, selectors (pure) and actions (saves)
    dashboard, search, franchisees, stores, staff, issues, onboarding, ezcater, walmart, calls, reports, settings
  styles/                  stylesheets (unchanged class names)
```

### Conventions

- **Reading data.** Components call `useDataContext()` and pass the context to pure domain or selector functions. Code outside components uses `getContext()`.
- **Saving data.** Feature `*Actions.js` files call `services/api.js`, then update the store with `replaceRow`, `addRows` or `removeRows`. Saves are team-safe: `guardedUpdate` only writes when nobody changed the row first, otherwise the "Someone else changed this" dialog opens.
- **Dialogs.** Open them with the functions in `state/dialogs.js`. Each dialog reads `{ close, setBusy }` from `useDialog()`. `setBusy(true)` pauses the idle auto-refresh while a form has unsaved input.
- **Icons.** Use `<Icon name="store" />`. To add an icon, import it in `components/ui/iconRegistry.js`.
- **Browser storage keys** keep the original `ft2_*` names, so saved settings and report choices carry over.
