# Franchisee Tracker

React + Vite front end for the 3PD Helpdesk Franchisee Tracker. Data lives in Supabase.

## Run locally

```powershell
npm install
npm run dev      # development server
npm run lint     # ESLint (includes the React Hooks rules)
npm run build    # production bundle in dist/
npm run preview  # serve the production bundle
```

All libraries (Supabase, Lucide icons, Excel and PDF export) come from npm. Only the Inter font loads from Google Fonts. The Excel and PDF libraries download on first use.

## Deploy to Vercel

Import the repository and use `npm run build` as the build command and `dist` as the output directory.

## How the code is organized

```
src/
  main.jsx, App.jsx        entry point; App starts the connection, idle refresh and session restore
  config/constants.js      platforms, statuses, page sizes, storage keys, titles
  lib/                     framework-free helpers: formatting, rich text, date periods, storage, errors, Excel loader
  domain/                  business rules on plain data (no React):
    context.js             builds the indexed "data context" (lookups by id / store number, search text, open counts)
    records.js             reading row fields (contacts, platforms, store status, roles…)
    search.js              toolbar search (#store, @franchisee, free text) and ranking
    issues.js, onboarding.js, calls.js, staff.js
  services/                Supabase access: client + credentials, paged reads, team-safe saves
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
    dashboard, franchisees, stores, staff, issues, onboarding, calls, reports, settings
  styles/                  stylesheets (unchanged class names)
```

### Conventions

- **Reading data.** Components call `useDataContext()` and pass the context to pure domain or selector functions. Code outside components uses `getContext()`.
- **Saving data.** Feature `*Actions.js` files call `services/api.js`, then update the store with `replaceRow`, `addRows` or `removeRows`. Saves are team-safe: `guardedUpdate` only writes when nobody changed the row first, otherwise the "Someone else changed this" dialog opens.
- **Dialogs.** Open them with the functions in `state/dialogs.js`. Each dialog reads `{ close, setBusy }` from `useDialog()`. `setBusy(true)` pauses the idle auto-refresh while a form has unsaved input.
- **Icons.** Use `<Icon name="store" />`. To add an icon, import it in `components/ui/iconRegistry.js`.
- **Browser storage keys** keep the original `ft2_*` names, so saved settings and report choices carry over.
