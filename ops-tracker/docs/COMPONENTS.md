# 3PD Ops component library

Everything visible in the app is built from the pieces below. Styling is utility-first (Tailwind v4). All design values live as tokens in [`src/styles/index.css`](../src/styles/index.css) under `@theme`, so a class like `bg-brand-600` or `text-critical-ink` always means the same thing.

**Rule of thumb:** before writing new markup, check this list. If a page needs something new, add it here as a component rather than one-off classes.

---

## 1. Foundations

### Color tokens

| Role | Token (Tailwind class stem) | Use |
|---|---|---|
| Brand | `brand-50 … brand-800` (`brand-600` = #00703c) | Primary buttons, active nav, links, focus ring. Subway green. |
| Mustard | `mustard` (#ffc600) | The logo mark only. |
| Page / surface | `page`, `surface`, `subtle` | App background, cards, table headers and footers. |
| Lines | `line`, `line-strong` | Hairline borders; input borders. |
| Ink | `ink`, `ink-2`, `muted` | Primary text, secondary text, metadata. `muted` is 5.6:1 on white. |
| Status | `good`, `warning`, `serious`, `critical`, each with `-ink` (text) and `-bg` (tint) | **State only** (health, severity, connection). Always paired with an icon and label. |
| Info | `info-ink`, `info-bg` | "Open" status, neutral notices. |
| Chart series | `series-1` blue (Grubhub), `series-2` orange (DoorDash), `series-3` aqua (Uber Eats) | Chart marks. These are slots 1–3 of a colorblind-validated palette (all pairs pass under CVD simulation). |
| Series strong | `series-N-strong` | Platform logo tiles (white text needs ≥ 4.5:1). |

Status colors are never reused as chart series, and chart colors never color text.

### Type

Inter (Google Fonts), falling back to the system UI font. The base is 14px.

| Element | Size / weight |
|---|---|
| Page title (`h1`) | 22px semibold, tight tracking |
| Card title (`h2`) | 15px semibold |
| Body / table | 13–14px regular |
| Metadata | 12px `muted` |
| KPI value | 26px semibold (22px on phones) |

Use `.tnum` (tabular numbers) for any column of figures.

### Spacing, radius, elevation

- 4px grid through Tailwind spacing. Cards pad `px-5 py-4`, pages `px-4 sm:px-6 lg:px-8`, sections `space-y-5`.
- `--radius-card` (12px) for cards, `rounded-lg` (8px) for controls, `rounded-full` for pills.
- `--shadow-card` (barely there) for cards; `--shadow-pop` for menus, dialogs and toasts.

### Motion

Tokens: `--ease-out` for entering, `--ease-in` for leaving. Durations run 150–280ms.

| Class | Used for |
|---|---|
| `animate-fade-up` | A page appearing |
| `animate-pop-in` | Dialogs, menus, toasts |
| `animate-slide-in-right` / `-left` | Drawer / mobile nav |
| `animate-fade-in` | Backdrops, listbox popups |
| `.skeleton` | Loading placeholder shimmer |

Buttons scale to 0.97 on press. `prefers-reduced-motion` cuts every animation to 1ms and stops the shimmer. Nothing waits on an animation before it can be clicked.

### Focus and keyboard

- Global `:focus-visible` ring: 2px `brand-600`, 2px offset.
- Skip link ("Skip to content") is the first tab stop.
- After navigating, focus moves to the page `h1` so screen readers announce the new page.

---

## 2. Core — `src/components/ui/core.jsx`

| Component | Props | Notes |
|---|---|---|
| `Button` | `variant` (`primary` · `secondary` · `ghost` · `danger`), `size` (`sm` · `md` · `icon` · `iconSm`), `icon`, `loading` | `loading` shows a spinner, disables the button and sets `aria-busy`. One `primary` per view region. Icon-only buttons need `aria-label`. |
| `Card` | `as` (default `section`) | Surface container. Has `min-w-0` so it can shrink in grids. |
| `CardHeader` | `title`, `subtitle`, `actions`, `id` | Pass `id` and point the Card's `aria-labelledby` at it. |
| `Skeleton` | `className` (size it) | Shaped like the content it replaces. Used only for the *first* load. |
| `EmptyState` | `icon`, `title`, `children` (help text), `action` | Say why it's empty and what to do next. Filtered-empty and truly-empty get different copy. |
| `ErrorState` | `error`, `onRetry` | `role="alert"`, with a retry button. |
| `Delta` | `value`, `prev`, `goodWhen` (`up`/`down`) | Signed % change. Color is direction × good/bad, always with an arrow icon and screen-reader text. |
| `Avatar` | `name`, `size` | Initials with a tint picked from the name. Decorative (`aria-hidden`). |
| `Kbd` | children | Keyboard key cap. |
| `Spinner` | `label` | `role="status"`. |

`cx(...)` in `src/lib/cx.js` joins class names.

## 3. Status — `src/components/ui/badges.jsx`

Every status shows **icon + label** (never color alone).

| Component | Values |
|---|---|
| `SeverityBadge` | critical · high · medium · low |
| `StatusBadge` | open · in_progress · waiting (on 3PD) · resolved |
| `HealthBadge` | good (Healthy) · watch · critical (At risk) |
| `ConnectionBadge` | online · paused · offline · not_listed · connected · degraded · disconnected |
| `RoleBadge`, `Pill` | `Pill` is the base: `tone`, `icon`, children |
| `PlatformLogo` | `id`, `size` (`sm`/`md`/`lg`). A monogram tile in the platform's color. Decorative; always shown next to the platform name. |
| `PlatformTag` | Logo + name |

**Official logos:** add `public/logos/doordash.svg`, `ubereats.svg`, `grubhub.svg` (and the Subway mark for `Logo` in `AppShell.jsx`), then set `USE_LOGO_FILES = true` in `badges.jsx`. Check the brand guidelines and the merchant agreement before using partner marks.

## 4. Forms — `src/components/ui/forms.jsx`

| Component | Notes |
|---|---|
| `Field` | `label`, `hint`, `error`, `required`. Wires `id`, `aria-invalid` and `aria-describedby` to its single child control. Errors say what's wrong *and* how to fix it. |
| `Input`, `Textarea`, `Select` | Native controls with shared styling; red border when invalid. |
| `Combobox` | Searchable single select (ARIA combobox): type to filter, ↑/↓, Enter, Esc. Options are `{ value, label, search }`. |
| `FilterSelect` | Compact select for filter rows. Turns green when a non-default value is chosen, so active filters stand out. |
| `SearchInput` | Search field with a clear button; Esc clears. |
| `Segmented` | Single choice (radio group). Arrow keys move the choice. Used for date ranges. |
| `Switch` | `role="switch"` with label and description. |

Form pattern: `noValidate` on the `<form>`, validate in the data layer (`src/data/validation.js`), show errors per field, and move focus to the first invalid field.

## 5. Overlays — `src/components/ui/overlays.jsx`

| Component | Notes |
|---|---|
| `Modal` | `variant="center"` (forms, confirmations; a bottom sheet on phones) or `"drawer"` (detail panels over a list). Focus is trapped, Esc and the backdrop close it, and focus returns to the opener. `data-autofocus` on a child picks the first focus. |
| `Menu` | Menu button: ↑/↓/Home/End, Enter, Esc (returns focus). Items are `{ label, icon, onSelect, danger, hint }`, `{ divider: true }` or `{ header: node }`. |
| `ToastViewport` | Rendered by `AppProvider`; call `toast({ type, title, body, action })` from `useApp()`. Success toasts last 5s, errors 8s. `action` gives Undo / View links. |

`useFocusTrap(ref, onClose, open)` in `src/hooks/useFocusTrap.js` powers all of these, plus the command palette and mobile nav. Only the topmost dialog responds to keys.

## 6. Charts — `src/components/charts/charts.jsx`

The rules come from the dataviz method: thin 2px lines, solid hairline gridlines, a legend for 2+ series (none for one), text in ink tokens, and a tooltip on hover *and* keyboard focus.

| Component | Use |
|---|---|
| `Sparkline` | 12-point trend in a KPI tile. Gray line, current point in brand green. |
| `TrendChart` | Daily line chart, one per measure (no dual axes). Crosshair snaps to the day; when focused, ←/→/Home/End step through days. `showTable` swaps in a data table. |
| `Legend` | Line keys for line charts, swatches for bars. |
| `BarList` | Ranked horizontal bars with the value at the tip; optional `onSelect` drill-down. |
| `ShareBar` | One whole split into parts, with a 2px gap between segments. |

Every chart card has a **Chart / Table** toggle, so no value is reachable only by hovering.

## 7. Layout — `src/components/layout/`

| Component | Notes |
|---|---|
| `AppShell` | Sidebar (desktop), focus-trapped slide-in nav (below `lg`), sticky top bar: search trigger, **Flag issue**, and the user/team menu at top right. Registers global shortcuts. |
| `PageHeader` | `title`, `subtitle`, `actions`, `breadcrumb`. The `h1` is focusable for route announcements. |
| `CommandPalette` | Ctrl/⌘ K or `/`. Jumps to pages, stores and issues, and runs actions. |
| `ShortcutsDialog` | `?` |

## 8. Data hooks

| Hook | Notes |
|---|---|
| `useQuery(loader, deps, { topics, intervalMs })` | `loading` only before the first result (show skeletons). On refetch, `refreshing` is true while old data stays visible, dimmed. `topics` re-runs it when the data source reports changes (`issues`, `platforms`, `users`). |
| `useUrlState(defaults)` | Filters live in the URL (shareable, survive reloads). `reset(...keep)` resets in one update. |
| `rowKeyDown` | ↑/↓ between table rows marked `data-row`; Enter opens. |
| `useHotkeys(map)` | Global keys. Ignored while typing or while a dialog is open. |

## 9. Page patterns

- **Filter row:** one row above the content it scopes. Date range first, then dimension filters, then "Clear filters" (only when something is filtered). It scopes everything below it.
- **Lists:** table on desktop. Lower-priority columns hide at smaller breakpoints (`hidden md:table-cell`) and their key info moves into the first cell. Scroll containers are `relative overflow-x-auto`, so screen-reader-only text can't widen the page.
- **Detail:** issues open in a drawer, so the list keeps its place. Stores get a full page (they need room for charts).
- **Saving:** settings forms show "Unsaved changes" and keep Save disabled until something changes. Inline triage controls save immediately and toast with Undo.
